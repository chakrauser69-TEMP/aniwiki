const ANIME = ANIME_DATA;
const ANIME_BY_ID = new Map(ANIME.map(a => [a.id, a]));

const ALL_GENRES = [...new Set(ANIME.flatMap(a => a.genres || []))].sort();
const YEARS = [...new Set(ANIME.map(a => a.year).filter(Boolean))].sort((a, b) => b - a);

const state = {
    theme: localStorage.getItem('theme') || 'dark',
    searchQuery: '',
    browseFilters: { genre: '', year: '', type: '', status: '', rating: '', theme: '', demographic: '', sort: 'members' },
    browsePage: 1,
    topPage: 1,
    mangaBrowsePage: 1,
    currentSection: 'anime',
    hentaiUnlocked: localStorage.getItem('hentai_unlocked') === 'true',
};

let _lastRouteKey = '';
let _memoTopRated = null;
let _memoPopular = null;
let _memoRecent = null;

function safeDecode(s) {
    try { return decodeURIComponent(s); } catch { return s; }
}

function isAdultSection(section) {
    return section === 'hentai';
}

function requireGate(section) {
    if (!isAdultSection(section)) return false;
    if (state.hentaiUnlocked) return false;
    showGate();
    return true;
}

function validYoutubeId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function safeId(id) {
    const n = parseInt(id, 10);
    return Number.isInteger(n) ? n : null;
}

function init() {
    document.documentElement.setAttribute('data-theme', state.theme);
    setupThemeToggle();
    setupSearch();
    setupRouter();
    window.addEventListener('hashchange', render);
    render();
}

function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    btn.setAttribute('aria-pressed', state.theme === 'light' ? 'true' : 'false');
    btn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('theme', state.theme);
        btn.setAttribute('aria-pressed', state.theme === 'light' ? 'true' : 'false');
    });
    if (!state.theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        state.theme = 'light';
        document.documentElement.setAttribute('data-theme', state.theme);
    }
}

function getSection() {
    const hash = location.hash.slice(1) || '/';
    const path = hash.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'anime') return 'anime';
    if (parts[0] === 'manga') return 'manga';
    if (parts[0] === 'manhwa') return 'manhwa';
    if (parts[0] === 'doujin') return 'doujin';
    if (parts[0] === 'hentai') return 'hentai';
    return 'anime';
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-dropdown');
    let debounce;
    let reqToken = 0;

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            const myReq = ++reqToken;
            const q = input.value.trim();
            if (q.length < 2) { dropdown.classList.remove('active'); dropdown.innerHTML = ''; return; }
            const section = getSection();
            let results = [];

            if (section === 'anime') {
                results = searchAnime(q, 8);
            } else if (section === 'hentai') {
                try {
                    const data = await API.doujinSearch(q, 1);
                    if (myReq !== reqToken) return;
                    const galleries = Array.isArray(data) ? data : (data.result || []);
                    results = galleries.slice(0, 8).map(API.parseDoujin).filter(Boolean);
                } catch { results = []; }
            } else {
                try {
                    const data = await API.mangaSearch(q, 8);
                    if (myReq !== reqToken) return;
                    results = data.data.map(API.parseManga).filter(Boolean);
                } catch { results = []; }
            }
            if (myReq !== reqToken) return;

            const routePrefix = section === 'hentai' ? 'doujin' : section;

            if (!results.length) {
                dropdown.innerHTML = `<div class="search-dropdown-item" style="cursor:default"><div><div class="sd-title">No matches</div><div class="sd-meta">Press Enter for full search</div></div></div>`;
            } else {
                dropdown.innerHTML = results.map(a => `
                <div class="search-dropdown-item" role="option" tabindex="0" data-hash="#/${routePrefix}/${a.id}">
                    ${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div style="width:40px;height:56px;background:var(--glass-border);border-radius:6px"></div>'}
                    <div>
                        <div class="sd-title">${esc(a.title)}</div>
                        <div class="sd-meta">${esc(a.type || '')} ${a.year ? '· ' + a.year : ''}</div>
                    </div>
                </div>
            `).join('');
            }
            dropdown.classList.add('active');
            input.setAttribute('aria-expanded', 'true');
        }, 300);
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('[data-hash]');
        if (item) {
            location.hash = item.getAttribute('data-hash');
            dropdown.classList.remove('active');
            input.setAttribute('aria-expanded', 'false');
        }
    });

    dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.hasAttribute('data-hash')) {
            location.hash = e.target.getAttribute('data-hash');
            dropdown.classList.remove('active');
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q) {
                const section = getSection();
                location.hash = `#/${section}/search/${encodeURIComponent(q)}`;
            }
            dropdown.classList.remove('active');
            input.setAttribute('aria-expanded', 'false');
        }
        if (e.key === 'Escape') { dropdown.classList.remove('active'); input.setAttribute('aria-expanded', 'false'); }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) { dropdown.classList.remove('active'); input.setAttribute('aria-expanded', 'false'); }
    });
}

function setupRouter() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-link]');
        if (!el) return;
        const href = el.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        e.preventDefault();
        if (location.hash === href) render();
        else location.hash = href;
    });
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.hasAttribute && e.target.hasAttribute('data-link')) {
            e.preventDefault();
            const href = e.target.getAttribute('href') || e.target.getAttribute('data-hash');
            if (href) location.hash = href;
        }
    });
}

function getRoute() {
    const hash = location.hash.slice(1) || '/';
    const path = hash.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const restSearch = (idx) => safeDecode(parts.slice(idx).join('/'));

    if (parts[0] === 'anime' && parts[1] && parts[1] !== 'search' && parts[1] !== 'browse') return { page: 'anime-article', id: safeId(parts[1]) };
    if (parts[0] === 'manga' && parts[1] && parts[1] !== 'search' && parts[1] !== 'browse') return { page: 'manga-article', id: parts[1] };
    if (parts[0] === 'manhwa' && parts[1] && parts[1] !== 'search' && parts[1] !== 'browse') return { page: 'manga-article', id: parts[1], section: 'manhwa' };
    if (parts[0] === 'doujin' && parts[1] && parts[1] !== 'search' && parts[1] !== 'browse') return { page: 'doujin-article', id: safeId(parts[1]) };
    if (parts[0] === 'hentai' && parts[1] && parts[1] !== 'search' && parts[1] !== 'browse') return { page: 'doujin-article', id: safeId(parts[1]), section: 'hentai' };
    if (parts[0] === 'anime' && parts[1] === 'search' && parts[2]) return { page: 'manga-search', section: 'anime', query: restSearch(2) };
    if (parts[0] === 'manga' && parts[1] === 'search' && parts[2]) return { page: 'manga-search', section: 'manga', query: restSearch(2) };
    if (parts[0] === 'manhwa' && parts[1] === 'search' && parts[2]) return { page: 'manga-search', section: 'manhwa', query: restSearch(2) };
    if (parts[0] === 'doujin' && parts[1] === 'search' && parts[2]) return { page: 'manga-search', section: 'doujin', query: restSearch(2) };
    if (parts[0] === 'hentai' && parts[1] === 'search' && parts[2]) return { page: 'manga-search', section: 'hentai', query: restSearch(2) };
    if (parts[0] === 'anime' && parts[1] === 'browse') return { page: 'manga-browse', section: 'anime' };
    if (parts[0] === 'manga' && parts[1] === 'browse') return { page: 'manga-browse', section: 'manga' };
    if (parts[0] === 'manhwa' && parts[1] === 'browse') return { page: 'manga-browse', section: 'manhwa' };
    if (parts[0] === 'doujin' && parts[1] === 'browse') return { page: 'manga-browse', section: 'doujin' };
    if (parts[0] === 'hentai' && parts[1] === 'browse') return { page: 'manga-browse', section: 'hentai' };
    if (parts[0] === 'search' && parts[1]) return { page: 'search', query: restSearch(1) };
    if (parts[0] === 'browse') return { page: 'browse' };
    if (parts[0] === 'top') return { page: 'top' };
    if (parts[0] === 'bookmarks') return { page: 'bookmarks' };
    if (parts[0] === 'anime') return { page: 'anime' };
    if (parts[0] === 'manga') return { page: 'manga' };
    if (parts[0] === 'manhwa') return { page: 'manhwa' };
    if (parts[0] === 'doujin') return { page: 'doujin' };
    if (parts[0] === 'hentai') return { page: 'hentai' };
    if (parts.length === 0) return { page: 'landing' };
    return { page: 'notfound' };
}

