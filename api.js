const API = {
    ANILIST_BASE: 'https://graphql.anilist.co',
    NHENTAI_BASE: 'https://nhentai.net/api/v2',
    CACHE_TTL: 3600000,
    CACHE_PREFIX: 'api_cache_v2_',
    DOUJINSHI_TAG_ID: 'b13b2a48-c720-44a9-9c77-39c9979373fb',
    _inflight: new Map(),

    cache: {
        ttlFor(key) {
            if (key.includes('"SEARCH_MATCH"') || key.includes('SEARCH_MATCH')) return 10 * 60 * 1000;
            if (key.includes('POPULARITY_DESC')) return 60 * 60 * 1000;
            if (key.includes('Media(')) return 24 * 60 * 60 * 1000;
            return API.CACHE_TTL;
        },
        hash(s) {
            let h1 = 0x811c9dc5, h2 = 0x01000193;
            for (let i = 0; i < s.length; i++) {
                h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
                h2 = Math.imul(h2 + s.charCodeAt(i), 31) >>> 0;
            }
            return (h1.toString(16) + h2.toString(16)).slice(0, 16);
        },
        get(key) {
            try {
                const k = API.CACHE_PREFIX + API.cache.hash(key);
                const item = localStorage.getItem(k);
                if (!item) return null;
                const { data, timestamp, ttl } = JSON.parse(item);
                const maxAge = ttl || API.cache.ttlFor(key);
                if (Date.now() - timestamp > maxAge) {
                    localStorage.removeItem(k);
                    return null;
                }
                // legacy cleanup
                try { localStorage.removeItem('api_cache_' + key); } catch {}
                return data;
            } catch { return null; }
        },
        set(key, data) {
            try {
                const k = API.CACHE_PREFIX + API.cache.hash(key);
                const ttl = API.cache.ttlFor(key);
                try {
                    localStorage.setItem(k, JSON.stringify({ data, timestamp: Date.now(), ttl }));
                } catch (e) {
                    // Quota: evict oldest v2 entries then retry once
                    try {
                        const keys = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const lk = localStorage.key(i);
                            if (lk && lk.startsWith(API.CACHE_PREFIX)) keys.push(lk);
                        }
                        keys.slice(0, Math.max(1, Math.floor(keys.length / 4))).forEach(lk => localStorage.removeItem(lk));
                        localStorage.setItem(k, JSON.stringify({ data, timestamp: Date.now(), ttl }));
                    } catch {}
                }
            } catch {}
        },
        clear() {
            try {
                const out = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const lk = localStorage.key(i);
                    if (lk && (lk.startsWith(API.CACHE_PREFIX) || lk.startsWith('api_cache_'))) out.push(lk);
                }
                out.forEach(k => localStorage.removeItem(k));
            } catch {}
        }
    },

    async fetchWithTimeout(url, options = {}, ms = 10000) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
            return await fetch(url, { ...options, signal: ctrl.signal });
        } finally { clearTimeout(t); }
    },

    async fetchJSON(url, options = {}) {
        const cacheKey = url + JSON.stringify(options);
        const cached = API.cache.get(cacheKey);
        if (cached) return cached;

        const response = await API.fetchWithTimeout(url, {
            ...options,
            headers: { 'Accept': 'application/json', ...options.headers }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        API.cache.set(cacheKey, data);
        return data;
    },

    async anilist(variables, query) {
        const body = JSON.stringify({ query, variables });
        const cached = API.cache.get('anilist:' + body);
        if (cached) return cached;
        if (API._inflight.has(body)) return API._inflight.get(body);
        const p = (async () => {
            let lastErr = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const response = await API.fetchWithTimeout(API.ANILIST_BASE, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body
                    }, 12000);
                    if (response.status === 429) {
                        const wait = parseInt(response.headers.get('Retry-After') || '5', 10) * 1000;
                        await new Promise(r => setTimeout(r, Math.min(wait, 15000)));
                        lastErr = new Error('HTTP 429');
                        continue;
                    }
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    if (data.errors) throw new Error(data.errors[0]?.message || 'AniList error');
                    API.cache.set('anilist:' + body, data);
                    return data;
                } catch (e) {
                    lastErr = e;
                    if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                }
            }
            throw lastErr || new Error('AniList error');
        })();
        API._inflight.set(body, p);
        try { return await p; } finally { API._inflight.delete(body); }
    },

    async mangaSearch(query, limit = 20, offset = 0) {
        const q = `query($s:String,$p:Int,$pp:Int){Page(page:$p,perPage:$pp){media(search:$s,type:MANGA,isAdult:false,sort:SEARCH_MATCH){id title{romaji english native} coverImage{large extraLarge} description format status genres averageScore chapters volumes countryOfOrigin startDate{year}}}}`;
        const data = await API.anilist({ s: query, p: Math.floor(offset / limit) + 1, pp: limit }, q);
        return { data: data.data.Page.media };
    },

    async mangaList(limit = 20, offset = 0, filters = {}) {
        const vars = { p: Math.floor(offset / limit) + 1, pp: limit };
        const args = ['type:MANGA', 'isAdult:false', 'sort:POPULARITY_DESC'];
        if (filters.countryOfOrigin) {
            vars.cc = filters.countryOfOrigin;
            args.push('countryOfOrigin:$cc');
        }
        if (filters.genre) {
            vars.g = filters.genre;
            args.push('genre:$g');
        }
        if (filters.status) {
            vars.st = filters.status;
            args.push('status:$st');
        }
        if (filters.tagId === API.DOUJINSHI_TAG_ID || filters.search === 'doujinshi') {
            vars.s = 'doujinshi';
            args.push('search:$s');
        } else if (filters.search) {
            vars.s = filters.search;
            args.push('search:$s');
        }
        const q = `query($p:Int,$pp:Int${vars.cc ? ',$cc:CountryCode' : ''}${vars.g ? ',$g:String' : ''}${vars.st ? ',$st:MediaStatus' : ''}${vars.s ? ',$s:String' : ''}){Page(page:$p,perPage:$pp){media(${args.join(',')}){id title{romaji english native} coverImage{large extraLarge} description format status genres averageScore chapters volumes countryOfOrigin startDate{year}}}}`;
        const data = await API.anilist(vars, q);
        return { data: data.data.Page.media };
    },

    async mangaDetails(id) {
        const nid = parseInt(id, 10);
        if (!Number.isInteger(nid)) throw new Error('Invalid id');
        const q = `query($id:Int){Media(id:$id,type:MANGA){id title{romaji english native} coverImage{large extraLarge} bannerImage description format status genres tags{name} averageScore popularity chapters volumes countryOfOrigin startDate{year} siteUrl externalLinks{site url} staff{edges{role node{name{full}}}}}}`;
        const data = await API.anilist({ id: nid }, q);
        return { data: data.data.Media };
    },

    async mangaFeed(id, limit = 100) {
        return { data: [] };
    },

    async doujinTryFetch(url) {
        const response = await API.fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 9000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    async doujinSearch(query, page = 1) {
        try {
            const params = new URLSearchParams({ query, page: page.toString() });
            const data = await API.doujinTryFetch(`${API.NHENTAI_BASE}/galleries?${params}`);
            return data;
        } catch (e) {
            const q = `query($s:String){Page(perPage:25){media(search:$s,type:MANGA,isAdult:true,sort:SEARCH_MATCH){id title{romaji english native} coverImage{large} description genres averageScore chapters countryOfOrigin status}}}`;
            const data = await API.anilist({ s: query }, q);
            return { result: data.data.Page.media, _fallback: 'anilist' };
        }
    },

    async doujinPopular(page = 1) {
        try {
            const data = await API.doujinTryFetch(`${API.NHENTAI_BASE}/galleries/popular?page=${page}`);
            return data;
        } catch (e) {
            const q = `query{Page(perPage:25){media(type:MANGA,isAdult:true,sort:POPULARITY_DESC){id title{romaji english native} coverImage{large} description genres averageScore chapters countryOfOrigin status}}}`;
            const data = await API.anilist({}, q);
            return data.data.Page.media.map(m => ({ ...m, _anilist: true }));
        }
    },

    async doujinDetails(id) {
        const nid = parseInt(id, 10);
        if (!Number.isInteger(nid)) throw new Error('Invalid id');
        try {
            return await API.doujinTryFetch(`${API.NHENTAI_BASE}/galleries/${nid}`);
        } catch (e) {
            const q = `query($id:Int){Media(id:$id,type:MANGA){id title{romaji english native} coverImage{large extraLarge} description format status genres tags{name} averageScore popularity chapters volumes countryOfOrigin startDate{year}}}`;
            const data = await API.anilist({ id: nid }, q);
            if (!data.data.Media) throw new Error('Not found');
            return { ...data.data.Media, _anilist: true };
        }
    },

    async doujinRelated(id, page = 1) {
        try {
            return await API.doujinTryFetch(`${API.NHENTAI_BASE}/galleries/${id}/related?page=${page}`);
        } catch (e) {
            return { result: [] };
        }
    },

    async animeWatch(title) {
        const q = `query($s:String){Media(search:$s,type:ANIME){id title{english romaji} trailer{id site thumbnail} siteUrl streamingEpisodes{title thumbnail url site} externalLinks{site url}}}`;
        const data = await API.anilist({ s: title }, q);
        return data.data.Media;
    },

    stripHtml(s) {
        if (!s) return '';
        if (typeof document !== 'undefined' && document.createElement) {
            const div = document.createElement('div');
            const withBreaks = String(s).replace(/<br\s*\/?>/gi, '\n');
            // Strip tags safely via textContent (no script execution in detached node)
            div.textContent = '';
            const tmp = document.createElement('div');
            tmp.innerHTML = withBreaks;
            return (tmp.textContent || '').replace(/\s+\n/g, '\n').trim();
        }
        return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    },

    prettyStatus(s) {
        if (!s) return null;
        const map = { FINISHED: 'Finished', RELEASING: 'Releasing', NOT_YET_RELEASED: 'Not yet released', HIATUS: 'Hiatus', CANCELLED: 'Cancelled' };
        return map[s] || s;
    },

    parseManga(m) {
        if (!m || !m.title) return null;
        const title = m.title.english || m.title.romaji || m.title.native || 'Unknown';
        const year = m.startDate?.year || m.year || null;
        const score = m.averageScore ? Math.round((m.averageScore / 10) * 10) / 10 : null;
        const country = m.countryOfOrigin || null;
        let type = m.format || 'Manga';
        if (country === 'KR') type = 'Manhwa';
        else if (country === 'CN') type = 'Manhua';
        else if (type === 'ONE_SHOT') type = 'One-shot';
        else if (type === 'NOVEL') type = 'Novel';
        else type = 'Manga';

        const staff = (m.staff?.edges || []).filter(e => e.node?.name?.full);
        const authors = staff.filter(e => /story|author|original/i.test(e.role || '')).map(e => e.node.name.full);
        const artists = staff.filter(e => /art/i.test(e.role || '')).map(e => e.node.name.full);

        return {
            id: m.id,
            title,
            title_en: m.title.english && m.title.english !== title ? m.title.english : (m.title.romaji && m.title.romaji !== title ? m.title.romaji : null),
            title_jp: m.title.native || null,
            img: m.coverImage?.extraLarge || m.coverImage?.large || null,
            banner: m.bannerImage || null,
            type,
            chapters: m.chapters || null,
            volumes: m.volumes || null,
            score,
            rank: null,
            popularity: m.popularity || null,
            members: null,
            favorites: null,
            synopsis: API.stripHtml(m.description) || null,
            status: API.prettyStatus(m.status),
            year,
            genres: (m.genres || []).filter(Boolean),
            themes: (m.tags || []).map(t => t.name).filter(Boolean).slice(0, 20),
            demographics: [],
            countryOfOrigin: country,
            authors,
            artists,
            siteUrl: m.siteUrl || null,
            externalLinks: (m.externalLinks || []).slice(0, 6),
            source: 'anilist'
        };
    },

    parseDoujin(g) {
        if (!g) return null;
        if (g._anilist || (g.title && (g.title.romaji !== undefined || g.coverImage))) {
            const title = g.title.english || g.title.romaji || g.title.native || 'Unknown';
            return {
                id: g.id,
                title,
                title_en: g.title.english || null,
                title_jp: g.title.native || null,
                img: g.coverImage?.extraLarge || g.coverImage?.large || null,
                type: 'Hentai',
                chapters: g.chapters || null,
                score: g.averageScore ? Math.round((g.averageScore / 10) * 10) / 10 : null,
                rank: null,
                popularity: null,
                members: null,
                favorites: null,
                synopsis: API.stripHtml(g.description) || null,
                status: API.prettyStatus(g.status),
                rating: 'Rx - Hentai',
                year: g.startDate?.year || null,
                genres: (g.genres || []).filter(Boolean),
                themes: (g.tags || []).map(t => t.name).filter(Boolean).slice(0, 20),
                demographics: [],
                tags: (g.genres || []).concat((g.tags || []).map(t => t.name)).filter(Boolean),
                artists: [],
                parody: [],
                source: 'anilist-adult'
            };
        }
        const t = g.title || {};
        const title = typeof t === 'string' ? t : (t.english || t.pretty || t.japanese || g.english_title || g.pretty || g.japanese_title || 'Unknown');
        const titleEn = (typeof t === 'object' && t.english) ? t.english : (g.english_title || null);
        const titleJp = (typeof t === 'object' && t.japanese) ? t.japanese : (g.japanese_title || null);
        const tags = g.tags || [];
        const tagNames = tags.map(x => x.name || x).filter(Boolean);
        const byType = (type) => tags.filter(x => x.type === type).map(x => x.name);
        let coverUrl = null;
        if (typeof g.thumbnail === 'string') coverUrl = `https://t.nhentai.net/${g.thumbnail}`;
        else if (g.cover?.path) coverUrl = `https://t.nhentai.net/${g.cover.path}`;
        else if (g.thumbnail?.path) coverUrl = `https://t.nhentai.net/${g.thumbnail.path}`;
        const uploadDate = g.upload_date ? new Date(g.upload_date * 1000) : null;

        return {
            id: g.id,
            title,
            title_en: titleEn,
            title_jp: titleJp,
            img: coverUrl,
            type: 'Doujin',
            chapters: g.num_pages || null,
            score: null,
            rank: null,
            popularity: null,
            members: g.num_favorites || null,
            favorites: g.num_favorites || null,
            synopsis: null,
            status: 'Completed',
            rating: 'Rx - Hentai',
            year: uploadDate && !isNaN(uploadDate) ? uploadDate.getFullYear() : null,
            genres: byType('parody').length ? byType('parody') : tagNames.filter(n => /parody/i.test(n)),
            themes: tagNames.filter(n => !/^(english|translated|parody|doujinshi|manga)$/i.test(n)).slice(0, 20),
            demographics: [],
            tags: tagNames,
            artists: byType('artist'),
            parody: byType('parody'),
            mediaId: g.media_id,
            pages: (g.pages || []).map(p => ({ n: p.number, path: p.path, thumb: p.thumbnail, w: p.width, h: p.height })),
            source: 'nhentai'
        };
    }
};
