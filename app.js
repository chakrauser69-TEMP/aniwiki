const ANIME = ANIME_DATA;
const ANIME_BY_ID = new Map(ANIME.map(a => [a.id, a]));
const ANIME_BY_TITLE = new Map();
ANIME.forEach(a => {
    ANIME_BY_TITLE.set(a.title.toLowerCase(), a);
    if (a.title_en) ANIME_BY_TITLE.set(a.title_en.toLowerCase(), a);
    if (a.title_jp) ANIME_BY_TITLE.set(a.title_jp.toLowerCase(), a);
});

const ALL_GENRES = [...new Set(ANIME.flatMap(a => a.genres || []))].sort();
const ALL_THEMES = [...new Set(ANIME.flatMap(a => a.themes || []))].sort();
const ALL_DEMOGRAPHICS = [...new Set(ANIME.flatMap(a => a.demographics || []))].sort();
const ALL_STUDIOS = [...new Set(ANIME.flatMap(a => a.studios || []))].sort();
const YEARS = [...new Set(ANIME.map(a => a.year).filter(Boolean))].sort((a, b) => b - a);

const state = {
    theme: localStorage.getItem('theme') || 'dark',
    searchQuery: '',
    browseFilters: { genre: '', year: '', type: '', sort: 'members' },
    browsePage: 1,
    topPage: 1,
};

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
    btn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('theme', state.theme);
    });
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-dropdown');
    let debounce;

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const q = input.value.trim();
            if (q.length < 2) { dropdown.classList.remove('active'); return; }
            const results = searchAnime(q, 8);
            dropdown.innerHTML = results.map(a => `
                <div class="search-dropdown-item" onclick="location.hash='#/anime/${a.id}'">
                    ${a.img ? `<img src="${a.img}" alt="" loading="lazy">` : '<div style="width:40px;height:56px;background:var(--glass-border);border-radius:6px"></div>'}
                    <div>
                        <div class="sd-title">${esc(a.title)}</div>
                        <div class="sd-meta">${a.type || 'TV'} · ${a.year || '????'} · ⭐ ${a.score || 'N/A'}</div>
                    </div>
                </div>
            `).join('');
            dropdown.classList.add('active');
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
            dropdown.classList.remove('active');
        }
        if (e.key === 'Escape') dropdown.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) dropdown.classList.remove('active');
    });
}

function setupRouter() {
    document.querySelectorAll('[data-link]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            location.hash = el.getAttribute('href');
        });
    });
}

function getRoute() {
    const hash = location.hash.slice(1) || '/';
    const path = hash.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'anime' && parts[1]) return { page: 'article', id: parseInt(parts[1]) };
    if (parts[0] === 'search' && parts[1]) return { page: 'search', query: decodeURIComponent(parts[1]) };
    if (parts[0] === 'browse') return { page: 'browse' };
    if (parts[0] === 'top') return { page: 'top' };
    return { page: 'home' };
}

function render() {
    const route = getRoute();
    const app = document.getElementById('app');
    window.scrollTo(0, 0);

    switch (route.page) {
        case 'article': renderArticle(app, route.id); break;
        case 'search': renderSearch(app, route.query); break;
        case 'browse': renderBrowse(app); break;
        case 'top': renderTop(app); break;
        default: renderHome(app);
    }
}

function renderHome(app) {
    const topRated = [...ANIME].filter(a => a.score).sort((a, b) => b.score - a.score).slice(0, 10);
    const topRanked = [...ANIME].filter(a => a.rank).sort((a, b) => a.rank - b.rank).slice(0, 10);
    const popular = [...ANIME].sort((a, b) => (b.members || 0) - (a.members || 0)).slice(0, 10);
    const recent = [...ANIME].filter(a => a.year >= 2023).sort((a, b) => (b.members || 0) - (a.members || 0)).slice(0, 10);

    app.innerHTML = `
        <section class="hero">
            <h1>Discover Anime</h1>
            <p>Search and explore ${ANIME.length.toLocaleString()} anime titles with detailed information</p>
            <div class="hero-search">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input type="text" id="hero-search-input" placeholder="Search anime..." autocomplete="off">
                <div id="hero-search-dropdown" class="search-dropdown"></div>
            </div>
        </section>
        <section class="section">
            <div class="section-header">
                <h2 class="section-title">🏆 Top Rated</h2>
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
            <div class="genre-cloud">${ALL_GENRES.slice(0, 30).map(g => `<span class="genre-tag" onclick="location.hash='#/browse?genre=${encodeURIComponent(g)}'">${esc(g)}</span>`).join('')}</div>
        </section>
    `;

    setupHeroSearch();
}