function render() {
    const route = getRoute();
    const app = document.getElementById('app');
    const routeKey = route.page + '|' + (route.section || '') + '|' + (route.id || '') + '|' + (route.query || '');
    const samePage = _lastRouteKey.split('|')[0] === routeKey.split('|')[0] && _lastRouteKey.split('|')[1] === routeKey.split('|')[1];
    _lastRouteKey = routeKey;
    if (!samePage) window.scrollTo(0, 0);

    const dd = document.getElementById('search-dropdown');
    if (dd) dd.classList.remove('active');
    const si = document.getElementById('search-input');
    if (si) si.setAttribute('aria-expanded', 'false');

    document.getElementById('header-search').style.display = route.page === 'landing' ? 'none' : 'flex';

    switch (route.page) {
        case 'landing': renderLanding(app); break;
        case 'anime': renderAnimeHome(app); break;
        case 'anime-article': renderAnimeArticle(app, route.id); break;
        case 'manga': renderMangaHome(app); break;
        case 'manga-article': renderMangaArticle(app, route.id); break;
        case 'manhwa': renderManhwaHome(app); break;
        case 'doujin': renderDoujinHome(app); break;
        case 'doujin-article': renderDoujinArticle(app, route.id, route.section); break;
        case 'hentai': renderHentaiHome(app); break;
        case 'manga-search': renderMangaSearch(app, route.section, route.query); break;
        case 'manga-browse': renderMangaBrowse(app, route.section); break;
        case 'search': renderSearch(app, route.query); break;
        case 'browse': renderBrowse(app); break;
        case 'top': renderTop(app); break;
        case 'bookmarks': renderBookmarks(app); break;
        case 'notfound': renderNotFound(app); break;
        default: renderLanding(app);
    }
}

function renderNotFound(app) {
    app.innerHTML = `<div class="empty-state"><div class="empty-icon">🧭</div><h2>Page not found</h2><p>The link is invalid or was removed.</p><p style="margin-top:16px"><a class="genre-tag" href="#/" data-link>← Back to home</a></p></div>`;
}

const Store = {
    get(k, fb) {
        try {
            const v = localStorage.getItem(k);
            return v ? JSON.parse(v) : fb;
        } catch { return fb; }
    },
    set(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    }
};
const BM_KEY = 'weebwiki_bookmarks_v1';
const HIST_KEY = 'weebwiki_history_v1';

function getBookmarks() {
    const b = Store.get(BM_KEY, { anime: [], manga: [], doujin: [] });
    if (!Array.isArray(b.anime)) b.anime = [];
    if (!Array.isArray(b.manga)) b.manga = [];
    if (!Array.isArray(b.doujin)) b.doujin = [];
    return b;
}
function isBookmarked(section, id) {
    const b = getBookmarks();
    const key = section === 'anime' ? 'anime' : (section === 'doujin' || section === 'hentai' ? 'doujin' : 'manga');
    return b[key].includes(String(id));
}
function toggleBookmark(section, id, title, img) {
    const b = getBookmarks();
    const key = section === 'anime' ? 'anime' : (section === 'doujin' || section === 'hentai' ? 'doujin' : 'manga');
    const sid = String(id);
    const i = b[key].indexOf(sid);
    if (i >= 0) b[key].splice(i, 1);
    else {
        b[key].unshift(sid);
        if (b[key].length > 200) b[key].length = 200;
        if (title) pushHistory(section, id, title, img);
    }
    Store.set(BM_KEY, b);
    render();
}
function pushHistory(section, id, title, img) {
    try {
        let h = Store.get(HIST_KEY, []);
        if (!Array.isArray(h)) h = [];
        h = h.filter(x => !(x.section === section && String(x.id) === String(id)));
        h.unshift({ section, id: String(id), title: title || String(id), img: img || null, ts: Date.now() });
        if (h.length > 20) h.length = 20;
        Store.set(HIST_KEY, h);
    } catch {}
}
function getHistory() {
    const h = Store.get(HIST_KEY, []);
    return Array.isArray(h) ? h : [];
}
function clearHistory() {
    Store.set(HIST_KEY, []);
    render();
}
function shareLink(title) {
    const url = location.href;
    const text = (title ? title + ' — ' : '') + 'WeebWiki';
    if (navigator.share) {
        navigator.share({ title: text, url }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            const b = document.getElementById('share-feedback');
            if (b) { b.textContent = 'Link copied!'; setTimeout(() => { b.textContent = ''; }, 2000); }
        }).catch(() => { prompt('Copy link:', url); });
    } else {
        prompt('Copy link:', url);
    }
}

function renderLanding(app) {
    const hist = getHistory().slice(0, 10);
    const bm = getBookmarks();
    const bmCount = bm.anime.length + bm.manga.length + bm.doujin.length;
    app.innerHTML = `
        <section class="landing">
            <h1 class="landing-title">WeebWiki</h1>
            <p class="landing-subtitle">Your encyclopedia for anime, manga, manhwa & more</p>
            <div class="landing-grid">
                <a href="#/anime" class="landing-card landing-anime" data-link>
                    <div class="landing-card-icon">🎌</div>
                    <div class="landing-card-title">Anime</div>
                    <div class="landing-card-desc">TV, Movie, OVA, ONA</div>
                    <div class="landing-card-count">${ANIME.length.toLocaleString()}+ titles</div>
                </a>
                <a href="#/manga" class="landing-card landing-manga" data-link>
                    <div class="landing-card-icon">📖</div>
                    <div class="landing-card-title">Manga</div>
                    <div class="landing-card-desc">Japanese comics</div>
                    <div class="landing-card-count">60,000+ titles</div>
                </a>
                <a href="#/manhwa" class="landing-card landing-manhwa" data-link>
                    <div class="landing-card-icon">📕</div>
                    <div class="landing-card-title">Manhwa</div>
                    <div class="landing-card-desc">Korean webtoons</div>
                    <div class="landing-card-count">20,000+ titles</div>
                </a>
                <a href="#/doujin" class="landing-card landing-doujin" data-link>
                    <div class="landing-card-icon">🎨</div>
                    <div class="landing-card-title">Doujin</div>
                    <div class="landing-card-desc">SFW fan works</div>
                    <div class="landing-card-count">10,000+ titles</div>
                </a>
                <div class="landing-card landing-hentai" id="hentai-card" role="button" tabindex="0" aria-label="Hentai adult content 18 plus" onclick="handleHentaiClick(event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleHentaiClick(event);}">
                    <div class="landing-card-icon">🔞</div>
                    <div class="landing-card-title">Hentai</div>
                    <div class="landing-card-desc">Adult content (18+)</div>
                    <div class="landing-card-count">100,000+ titles</div>
                    <label class="hentai-toggle" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
                        <input type="checkbox" id="hentai-toggle" aria-label="Unlock adult content" ${state.hentaiUnlocked ? 'checked' : ''} onchange="toggleHentai(this.checked)">
                        <span class="hentai-toggle-track"><span class="hentai-toggle-thumb"></span></span>
                    </label>
                </div>
                <a href="#/bookmarks" class="landing-card landing-bookmarks" data-link style="text-decoration:none">
                    <div class="landing-card-icon">★</div>
                    <div class="landing-card-title">Library</div>
                    <div class="landing-card-desc">Bookmarks & history</div>
                    <div class="landing-card-count">${bmCount} saved${hist.length ? ` · ${hist.length} recent` : ''}</div>
                </a>
            </div>
            ${hist.length ? `
            <section class="section" style="text-align:left;max-width:900px;margin:32px auto 0">
                <div class="section-header">
                    <h2 class="section-title">🕘 Recently viewed</h2>
                    <span><a href="#/bookmarks" class="section-link" data-link>Library →</a> &nbsp;<button class="synopsis-toggle" type="button" onclick="clearHistory()">Clear</button></span>
                </div>
                <div class="anime-grid">${hist.map(h => {
                    const prefix = h.section === 'hentai' ? 'doujin' : h.section;
                    return `<div class="anime-card" role="link" tabindex="0" data-hash="#/${prefix}/${esc(h.id)}" onclick="location.hash='#/${prefix}/${esc(h.id)}'" onkeydown="if(event.key==='Enter'){location.hash='#/${prefix}/${esc(h.id)}'}">
                        <div class="anime-card-img">${h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div style="width:100%;height:100%;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem">📖</div>'}</div>
                        <div class="anime-card-body"><div class="anime-card-title">${esc(h.title)}</div><div class="anime-card-meta">${esc(h.section)}</div></div>
                    </div>`;
                }).join('')}</div>
            </section>` : ''}
        </section>
    `;
}

function handleHentaiClick(event) {
    if (state.hentaiUnlocked) {
        location.hash = '#/hentai';
    } else {
        showGate();
    }
}

function toggleHentai(checked) {
    if (checked) {
        showGate();
    } else {
        state.hentaiUnlocked = false;
        localStorage.removeItem('hentai_unlocked');
    }
}

function showGate() {
    const m = document.getElementById('gate-modal');
    m.classList.add('active');
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    const btn = m.querySelector('.gate-btn-confirm');
    if (btn) setTimeout(() => btn.focus(), 50);
}

function closeGate() {
    document.getElementById('gate-modal').classList.remove('active');
    const toggle = document.getElementById('hentai-toggle');
    if (toggle && !state.hentaiUnlocked) toggle.checked = false;
}

function confirmGate() {
    const rememberEl = document.getElementById('gate-remember');
    const remember = rememberEl && rememberEl.checked;
    state.hentaiUnlocked = true;
    if (remember) localStorage.setItem('hentai_unlocked', 'true');
    document.getElementById('gate-modal').classList.remove('active');
    const toggle = document.getElementById('hentai-toggle');
    if (toggle) toggle.checked = true;
    location.hash = '#/hentai';
}

document.addEventListener('keydown', (e) => {
    const m = document.getElementById('gate-modal');
    if (m && m.classList.contains('active') && e.key === 'Escape') closeGate();
});
document.addEventListener('click', (e) => {
    const m = document.getElementById('gate-modal');
    if (m && m.classList.contains('active') && e.target === m) closeGate();
});