function setupHeroSearch() {
    const input = document.getElementById('hero-search-input');
    const dropdown = document.getElementById('hero-search-dropdown');
    let debounce;

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const q = input.value.trim();
            if (q.length < 2) { dropdown.classList.remove('active'); return; }
            const results = searchAnime(q, 6);
            dropdown.innerHTML = results.map(a => `
                <div class="search-dropdown-item" onclick="location.hash='#/anime/${a.id}'">
                    ${a.img ? `<img src="${a.img}" alt="" loading="lazy">` : ''}
                    <div>
                        <div class="sd-title">${esc(a.title)}</div>
                        <div class="sd-meta">${a.type || 'TV'} · ${a.year || '????'} · ⭐ ${a.score || 'N/A'}</div>
                    </div>
                </div>
            `).join('');
            dropdown.classList.add('active');
        }, 150);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const q = input.value.trim();
            if (q) location.hash = `#/search/${encodeURIComponent(q)}`;
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.hero-search')) dropdown.classList.remove('active');
    });
}

function renderArticle(app, id) {
    const anime = ANIME_BY_ID.get(id);
    if (!anime) {
        app.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><h2>Anime not found</h2><p>The requested anime could not be found.</p></div>`;
        return;
    }

    const related = findRelated(anime);

    app.innerHTML = `
        <div class="article">
            <aside class="article-sidebar">
                <div class="article-cover">
                    ${anime.img ? `<img src="${anime.img}" alt="${esc(anime.title)}" loading="lazy">` : '<div style="aspect-ratio:3/4;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:3rem">🎬</div>'}
                </div>
                <div class="infobox">
                    ${anime.score ? `<div class="infobox-row"><span class="infobox-label">Score</span><span class="infobox-value score">⭐ ${anime.score}</span></div>` : ''}
                    ${anime.rank ? `<div class="infobox-row"><span class="infobox-label">Rank</span><span class="infobox-value rank">#${anime.rank}</span></div>` : ''}
                    ${anime.popularity ? `<div class="infobox-row"><span class="infobox-label">Popularity</span><span class="infobox-value">#${anime.popularity}</span></div>` : ''}
                    ${anime.members ? `<div class="infobox-row"><span class="infobox-label">Members</span><span class="infobox-value">${anime.members.toLocaleString()}</span></div>` : ''}
                    ${anime.favorites ? `<div class="infobox-row"><span class="infobox-label">Favorites</span><span class="infobox-value">${anime.favorites.toLocaleString()}</span></div>` : ''}
                    ${anime.type ? `<div class="infobox-row"><span class="infobox-label">Type</span><span class="infobox-value">${anime.type}</span></div>` : ''}
                    ${anime.episodes ? `<div class="infobox-row"><span class="infobox-label">Episodes</span><span class="infobox-value">${anime.episodes}</span></div>` : ''}
                    ${anime.status ? `<div class="infobox-row"><span class="infobox-label">Status</span><span class="infobox-value">${anime.status}</span></div>` : ''}
                    ${anime.season && anime.year ? `<div class="infobox-row"><span class="infobox-label">Season</span><span class="infobox-value">${anime.season} ${anime.year}</span></div>` : anime.year ? `<div class="infobox-row"><span class="infobox-label">Year</span><span class="infobox-value">${anime.year}</span></div>` : ''}
                    ${anime.rating ? `<div class="infobox-row"><span class="infobox-label">Rating</span><span class="infobox-value">${anime.rating}</span></div>` : ''}
                    ${anime.aired_from ? `<div class="infobox-row"><span class="infobox-label">Aired</span><span class="infobox-value">${formatDate(anime.aired_from)}${anime.aired_to ? ' - ' + formatDate(anime.aired_to) : ''}</span></div>` : ''}
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
                <div class="article-meta">
                    ${anime.type ? `<span class="meta-badge type" onclick="location.hash='#/browse?type=${anime.type}'" style="cursor:pointer">${anime.type}</span>` : ''}
                    ${anime.status ? `<span class="meta-badge status" onclick="location.hash='#/browse?status=${anime.status}'" style="cursor:pointer">${anime.status}</span>` : ''}
                    ${anime.rating ? `<span class="meta-badge rating" onclick="location.hash='#/browse?rating=${anime.rating}'" style="cursor:pointer">${anime.rating}</span>` : ''}
                    ${anime.episodes ? `<span class="meta-badge" onclick="location.hash='#/browse?episodes=${anime.episodes}'" style="cursor:pointer">${anime.episodes} episodes</span>` : ''}
                </div>
                ${anime.synopsis ? `<div class="synopsis"><h3>Synopsis</h3><div class="synopsis-text" id="synopsis-text">${esc(anime.synopsis)}</div><button class="synopsis-toggle" id="synopsis-toggle" onclick="toggleSynopsis()">Read more</button></div>` : ''}
                ${(anime.genres || []).length ? `<div class="genre-list">${anime.genres.map(g => `<span class="genre-tag" onclick="location.hash='#/browse?genre=${encodeURIComponent(g)}'" style="cursor:pointer">${esc(g)}</span>`).join('')}</div>` : ''}
                ${(anime.themes || []).length ? `<div class="genre-list">${anime.themes.map(t => `<span class="genre-tag" style="border-color:var(--pink);color:var(--pink);cursor:pointer" onclick="location.hash='#/browse?theme=${encodeURIComponent(t)}'">${esc(t)}</span>`).join('')}</div>` : ''}
                ${(anime.demographics || []).length ? `<div class="genre-list">${anime.demographics.map(d => `<span class="genre-tag" style="border-color:var(--blue);color:var(--blue);cursor:pointer" onclick="location.hash='#/browse?demographic=${encodeURIComponent(d)}'">${esc(d)}</span>`).join('')}</div>` : ''}
                ${anime.trailer_youtube ? `<div style="margin-top:24px"><h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px">Trailer</h3><div id="trailer-container" style="border-radius:var(--radius-sm);overflow:hidden;aspect-ratio:16/9;position:relative;cursor:pointer;background:#000" onclick="loadTrailer('${anime.trailer_youtube}')"><img src="https://img.youtube.com/vi/${anime.trailer_youtube}/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.8" alt="Trailer thumbnail"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="width:64px;height:64px;border-radius:50%;background:rgba(255,0,0,0.9);display:flex;align-items:center;justify-content:center;transition:transform 0.2s"><svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg></div></div></div></div>` : ''}
                ${related.length ? `
                    <div class="related-section">
                        <h2>Related Anime</h2>
                        <div class="anime-grid">${related.slice(0, 6).map(a => animeCard(a)).join('')}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
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
    const genre = params.get('genre') || state.browseFilters.genre;
    const year = params.get('year') || state.browseFilters.year;
    const type = params.get('type') || state.browseFilters.type;
    const status = params.get('status') || state.browseFilters.status;
    const rating = params.get('rating') || state.browseFilters.rating;
    const theme = params.get('theme') || state.browseFilters.theme;
    const demographic = params.get('demographic') || state.browseFilters.demographic;
    const sort = params.get('sort') || state.browseFilters.sort;

    let filtered = [...ANIME];
    if (genre) filtered = filtered.filter(a => (a.genres || []).includes(genre));
    if (year) filtered = filtered.filter(a => a.year === parseInt(year));
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
    const totalPages = Math.ceil(filtered.length / perPage);
    const page = state.browsePage;
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage);

    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">Browse Anime</h2>
            </div>
            <div class="browse-filters">
                <div class="filter-group">
                    <label>Genre</label>
                    <select onchange="updateBrowse('genre', this.value)">
                        <option value="">All</option>
                        ${ALL_GENRES.map(g => `<option value="${esc(g)}" ${g === genre ? 'selected' : ''}>${esc(g)}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Year</label>
                    <select onchange="updateBrowse('year', this.value)">
                        <option value="">All</option>
                        ${YEARS.map(y => `<option value="${y}" ${y === parseInt(year) ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Type</label>
                    <select onchange="updateBrowse('type', this.value)">
                        <option value="">All</option>
                        ${['TV', 'Movie', 'OVA', 'ONA', 'Special'].map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Status</label>
                    <select onchange="updateBrowse('status', this.value)">
                        <option value="">All</option>
                        ${['Finished Airing', 'Currently Airing', 'Not yet aired'].map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Rating</label>
                    <select onchange="updateBrowse('rating', this.value)">
                        <option value="">All</option>
                        ${['G - All Ages', 'PG - Children', 'PG-13 - Teens 13 or older', 'R - 17+ (violence & profanity)', 'R+ - Mild Nudity', 'Rx - Hentai'].map(r => `<option value="${r}" ${r === rating ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Sort</label>
                    <select onchange="updateBrowse('sort', this.value)">
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
            ${totalPages > 1 ? pagination(page, totalPages, 'browse') : ''}
        </section>
    `;
}

function renderTop(app) {
    const ranked = [...ANIME].filter(a => a.score).sort((a, b) => b.score - a.score);
    const perPage = 30;
    const totalPages = Math.ceil(ranked.length / perPage);
    const page = state.topPage;
    const start = (page - 1) * perPage;
    const items = ranked.slice(start, start + perPage);

    app.innerHTML = `
        <section class="section" style="margin-top:0">
            <div class="section-header">
                <h2 class="section-title">🏆 Top Rated Anime</h2>
            </div>
            <p class="results-count">${ranked.length.toLocaleString()} anime with scores</p>
            <div class="list-view">${items.map((a, i) => listItem(a, start + i + 1)).join('')}</div>
            ${totalPages > 1 ? pagination(page, totalPages, 'top') : ''}
        </section>
    `;
}

function updateBrowse(key, value) {
    state.browseFilters[key] = value;
    state.browsePage = 1;
    const params = new URLSearchParams();
    if (state.browseFilters.genre) params.set('genre', state.browseFilters.genre);
    if (state.browseFilters.year) params.set('year', state.browseFilters.year);
    if (state.browseFilters.type) params.set('type', state.browseFilters.type);
    if (state.browseFilters.sort) params.set('sort', state.browseFilters.sort);
    location.hash = `#/browse${params.toString() ? '?' + params.toString() : ''}`;
}

function goPage(page, type) {
    if (type === 'browse') state.browsePage = page;
    else state.topPage = page;
    render();
}

function pagination(current, total, type) {
    const maxVisible = 7;
    let start = Math.max(1, current - 3);
    let end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    let pages = '';
    if (start > 1) pages += `<button class="page-btn" onclick="goPage(1, '${type}')">1</button><span style="color:var(--text-muted)">...</span>`;
    for (let i = start; i <= end; i++) {
        pages += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goPage(${i}, '${type}')">${i}</button>`;
    }
    if (end < total) pages += `<span style="color:var(--text-muted)">...</span><button class="page-btn" onclick="goPage(${total}, '${type}')">${total}</button>`;

    return `<div class="pagination">
        <button class="page-btn" onclick="goPage(${current - 1}, '${type}')" ${current <= 1 ? 'disabled' : ''}>←</button>
        ${pages}
        <button class="page-btn" onclick="goPage(${current + 1}, '${type}')" ${current >= total ? 'disabled' : ''}>→</button>
    </div>`;
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
    return `
        <div class="anime-card" onclick="location.hash='#/anime/${a.id}'">
            <div class="anime-card-img">
                ${a.img ? `<img src="${a.img}" alt="${esc(a.title)}" loading="lazy">` : '<div style="width:100%;height:100%;background:var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem">🎬</div>'}
                ${a.rank ? `<span class="anime-card-rank">#${a.rank}</span>` : ''}
                ${a.score ? `<span class="anime-card-score">⭐ ${a.score}</span>` : ''}
            </div>
            <div class="anime-card-body">
                <div class="anime-card-title">${esc(a.title)}</div>
                <div class="anime-card-meta">${a.type || 'TV'}${a.year ? ' · ' + a.year : ''}</div>
            </div>
        </div>
    `;
}

function listItem(a, rankOverride) {
    const rank = rankOverride || a.rank;
    return `
        <div class="list-item" onclick="location.hash='#/anime/${a.id}'">
            ${rank ? `<span class="list-item-rank">#${rank}</span>` : ''}
            ${a.img ? `<img src="${a.img}" alt="${esc(a.title)}" loading="lazy">` : ''}
            <div class="list-item-info">
                <div class="list-item-title">${esc(a.title)}</div>
                <div class="list-item-meta">${a.type || 'TV'}${a.year ? ' · ' + a.year : ''} · ${(a.genres || []).slice(0, 3).map(esc).join(', ')}</div>
            </div>
            ${a.score ? `<span class="list-item-score">⭐ ${a.score}</span>` : ''}
        </div>
    `;
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
    if (text.classList.contains('expanded')) {
        text.classList.remove('expanded');
        btn.textContent = 'Read more';
    } else {
        text.classList.add('expanded');
        btn.textContent = 'Read less';
    }
}

function loadTrailer(youtubeId) {
    const container = document.getElementById('trailer-container');
    if (!container) return;
    container.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0" style="width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