async function renderMangaHome(app) {
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.mangaList(20, 0);
        const manga = data.data.map(API.parseManga).filter(Boolean);
        const topManga = manga.filter(m => m.synopsis).slice(0, 10);

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">📖 Popular Manga</h2>
                    <a href="#/manga/browse" class="section-link" data-link>Browse all →</a>
                </div>
                ${topManga.length ? `<div class="anime-grid">${topManga.map(m => mangaCard(m, 'manga')).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">📖</div><h2>No manga right now</h2><p>Try again later</p></div>`}
            </section>
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">🏷️ Browse by Genre</h2>
                </div>
                <div class="genre-cloud">${['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'].map(g => `<button type="button" class="genre-tag" data-hash="#/manga/browse?genre=${encodeURIComponent(g)}" onclick="location.hash='#/manga/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</button>`).join('')}</div>
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><h2>Failed to load manga</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button> <a class="genre-tag" href="#/" data-link>Home</a></p></div>`;
    }
}

async function renderManhwaHome(app) {
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.mangaList(20, 0, { countryOfOrigin: 'KR' });
        const manhwa = data.data.map(API.parseManga).filter(Boolean);
        const topManhwa = manhwa.filter(m => m.synopsis).slice(0, 10);

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">📕 Popular Manhwa</h2>
                    <a href="#/manhwa/browse" class="section-link" data-link>Browse all →</a>
                </div>
                ${topManhwa.length ? `<div class="anime-grid">${topManhwa.map(m => mangaCard(m, 'manhwa')).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">📕</div><h2>No manhwa right now</h2><p>Try again later</p></div>`}
            </section>
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">🏷️ Browse by Genre</h2>
                </div>
                <div class="genre-cloud">${['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'].map(g => `<button type="button" class="genre-tag" onclick="location.hash='#/manhwa/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</button>`).join('')}</div>
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">📕</div><h2>Failed to load manhwa</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

async function renderDoujinHome(app) {
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.mangaList(20, 0, { tagId: API.DOUJINSHI_TAG_ID });
        const doujins = data.data.map(API.parseManga).filter(Boolean);
        const topDoujins = doujins.filter(d => d.synopsis).slice(0, 10);

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">🎨 Popular Doujinshi (SFW)</h2>
                    <a href="#/doujin/browse" class="section-link" data-link>Browse all →</a>
                </div>
                ${topDoujins.length ? `<div class="anime-grid">${topDoujins.map(m => mangaCard(m, 'doujin')).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🎨</div><h2>No doujinshi right now</h2><p>Try again later</p></div>`}
            </section>
            <section class="section">
                <div class="section-header">
                    <h2 class="section-title">🏷️ Browse by Genre</h2>
                </div>
                <div class="genre-cloud">${['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'].map(g => `<button type="button" class="genre-tag" onclick="location.hash='#/doujin/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</button>`).join('')}</div>
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🎨</div><h2>Failed to load doujins</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

async function renderHentaiHome(app) {
    if (requireGate('hentai')) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔞</div><h2>Adult content locked</h2><p>Confirm you are 18+ to view.</p><p style="margin-top:16px"><button type="button" class="gate-btn gate-btn-confirm" onclick="showGate()">Unlock 18+</button></p></div>`;
        return;
    }
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.doujinPopular(1);
        const galleries = Array.isArray(data) ? data : (data.result || []);
        const hentai = galleries.map(API.parseDoujin).filter(Boolean);
        const topHentai = hentai.filter(h => h.title).slice(0, 10);

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">🔞 Popular Hentai</h2>
                    <a href="#/hentai/browse" class="section-link" data-link>Browse all →</a>
                </div>
                ${topHentai.length ? `<div class="anime-grid">${topHentai.map(h => doujinCard(h, 'hentai')).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🔞</div><h2>No results</h2><p>Try again later</p></div>`}
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔞</div><h2>Failed to load hentai</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

async function renderMangaSearch(app, section, query) {
    if (requireGate(section)) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔞</div><h2>Adult content locked</h2><p>Confirm you are 18+ to search.</p><p style="margin-top:16px"><button type="button" class="gate-btn gate-btn-confirm" onclick="showGate()">Unlock 18+</button></p></div>`;
        return;
    }
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    const myQuery = query;
    try {
        let results = [];
        if (section === 'anime') {
            results = searchAnime(myQuery, 100);
            app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">Search results for "${esc(myQuery)}"</h2>
                </div>
                <p class="results-count">${results.length} result${results.length !== 1 ? 's' : ''} found</p>
                ${results.length ? `<div class="anime-grid">${results.map(m => animeCard(m)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🔍</div><h2>No results found</h2><p>Try a different search term</p></div>`}
            </section>
        `;
            return;
        }
        if (section === 'hentai') {
            const data = await API.doujinSearch(myQuery, 1);
            const galleries = Array.isArray(data) ? data : (data.result || []);
            results = galleries.map(API.parseDoujin).filter(Boolean);
        } else {
            const data = await API.mangaSearch(myQuery, 30);
            results = data.data.map(API.parseManga).filter(Boolean);
        }

        const routePrefix = section === 'hentai' ? 'doujin' : section;

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">Search results for "${esc(myQuery)}"</h2>
                </div>
                <p class="results-count">${results.length} result${results.length !== 1 ? 's' : ''} found</p>
                ${results.length ? `<div class="anime-grid">${results.map(m => section === 'hentai' ? doujinCard(m, 'hentai') : mangaCard(m, section)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🔍</div><h2>No results found</h2><p>Try a different search term</p></div>`}
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h2>Search failed</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

const ANILIST_STATUS = { FINISHED: 'Finished', RELEASING: 'Releasing', NOT_YET_RELEASED: 'Not yet released', HIATUS: 'Hiatus', CANCELLED: 'Cancelled' };

async function renderMangaBrowse(app, section) {
    if (requireGate(section)) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔞</div><h2>Adult content locked</h2><p>Confirm you are 18+ to browse.</p><p style="margin-top:16px"><button type="button" class="gate-btn gate-btn-confirm" onclick="showGate()">Unlock 18+</button></p></div>`;
        return;
    }
    if (section === 'anime') { renderBrowse(app); return; }
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const genre = params.get('genre') || '';
    const status = params.get('status') || '';
    const sort = params.get('sort') || 'followedCount';
    const pageParam = parseInt(params.get('page') || '1', 10);
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner" aria-hidden="true"></div><span class="sr-only">Loading…</span></div>`;
    try {
        let items = [];
        let isHentai = section === 'hentai';
        if (isHentai) {
            const data = await API.doujinPopular(page);
            const galleries = Array.isArray(data) ? data : (data.result || []);
            items = galleries.map(API.parseDoujin).filter(Boolean);
            if (genre) items = items.filter(h => (h.tags || []).some(t => t.toLowerCase().includes(genre.toLowerCase())));
        } else {
            let filters = {};
            if (section === 'manhwa') filters.countryOfOrigin = 'KR';
            if (section === 'doujin') filters.tagId = API.DOUJINSHI_TAG_ID;
            if (genre) filters.genre = genre;
            if (status && ANILIST_STATUS[status]) filters.status = status;

            const perPage = 30;
            const offset = (page - 1) * perPage;
            const data = await API.mangaList(perPage, offset, filters);
            items = data.data.map(API.parseManga).filter(Boolean);
        }

        switch (sort) {
            case 'title': items.sort((a, b) => a.title.localeCompare(b.title)); break;
            case 'year': items.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
            default: break;
        }

        const titleMap = { manga: 'Manga', manhwa: 'Manhwa', doujin: 'Doujinshi (SFW)', hentai: 'Hentai' };
        const iconMap = { manga: '📖', manhwa: '📕', doujin: '🎨', hentai: '🔞' };

        app.innerHTML = `
            <section class="section" style="margin-top:0">
                <div class="section-header">
                    <h2 class="section-title">${iconMap[section] || '📖'} Browse ${titleMap[section] || 'Manga'}</h2>
                </div>
                <div class="browse-filters">
                    <div class="filter-group">
                        <label for="mb-genre">Genre</label>
                        <select id="mb-genre" onchange="updateMangaBrowse('${esc(section)}', 'genre', this.value)">
                            <option value="">All</option>
                            ${['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'].map(g => `<option value="${esc(g)}" ${g === genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}
                        </select>
                    </div>
                    ${!isHentai ? `
                    <div class="filter-group">
                        <label for="mb-status">Status</label>
                        <select id="mb-status" onchange="updateMangaBrowse('${esc(section)}', 'status', this.value)">
                            <option value="">All</option>
                            ${Object.entries(ANILIST_STATUS).map(([v, l]) => `<option value="${esc(v)}" ${v === status ? 'selected' : ''}>${esc(l)}</option>`).join('')}
                        </select>
                    </div>` : ''}
                    <div class="filter-group">
                        <label for="mb-sort">Sort</label>
                        <select id="mb-sort" onchange="updateMangaBrowse('${esc(section)}', 'sort', this.value)">
                            <option value="followedCount" ${sort === 'followedCount' ? 'selected' : ''}>Popularity</option>
                            <option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option>
                            <option value="year" ${sort === 'year' ? 'selected' : ''}>Year</option>
                        </select>
                    </div>
                </div>
                <p class="results-count">Page ${page} · ${items.length} items</p>
                ${items.length ? `<div class="anime-grid">${items.map(m => isHentai ? doujinCard(m, 'hentai') : mangaCard(m, section)).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">📭</div><h2>No items found</h2><p>Try adjusting your filters</p></div>'}
                <div class="pagination">
                    <button type="button" class="page-btn" onclick="updateMangaBrowse('${esc(section)}','page','${page - 1}')" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">←</button>
                    <span class="results-count" style="margin:0" aria-current="page">Page ${page}</span>
                    <button type="button" class="page-btn" onclick="updateMangaBrowse('${esc(section)}','page','${page + 1}')" ${items.length < 30 ? 'disabled' : ''} aria-label="Next page">→</button>
                </div>
            </section>
        `;
    } catch (e) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><h2>Failed to load</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

function renderChapterSection(manga) {
    const raw = (typeof MANGA_CHAPTERS !== 'undefined' && MANGA_CHAPTERS[String(manga.id)]) || null;
    const entry = raw ? { ...raw, ch: (raw.ch || []).filter(c => c.c !== null && c.c !== undefined && String(c.c).trim() !== '') } : null;
    if (!entry || !entry.ch || !entry.ch.length) {
        return `<div style="margin-top:24px"><h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Chapters</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary)">${manga.chapters ? `Total: ${manga.chapters} chapters` : 'Chapter list unavailable for this title.'}${manga.volumes ? ` · ${manga.volumes} volumes` : ''}</p></div>`;
    }
    const show = 15;
    const safeUrl = (entry.u && entry.u.startsWith('https://')) ? entry.u : '#';
    const rows = entry.ch.slice(0, entry.ch.length > show ? 60 : entry.ch.length).map(c => `
        <a class="ch-row" href="${esc(safeUrl)}" target="_blank" rel="noopener">
            <span class="ch-num">Ch ${esc(String(c.c ?? '?'))}</span>
            ${c.v ? `<span class="ch-vol">Vol ${esc(String(c.v))}</span>` : ''}
            ${c.g ? `<span class="ch-group">${esc(c.g)}</span>` : ''}
            ${c.d ? `<span class="ch-date">${esc(c.d)}</span>` : ''}
        </a>`).join('');
    return `<div style="margin-top:24px"><h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Chapters (${entry.ch.length}) · updated ${esc(entry.updated)}</h3>
        <div class="ch-list collapsed" id="ch-list">${rows}</div>
        ${entry.ch.length > show ? `<button type="button" class="synopsis-toggle" id="ch-toggle" aria-expanded="false" onclick="toggleChapters()">Show all ${entry.ch.length} chapters</button>` : ''}
    </div>`;
}

function toggleChapters() {
    const list = document.getElementById('ch-list');
    const btn = document.getElementById('ch-toggle');
    if (!list || !btn) return;
    const expanded = list.classList.toggle('expanded');
    list.classList.toggle('collapsed', !expanded);
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.textContent = expanded ? 'Show less' : `Show all ${list.children.length} chapters`;
}

function updateMangaBrowse(section, key, value) {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (key === 'page' && (value === '1' || value === 1)) params.delete('page');
    else if (value && value !== '') params.set(key, value); else params.delete(key);
    if (key !== 'page') params.delete('page');
    location.hash = `#/${section}/browse${params.toString() ? '?' + params.toString() : ''}`;
}

function renderAnimeHome(app) {
    if (!_memoTopRated) {
        _memoTopRated = [...ANIME].filter(a => a.score).sort((a, b) => b.score - a.score).slice(0, 10);
        _memoPopular = [...ANIME].sort((a, b) => (b.members || 0) - (a.members || 0)).slice(0, 10);
        const curYear = new Date().getFullYear();
        _memoRecent = [...ANIME].filter(a => a.year >= curYear - 3).sort((a, b) => (b.members || 0) - (a.members || 0)).slice(0, 10);
    }
    const topRated = _memoTopRated;
    const popular = _memoPopular;
    const recent = _memoRecent;

    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">🏆 Top Rated Anime</h2>
                <a href="#/top" class="section-link" data-link>View all →</a>
            </div>
            <div class="anime-grid">${topRated.map(a => animeCard(a)).join('')}</div>
        </section>
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">🔥 Most Popular</h2>
            </div>
            <div class="anime-grid">${popular.map(a => animeCard(a)).join('')}</div>
        </section>
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">📅 Recent & Trending</h2>
            </div>
            <div class="anime-grid">${recent.map(a => animeCard(a)).join('')}</div>
        </section>
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">🏷️ Browse by Genre</h2>
                <a href="#/browse" class="section-link" data-link>All filters →</a>
            </div>
            <div class="genre-cloud">${ALL_GENRES.slice(0, 30).map(g => `<button type="button" class="genre-tag" onclick="location.hash='#/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</button>`).join('')}</div>
        </section>
    `;
}

function articleActions(section, id, title, img) {
    const marked = isBookmarked(section, id);
    return `<div class="read-links" style="margin:0 0 16px">
        <button type="button" class="genre-tag" onclick="toggleBookmark('${esc(section)}','${esc(String(id))}',document.title)" aria-pressed="${marked ? 'true' : 'false'}">${marked ? '★ Saved' : '☆ Save'}</button>
        <button type="button" class="genre-tag" onclick="shareLink('${esc((title || '').slice(0, 80))}')">⤴ Share</button>
        <span id="share-feedback" class="results-count" style="margin:0" role="status"></span>
    </div>`;
}

function renderAnimeArticle(app, id) {
    if (id === null) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><h2>Anime not found</h2><p>Invalid id.</p></div>`;
        return;
    }
    const anime = ANIME_BY_ID.get(id);
    if (!anime) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><h2>Anime not found</h2><p><a class="genre-tag" href="#/browse" data-link>Browse anime</a></p></div>`;
        return;
    }
    pushHistory('anime', anime.id, anime.title, anime.img);

    const related = findRelated(anime);
    const yt = validYoutubeId(anime.trailer_youtube) ? anime.trailer_youtube : null;

    app.innerHTML = `
        <div class="article">
            <aside class="article-sidebar">
                <div class="article-cover">
                    ${anime.img ? `<img src="${esc(anime.img)}" alt="${esc(anime.title)}" loading="lazy" onerror="this.style.display='none'">` : '<div style="aspect-ratio:3/4;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:3rem">🎬</div>'}
                </div>
                <div class="infobox">
                    ${anime.score ? `<div class="infobox-row"><span class="infobox-label">Score</span><span class="infobox-value score">⭐ ${anime.score}</span></div>` : ''}
                    ${anime.rank ? `<div class="infobox-row"><span class="infobox-label">Rank</span><span class="infobox-value rank">#${anime.rank}</span></div>` : ''}
                    ${anime.popularity ? `<div class="infobox-row"><span class="infobox-label">Popularity</span><span class="infobox-value">#${anime.popularity}</span></div>` : ''}
                    ${anime.members ? `<div class="infobox-row"><span class="infobox-label">Members</span><span class="infobox-value">${anime.members.toLocaleString()}</span></div>` : ''}
                    ${anime.favorites ? `<div class="infobox-row"><span class="infobox-label">Favorites</span><span class="infobox-value">${anime.favorites.toLocaleString()}</span></div>` : ''}
                    ${anime.type ? `<div class="infobox-row"><span class="infobox-label">Type</span><span class="infobox-value">${esc(anime.type)}</span></div>` : ''}
                    ${anime.episodes ? `<div class="infobox-row"><span class="infobox-label">Episodes</span><span class="infobox-value">${anime.episodes}</span></div>` : ''}
                    ${anime.status ? `<div class="infobox-row"><span class="infobox-label">Status</span><span class="infobox-value">${esc(anime.status)}</span></div>` : ''}
                    ${anime.season && anime.year ? `<div class="infobox-row"><span class="infobox-label">Season</span><span class="infobox-value">${esc(anime.season)} ${anime.year}</span></div>` : anime.year ? `<div class="infobox-row"><span class="infobox-label">Year</span><span class="infobox-value">${anime.year}</span></div>` : ''}
                    ${anime.rating ? `<div class="infobox-row"><span class="infobox-label">Rating</span><span class="infobox-value">${esc(anime.rating)}</span></div>` : ''}
                    ${anime.aired_from ? `<div class="infobox-row"><span class="infobox-label">Aired</span><span class="infobox-value">${esc(formatDate(anime.aired_from))}${anime.aired_to ? ' - ' + esc(formatDate(anime.aired_to)) : ''}</span></div>` : ''}
                    ${(anime.studios || []).length ? `<div class="infobox-row"><span class="infobox-label">Studios</span><span class="infobox-value">${anime.studios.map(esc).join(', ')}</span></div>` : ''}
                    ${(anime.producers || []).length ? `<div class="infobox-row"><span class="infobox-label">Producers</span><span class="infobox-value">${anime.producers.map(esc).join(', ')}</span></div>` : ''}
                </div>
            </aside>
            <div class="article-main">
                <h1>${esc(anime.title)}</h1>
                <div class="alt-titles">
                    ${anime.title_en && anime.title_en !== anime.title ? `<div>English: ${esc(anime.title_en)}</div>` : ''}
                    ${anime.title_jp ? `<div>Japanese: ${esc(anime.title_jp)}</div>` : ''}
                </div>
                ${articleActions('anime', anime.id, anime.title, anime.img)}
                <div class="article-meta">
                    ${anime.type ? `<button type="button" class="meta-badge type" onclick="location.hash='#/browse?type=${encodeURIComponent(anime.type)}'">${esc(anime.type)}</button>` : ''}
                    ${anime.status ? `<button type="button" class="meta-badge status" onclick="location.hash='#/browse?status=${encodeURIComponent(anime.status)}'">${esc(anime.status)}</button>` : ''}
                    ${anime.rating ? `<button type="button" class="meta-badge rating" onclick="location.hash='#/browse?rating=${encodeURIComponent(anime.rating)}'">${esc(anime.rating)}</button>` : ''}
                    ${anime.episodes ? `<span class="meta-badge">${anime.episodes} episodes</span>` : ''}
                </div>
                ${anime.synopsis ? `<div class="synopsis"><h3>Synopsis</h3><div class="synopsis-text" id="synopsis-text">${esc(anime.synopsis)}</div><button type="button" class="synopsis-toggle" id="synopsis-toggle" aria-expanded="false" aria-controls="synopsis-text" onclick="toggleSynopsis()">Read more</button></div>` : ''}
                ${(anime.genres || []).length ? `<div class="genre-list">${anime.genres.map(g => `<button type="button" class="genre-tag" onclick="location.hash='#/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</button>`).join('')}</div>` : ''}
                ${(anime.themes || []).length ? `<div class="genre-list">${anime.themes.map(t => `<button type="button" class="genre-tag" style="border-color:var(--pink);color:var(--pink)" onclick="location.hash='#/browse?theme=${encodeURIComponent(t)}'">${esc(t)}</button>`).join('')}</div>` : ''}
                ${(anime.demographics || []).length ? `<div class="genre-list">${anime.demographics.map(d => `<button type="button" class="genre-tag" style="border-color:var(--blue);color:var(--blue)" onclick="location.hash='#/browse?demographic=${encodeURIComponent(d)}'">${esc(d)}</button>`).join('')}</div>` : ''}
                ${yt ? `<div style="margin-top:24px"><h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Trailer</h3><div id="trailer-container" style="border-radius:var(--radius-sm);overflow:hidden;aspect-ratio:16/9;position:relative;background:#000"><button type="button" aria-label="Play trailer" onclick="loadTrailer('${yt}')" style="width:100%;height:100%;cursor:pointer;display:block;padding:0"><img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.8" alt="Trailer thumbnail" loading="lazy" onerror="this.style.display='none'"><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:64px;height:64px;border-radius:50%;background:rgba(255,0,0,0.9);display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span></span></button></div></div>` : ''}
                <div id="watch-section" style="margin-top:24px"><div class="loading" role="status" style="padding:24px"><div class="spinner"></div></div></div>
                ${related.length ? `
                    <div class="related-section">
                        <h2>Related Anime</h2>
                        <div class="anime-grid">${related.slice(0, 6).map(a => animeCard(a)).join('')}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    document.title = anime.title + ' — WeebWiki';
    loadWatchSection(anime.title_en || anime.title);
}

async function loadWatchSection(title) {
    const box = document.getElementById('watch-section');
    if (!box) return;
    try {
        const m = await API.animeWatch(title);
        if (!m || (!m.streamingEpisodes?.length && !m.trailer && !m.externalLinks?.length)) {
            box.innerHTML = '';
            return;
        }
        const eps = (m.streamingEpisodes || []).slice(0, 12);
        const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://')) ? u : '#';
        box.innerHTML = `
            <h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Watch</h3>
            ${eps.length ? `<div class="ep-grid">${eps.map(e => `
                <a class="ep-card" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener">
                    ${e.thumbnail ? `<img src="${esc(e.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
                    <div class="ep-title">${esc(e.title)}</div>
                    <div class="ep-site">${esc(e.site)}</div>
                </a>`).join('')}</div>` : ''}
            ${m.externalLinks?.length ? `<div class="read-links">${m.externalLinks.map(l => `<a class="genre-tag" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">▶ ${esc(l.site)}</a>`).join('')}</div>` : ''}
        `;
    } catch {
        box.innerHTML = '';
    }
}

async function renderMangaArticle(app, id) {
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.mangaDetails(id);
        const manga = API.parseManga(data.data);
        if (!manga) throw new Error('Not found');
        const section = getSection() === 'manhwa' ? 'manhwa' : 'manga';
        pushHistory(section, manga.id, manga.title, manga.img);
        const safeSite = (manga.siteUrl && manga.siteUrl.startsWith('https://')) ? manga.siteUrl : null;

        app.innerHTML = `
            <div class="article">
                <aside class="article-sidebar">
                    <div class="article-cover">
                        ${manga.img ? `<img src="${manga.img}" alt="${esc(manga.title)}" loading="lazy">` : '<div style="aspect-ratio:3/4;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:3rem">📖</div>'}
                    </div>
                    <div class="infobox">
                        ${manga.type ? `<div class="infobox-row"><span class="infobox-label">Type</span><span class="infobox-value">${manga.type}</span></div>` : ''}
                        ${manga.status ? `<div class="infobox-row"><span class="infobox-label">Status</span><span class="infobox-value">${manga.status}</span></div>` : ''}
                        ${manga.year ? `<div class="infobox-row"><span class="infobox-label">Year</span><span class="infobox-value">${manga.year}</span></div>` : ''}
                        ${manga.chapters ? `<div class="infobox-row"><span class="infobox-label">Chapters</span><span class="infobox-value">${manga.chapters}</span></div>` : ''}
                        ${manga.authors.length ? `<div class="infobox-row"><span class="infobox-label">Author</span><span class="infobox-value">${manga.authors.map(esc).join(', ')}</span></div>` : ''}
                        ${manga.artists.length ? `<div class="infobox-row"><span class="infobox-label">Artist</span><span class="infobox-value">${manga.artists.map(esc).join(', ')}</span></div>` : ''}
                    </div>
                </aside>
                <div class="article-main">
                    <h1>${esc(manga.title)}</h1>
                    <div class="alt-titles">
                        ${manga.title_en && manga.title_en !== manga.title ? `<div>English: ${esc(manga.title_en)}</div>` : ''}
                        ${manga.title_jp ? `<div>Japanese: ${esc(manga.title_jp)}</div>` : ''}
                    </div>
                    ${articleActions(section, manga.id, manga.title, manga.img)}
                    <div class="article-meta">
                        ${manga.type ? `<span class="meta-badge type">${esc(manga.type)}</span>` : ''}
                        ${manga.status ? `<span class="meta-badge status">${esc(manga.status)}</span>` : ''}
                    </div>
                    ${manga.synopsis ? `<div class="synopsis"><h3>Synopsis</h3><div class="synopsis-text" id="synopsis-text">${esc(manga.synopsis)}</div><button type="button" class="synopsis-toggle" id="synopsis-toggle" aria-expanded="false" aria-controls="synopsis-text" onclick="toggleSynopsis()">Read more</button></div>` : ''}
                    ${manga.genres.length ? `<div class="genre-list">${manga.genres.map(g => `<span class="genre-tag">${esc(g)}</span>`).join('')}</div>` : ''}
                    ${manga.themes.length ? `<div class="genre-list">${manga.themes.map(t => `<span class="genre-tag" style="border-color:var(--pink);color:var(--pink)">${esc(t)}</span>`).join('')}</div>` : ''}
                    ${renderChapterSection(manga)}
                    <div style="margin-top:24px"><h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Read</h3><div class="read-links">
                        ${safeSite ? `<a class="genre-tag" href="${esc(safeSite)}" target="_blank" rel="noopener">📖 AniList</a>` : ''}
                        <a class="genre-tag" href="https://mangadex.org/search?q=${encodeURIComponent(manga.title)}" target="_blank" rel="noopener">📖 MangaDex</a>
                        <a class="genre-tag" href="https://mangaplus.shueisha.co.jp/search_result?search=${encodeURIComponent(manga.title)}" target="_blank" rel="noopener">📖 MangaPlus</a>
                    </div></div>
                </div>
            </div>
        `;
        document.title = manga.title + ' — WeebWiki';
    } catch (e) {
        window._doujinPages = [];
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">📖</div><h2>Manga not found</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

async function renderDoujinArticle(app, id, section) {
    const effSection = section === 'hentai' ? 'hentai' : 'doujin';
    if (id === null) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🎨</div><h2>Doujin not found</h2><p>Invalid id.</p></div>`;
        return;
    }
    if (requireGate(effSection) || (effSection === 'doujin' && !state.hentaiUnlocked && false)) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🔞</div><h2>Adult content locked</h2><p>Confirm you are 18+ to view.</p><p style="margin-top:16px"><button type="button" class="gate-btn gate-btn-confirm" onclick="showGate()">Unlock 18+</button></p></div>`;
        return;
    }
    app.innerHTML = `<div class="loading" role="status" aria-live="polite"><div class="spinner"></div><span class="sr-only">Loading…</span></div>`;
    try {
        const data = await API.doujinDetails(id);
        const doujin = API.parseDoujin(data);
        if (!doujin) throw new Error('Not found');
        window._doujinPages = doujin.pages || [];
        pushHistory(effSection, doujin.id, doujin.title, doujin.img);

        app.innerHTML = `
            <div class="article">
                <aside class="article-sidebar">
                    <div class="article-cover">
                        ${doujin.img ? `<img src="${esc(doujin.img)}" alt="${esc(doujin.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '<div style="aspect-ratio:3/4;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:3rem">🎨</div>'}
                    </div>
                    <div class="infobox">
                        <div class="infobox-row"><span class="infobox-label">Pages</span><span class="infobox-value">${doujin.chapters || '?'}</span></div>
                        <div class="infobox-row"><span class="infobox-label">Favorites</span><span class="infobox-value">${doujin.favorites || 0}</span></div>
                        ${doujin.year ? `<div class="infobox-row"><span class="infobox-label">Year</span><span class="infobox-value">${doujin.year}</span></div>` : ''}
                    </div>
                </aside>
                <div class="article-main">
                    <h1>${esc(doujin.title)}</h1>
                    ${articleActions(effSection, doujin.id, doujin.title, doujin.img)}
                    <div class="article-meta">
                        <span class="meta-badge rating">🔞 Adult</span>
                    </div>
                    ${doujin.pages?.length ? `
                        <div style="margin:16px 0">
                            <button type="button" class="gate-btn gate-btn-confirm" onclick="openReader()">📖 Read now (${doujin.pages.length} pages)</button>
                        </div>
                        <div class="preview-strip">${doujin.pages.slice(0, 8).map((p, i) => {
                            const thumb = (p.thumb && String(p.thumb).startsWith('http')) ? p.thumb : `https://t.nhentai.net/${p.thumb || ''}`;
                            return `<img src="${esc(thumb)}" alt="preview page ${i + 1}" loading="lazy" referrerpolicy="no-referrer" tabindex="0" role="button" onclick="openReader(${i})" onkeydown="if(event.key==='Enter'){openReader(${i})}" onerror="this.style.display='none'">`;
                        }).join('')}</div>
                    ` : ''}
                    ${(doujin.tags || []).length ? `<div class="genre-list">${doujin.tags.slice(0, 15).map(t => `<span class="genre-tag" style="border-color:var(--red);color:var(--red)">${esc(t)}</span>`).join('')}</div>` : ''}
                </div>
            </div>
        `;
        document.title = doujin.title + ' — WeebWiki';
    } catch (e) {
        window._doujinPages = [];
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">🎨</div><h2>Doujin not found</h2><p>${esc(e.message)}</p><p style="margin-top:16px"><button type="button" class="genre-tag" onclick="render()">Retry</button></p></div>`;
    }
}

function renderSearch(app, query) {
    const results = searchAnime(query, 100);
    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">Search results for "${esc(query)}"</h2>
            </div>
            <p class="results-count">${results.length} result${results.length !== 1 ? 's' : ''} found</p>
            ${results.length ? `<div class="anime-grid">${results.map(a => animeCard(a)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">🔍</div><h2>No results found</h2><p>Try a different search term</p></div>`}
        </section>
    `;
}

function renderBrowse(app) {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const genre = params.get('genre') || '';
    const year = params.get('year') || '';
    const type = params.get('type') || '';
    const status = params.get('status') || '';
    const rating = params.get('rating') || '';
    const theme = params.get('theme') || '';
    const demographic = params.get('demographic') || '';
    const sort = params.get('sort') || 'members';
    const pageParam = parseInt(params.get('page') || '1', 10);
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    state.browseFilters = { genre, year, type, status, rating, theme, demographic, sort };
    state.browsePage = page;

    let filtered = [...ANIME];
    if (genre) filtered = filtered.filter(a => (a.genres || []).includes(genre));
    if (year) filtered = filtered.filter(a => a.year === parseInt(year, 10));
    if (type) filtered = filtered.filter(a => a.type === type);
    if (status) filtered = filtered.filter(a => a.status === status);
    if (rating) filtered = filtered.filter(a => a.rating === rating);
    if (theme) filtered = filtered.filter(a => (a.themes || []).includes(theme));
    if (demographic) filtered = filtered.filter(a => (a.demographics || []).includes(demographic));

    switch (sort) {
        case 'score': filtered.sort((a, b) => (b.score || 0) - (a.score || 0)); break;
        case 'rank': filtered.sort((a, b) => (a.rank || 99999) - (b.rank || 99999)); break;
        case 'title': filtered.sort((a, b) => a.title.localeCompare(b.title)); break;
        case 'year': filtered.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
        default: filtered.sort((a, b) => (b.members || 0) - (a.members || 0));
    }

    const perPage = 30;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">Browse Anime</h2>
            </div>
            <div class="browse-filters">
                <div class="filter-group">
                    <label for="br-genre">Genre</label>
                    <select id="br-genre" onchange="updateBrowse('genre', this.value)">
                        <option value="">All</option>
                        ${ALL_GENRES.map(g => `<option value="${esc(g)}" ${g === genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="br-year">Year</label>
                    <select id="br-year" onchange="updateBrowse('year', this.value)">
                        <option value="">All</option>
                        ${YEARS.map(y => `<option value="${y}" ${String(y) === String(year) ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="br-type">Type</label>
                    <select id="br-type" onchange="updateBrowse('type', this.value)">
                        <option value="">All</option>
                        ${['TV', 'Movie', 'OVA', 'ONA', 'Special'].map(t => `<option value="${esc(t)}" ${t === type ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="br-status">Status</label>
                    <select id="br-status" onchange="updateBrowse('status', this.value)">
                        <option value="">All</option>
                        ${['Finished Airing', 'Currently Airing', 'Not yet aired'].map(s => `<option value="${esc(s)}" ${s === status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="br-rating">Rating</label>
                    <select id="br-rating" onchange="updateBrowse('rating', this.value)">
                        <option value="">All</option>
                        ${['G - All Ages', 'PG - Children', 'PG-13 - Teens 13 or older', 'R - 17+ (violence & profanity)', 'R+ - Mild Nudity', 'Rx - Hentai'].map(r => `<option value="${esc(r)}" ${r === rating ? 'selected' : ''}>${esc(r)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label for="br-sort">Sort</label>
                    <select id="br-sort" onchange="updateBrowse('sort', this.value)">
                        <option value="members" ${sort === 'members' ? 'selected' : ''}>Popularity</option>
                        <option value="score" ${sort === 'score' ? 'selected' : ''}>Score</option>
                        <option value="rank" ${sort === 'rank' ? 'selected' : ''}>Rank</option>
                        <option value="year" ${sort === 'year' ? 'selected' : ''}>Year</option>
                        <option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option>
                    </select>
                </div>
            </div>
            <p class="results-count">${filtered.length.toLocaleString()} anime found</p>
            ${items.length ? `<div class="list-view">${items.map(a => listItem(a)).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">📭</div><h2>No anime found</h2><p>Try adjusting your filters</p></div>'}
            ${totalPages > 1 ? pagination(safePage, totalPages, 'browse') : ''}
        </section>
    `;
}

function renderTop(app) {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const pageParam = parseInt(params.get('page') || String(state.topPage || '1'), 10);
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    state.topPage = page;
    const ranked = [...ANIME].filter(a => a.score).sort((a, b) => b.score - a.score);
    const perPage = 30;
    const totalPages = Math.max(1, Math.ceil(ranked.length / perPage));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * perPage;
    const items = ranked.slice(start, start + perPage);

    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">🏆 Top Rated Anime</h2>
            </div>
            <p class="results-count">${ranked.length.toLocaleString()} anime with scores</p>
            <div class="list-view">${items.map((a, i) => listItem(a, start + i + 1)).join('')}</div>
            ${totalPages > 1 ? pagination(safePage, totalPages, 'top') : ''}
        </section>
    `;
}

function updateBrowse(key, value) {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (value) params.set(key, value); else params.delete(key);
    if (key !== 'page') params.delete('page');
    if (key === 'page' && (value === '1' || value === 1)) params.delete('page');
    state.browseFilters[key] = value || '';
    if (key !== 'page') state.browsePage = 1;
    location.hash = `#/browse${params.toString() ? '?' + params.toString() : ''}`;
    if (location.hash === '#/browse' && !params.toString()) render();
}

function goPage(page, type) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    if (type === 'browse') {
        const params = new URLSearchParams(location.hash.split('?')[1] || '');
        if (p === 1) params.delete('page'); else params.set('page', String(p));
        state.browsePage = p;
        location.hash = `#/browse${params.toString() ? '?' + params.toString() : ''}`;
    } else {
        state.topPage = p;
        const base = location.hash.split('?')[0] || '#/top';
        location.hash = `${base}${p === 1 ? '' : '?page=' + p}`;
        if (p === 1 && !location.hash.includes('?')) render();
    }
}

function pagination(current, total, type) {
    const maxVisible = 7;
    let start = Math.max(1, current - 3);
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    let pages = '';
    if (start > 1) pages += `<button type="button" class="page-btn" onclick="goPage(1, '${type}')" aria-label="Go to page 1">1</button><span aria-hidden="true" style="color:var(--text-muted)">...</span>`;
    for (let i = start; i <= end; i++) {
        pages += `<button type="button" class="page-btn ${i === current ? 'active' : ''}" onclick="goPage(${i}, '${type}')" ${i === current ? 'aria-current="page"' : ''} aria-label="Go to page ${i}">${i}</button>`;
    }
    if (end < total) pages += `<span aria-hidden="true" style="color:var(--text-muted)">...</span><button type="button" class="page-btn" onclick="goPage(${total}, '${type}')" aria-label="Go to page ${total}">${total}</button>`;

    return `<nav class="pagination" aria-label="Pagination">
        <button type="button" class="page-btn" onclick="goPage(${current - 1}, '${type}')" ${current <= 1 ? 'disabled' : ''} aria-label="Previous page">←</button>
        ${pages}
        <button type="button" class="page-btn" onclick="goPage(${current + 1}, '${type}')" ${current >= total ? 'disabled' : ''} aria-label="Next page">→</button>
    </nav>`;
}

function searchAnime(query, limit = 20) {
    const q = query.toLowerCase();
    const results = [];
    for (const a of ANIME) {
        const title = a.title.toLowerCase();
        const titleEn = (a.title_en || '').toLowerCase();
        const titleJp = (a.title_jp || '').toLowerCase();
        if (title.includes(q) || titleEn.includes(q) || titleJp.includes(q)) {
            results.push(a);
            if (results.length >= limit) break;
        }
    }
    return results;
}

function findRelated(anime) {
    const related = [];
    const animeGenres = new Set(anime.genres || []);
    for (const a of ANIME) {
        if (a.id === anime.id) continue;
        const shared = (a.genres || []).filter(g => animeGenres.has(g)).length;
        if (shared > 0) related.push({ ...a, _shared: shared });
    }
    return related.sort((a, b) => b._shared - a._shared || (b.members || 0) - (a.members || 0));
}

function animeCard(a) {
    const aid = Number.isInteger(a.id) ? a.id : parseInt(a.id, 10);
    const safeAid = Number.isInteger(aid) ? aid : esc(String(a.id));
    return `
        <div class="anime-card" role="link" tabindex="0" data-hash="#/anime/${safeAid}" onclick="location.hash='#/anime/${safeAid}'" onkeydown="if(event.key==='Enter'){location.hash='#/anime/${safeAid}'}">
            <div class="anime-card-img">
                ${a.img ? `<img src="${esc(a.img)}" alt="${esc(a.title)}" loading="lazy" width="300" height="400" onerror="this.style.display='none'">` : '<div style="width:100%;height:100%;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem">🎬</div>'}
                ${a.rank ? `<span class="anime-card-rank">#${a.rank}</span>` : ''}
                ${a.score ? `<span class="anime-card-score">⭐ ${a.score}</span>` : ''}
            </div>
            <div class="anime-card-body">
                <div class="anime-card-title">${esc(a.title)}</div>
                <div class="anime-card-meta">${esc(a.type || 'TV')}${a.year ? ' · ' + a.year : ''}</div>
            </div>
        </div>
    `;
}

function mangaCard(m, section) {
    const prefix = section === 'manhwa' ? 'manhwa' : (section === 'doujin' ? 'doujin' : 'manga');
    return `
        <div class="anime-card" role="link" tabindex="0" onclick="location.hash='#/${prefix}/${m.id}'" onkeydown="if(event.key==='Enter'){location.hash='#/${prefix}/${m.id}'}">
            <div class="anime-card-img">
                ${m.img ? `<img src="${esc(m.img)}" alt="${esc(m.title)}" loading="lazy" width="300" height="400" onerror="this.style.display='none'">` : '<div style="width:100%;height:100%;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem">📖</div>'}
            </div>
            <div class="anime-card-body">
                <div class="anime-card-title">${esc(m.title)}</div>
                <div class="anime-card-meta">${esc(m.type || 'Manga')}${m.year ? ' · ' + m.year : ''}</div>
            </div>
        </div>
    `;
}

function doujinCard(d, section) {
    const prefix = section === 'hentai' ? 'hentai' : 'doujin';
    const sid = Number.isInteger(d.id) ? d.id : esc(String(d.id));
    return `
        <div class="anime-card" role="link" tabindex="0" onclick="location.hash='#/${prefix}/${sid}'" onkeydown="if(event.key==='Enter'){location.hash='#/${prefix}/${sid}'}">
            <div class="anime-card-img">
                ${d.img ? `<img src="${esc(d.img)}" alt="${esc(d.title)}" loading="lazy" width="300" height="400" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '<div style="width:100%;height:100%;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem">🎨</div>'}
            </div>
            <div class="anime-card-body">
                <div class="anime-card-title">${esc(d.title)}</div>
                <div class="anime-card-meta">${d.chapters || '?'} pages</div>
            </div>
        </div>
    `;
}

function listItem(a, rankOverride) {
    const rank = rankOverride || a.rank;
    return `
        <div class="list-item" role="link" tabindex="0" onclick="location.hash='#/anime/${a.id}'" onkeydown="if(event.key==='Enter'){location.hash='#/anime/${a.id}'}">
            ${rank ? `<span class="list-item-rank">#${rank}</span>` : ''}
            ${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" width="50" height="70" onerror="this.style.display='none'">` : ''}
            <div class="list-item-info">
                <div class="list-item-title">${esc(a.title)}</div>
                <div class="list-item-meta">${esc(a.type || 'TV')}${a.year ? ' · ' + a.year : ''} · ${(a.genres || []).slice(0, 3).map(esc).join(', ')}</div>
            </div>
            ${a.score ? `<span class="list-item-score">⭐ ${a.score}</span>` : ''}
        </div>
    `;
}

function renderBookmarks(app) {
    const bm = getBookmarks();
    const hist = getHistory();
    const animeItems = bm.anime.map(id => ANIME_BY_ID.get(parseInt(id, 10))).filter(Boolean);
    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header"><h2 class="section-title">★ My Library</h2><a href="#/" class="section-link" data-link>Home →</a></div>
            <h3 style="font-size:0.85rem;color:var(--text-secondary);margin:16px 0 8px">Anime (${animeItems.length})</h3>
            ${animeItems.length ? `<div class="anime-grid">${animeItems.map(a => animeCard(a)).join('')}</div>` : '<p class="results-count">No anime saved yet. Open any title and tap ☆ Save.</p>'}
            <h3 style="font-size:0.85rem;color:var(--text-secondary);margin:16px 0 8px">Manga / Manhwa IDs (${bm.manga.length})</h3>
            ${bm.manga.length ? `<div class="read-links">${bm.manga.map(id => `<a class="genre-tag" href="#/manga/${esc(id)}">📖 ${esc(id)}</a>`).join('')}</div><p class="results-count">Tap to reopen (details load live).</p><p><button type="button" class="synopsis-toggle" onclick="clearBookmarks('manga')">Clear manga</button></p>` : '<p class="results-count">No manga saved yet.</p>'}
            <h3 style="font-size:0.85rem;color:var(--text-secondary);margin:16px 0 8px">Doujin IDs (${bm.doujin.length})</h3>
            ${bm.doujin.length ? `<div class="read-links">${bm.doujin.map(id => `<a class="genre-tag" href="#/doujin/${esc(id)}">🎨 ${esc(id)}</a>`).join('')}</div><p><button type="button" class="synopsis-toggle" onclick="clearBookmarks('doujin')">Clear doujin</button> <button type="button" class="synopsis-toggle" onclick="clearBookmarks('anime')">Clear anime</button></p>` : '<p class="results-count">No doujin saved yet.</p>'}
        </section>
        <section class="section">
            <div class="section-header"><h2 class="section-title">🕘 History (${hist.length})</h2>${hist.length ? '<button type="button" class="synopsis-toggle" onclick="clearHistory()">Clear history</button>' : ''}</div>
            ${hist.length ? `<div class="anime-grid">${hist.map(h => {
                const prefix = h.section === 'hentai' ? 'hentai' : h.section;
                return `<div class="anime-card" role="link" tabindex="0" onclick="location.hash='#/${prefix}/${esc(h.id)}'" onkeydown="if(event.key==='Enter'){location.hash='#/${prefix}/${esc(h.id)}'}"><div class="anime-card-img">${h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}</div><div class="anime-card-body"><div class="anime-card-title">${esc(h.title)}</div><div class="anime-card-meta">${esc(h.section)}</div></div></div>`;
            }).join('')}</div>` : '<p class="results-count">No recent views.</p>'}
        </section>
    `;
}

function clearBookmarks(kind) {
    const b = getBookmarks();
    if (kind) b[kind] = [];
    else { b.anime = []; b.manga = []; b.doujin = []; }
    Store.set(BM_KEY, b);
    render();
}

function formatDate(d) {
    if (!d) return '';
    try {
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return d; }
}

function toggleSynopsis() {
    const text = document.getElementById('synopsis-text');
    const btn = document.getElementById('synopsis-toggle');
    if (!text || !btn) return;
    const willExpand = !text.classList.contains('expanded');
    if (willExpand) {
        text.classList.add('expanded');
        btn.textContent = 'Read less';
    } else {
        text.classList.remove('expanded');
        btn.textContent = 'Read more';
    }
    btn.setAttribute('aria-expanded', willExpand ? 'true' : 'false');
}

function loadTrailer(youtubeId) {
    if (!validYoutubeId(youtubeId)) return;
    const container = document.getElementById('trailer-container');
    if (!container) return;
    container.innerHTML = `<iframe title="Trailer" loading="lazy" src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0" style="width:100%;height:100%;border:0;aspect-ratio:16/9" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}

let _reader = null;
let _readerPrevOverflow = '';

function openReader(startIndex = 0) {
    const pages = window._doujinPages || [];
    if (!pages.length) return;
    document.removeEventListener('keydown', readerKeys);
    const i = Number.isInteger(startIndex) ? startIndex : 0;
    _reader = { pages, i: Math.min(Math.max(i, 0), pages.length - 1) };
    _readerPrevOverflow = document.body.style.overflow || '';
    showReaderPage();
    document.addEventListener('keydown', readerKeys);
}

function readerFullUrl(page) {
    if (!page) return '';
    const p = typeof page === 'string' ? page : page.path;
    if (typeof p === 'string' && p.startsWith('http')) return p;
    if (typeof p === 'string' && /^galleries\/\d+\/.+\.(jpg|png|webp|gif)$/i.test(p)) return `https://i.nhentai.net/${p}`;
    return '';
}

function showReaderPage() {
    if (!_reader) return;
    let overlay = document.getElementById('reader-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'reader-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Doujin reader');
        overlay.innerHTML = `
            <div class="reader-top"><span id="reader-count" role="status"></span><button type="button" class="reader-close" aria-label="Close reader" onclick="closeReader()">✕</button></div>
            <button type="button" class="reader-nav reader-prev" aria-label="Previous page" onclick="readerNav(-1)">‹</button>
            <img id="reader-img" alt="Doujin page" referrerpolicy="no-referrer">
            <button type="button" class="reader-nav reader-next" aria-label="Next page" onclick="readerNav(1)">›</button>`;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReader(); });
        document.body.appendChild(overlay);
    }
    const img = document.getElementById('reader-img');
    const url = readerFullUrl(_reader.pages[_reader.i]);
    img.alt = `Doujin page ${_reader.i + 1} of ${_reader.pages.length}`;
    img.src = url;
    img.onerror = () => { img.alt = 'Failed to load page'; };
    const next = _reader.pages[_reader.i + 1];
    if (next) { const pre = new Image(); pre.src = readerFullUrl(next); }
    document.getElementById('reader-count').textContent = `${_reader.i + 1} / ${_reader.pages.length}`;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    const closeBtn = overlay.querySelector('.reader-close');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
}

function readerNav(dir) {
    if (!_reader) return;
    _reader.i = (_reader.i + dir + _reader.pages.length) % _reader.pages.length;
    showReaderPage();
}

function readerKeys(e) {
    if (!_reader) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); readerNav(1); }
    else if (e.key === 'ArrowLeft') readerNav(-1);
    else if (e.key === 'Home') { _reader.i = 0; showReaderPage(); }
    else if (e.key === 'End') { _reader.i = _reader.pages.length - 1; showReaderPage(); }
    else if (e.key === 'Escape') closeReader();
}

function closeReader() {
    _reader = null;
    document.getElementById('reader-overlay')?.classList.remove('active');
    document.body.style.overflow = _readerPrevOverflow;
    document.removeEventListener('keydown', readerKeys);
}

function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
