/* chess/cache.js — Analyze Chess */

function getGameKey(game) {
    if (game.url) return String(game.url);
    if (game.uuid) return String(game.uuid);
    // Stable-ish fallback from players + end time
    return [game.end_time || '', game.white?.username || '', game.black?.username || '', (game.pgn || '').slice(0, 80)].join('|');
}

function cacheStorageKey(username, gameKey, version = CACHE_VERSION) {
    return `chessAnalyzed:v${version}:${username.toLowerCase()}:${gameKey}`;
}

function cacheIndexKey(username, version = CACHE_VERSION) {
    return `chessAnalyzed:v${version}:index:${username.toLowerCase()}`;
}

function readCacheIndex(username) {
    try {
        const raw = localStorage.getItem(cacheIndexKey(username));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

function writeCacheIndex(username, index) {
    localStorage.setItem(cacheIndexKey(username), JSON.stringify(index));
}

function compactAnalysisForCache(analysis) {
    // Drop per-move FENs (rebuilt from PGN on load) to stay under localStorage quota
    const clone = JSON.parse(JSON.stringify(analysis));
    if (Array.isArray(clone.moves)) {
        for (const m of clone.moves) delete m.fen;
    }
    return clone;
}

function hydrateCachedAnalysis(analysis, pgn) {
    if (!analysis?.moves?.length) return analysis;
    const srcPgn = pgn || analysis.pgn;
    if (srcPgn && !analysis.pgn) analysis.pgn = srcPgn;
    // Backfill usernames / Chess.com ELOs for older cache entries
    if (typeof attachGamePlayers === 'function') {
        attachGamePlayers(analysis, null, analysis.username);
    }
    if (typeof attachGameMeta === 'function') {
        attachGameMeta(analysis, null);
    }
    const needsFen = analysis.moves.some(m => !m.fen);
    if (!needsFen || !srcPgn) return analysis;
    try {
        const chess = new Chess();
        if (!chess.load_pgn(srcPgn)) return analysis;
        const history = chess.history({ verbose: true });
        const replay = new Chess();
        const n = Math.min(analysis.moves.length, history.length);
        for (let i = 0; i < n; i++) {
            replay.move(history[i]);
            analysis.moves[i].fen = replay.fen();
            if (!analysis.moves[i].from) analysis.moves[i].from = history[i].from;
            if (!analysis.moves[i].to) analysis.moves[i].to = history[i].to;
            if (!analysis.moves[i].san) analysis.moves[i].san = history[i].san;
        }
    } catch (e) {
        log(`Cache hydrate failed: ${e.message}`, true);
    }
    return analysis;
}

function listCachedGameKeys(username) {
    const prefix = `chessAnalyzed:v${CACHE_VERSION}:${username.toLowerCase()}:`;
    const indexPrefix = cacheIndexKey(username);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix) || k === indexPrefix) continue;
        keys.push(k);
    }
    return keys;
}

function pruneOldestCacheEntry(username) {
    let index = readCacheIndex(username).slice().sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
    if (index.length) {
        const oldest = index.shift();
        localStorage.removeItem(cacheStorageKey(username, oldest.gameKey));
        writeCacheIndex(username, index);
        return true;
    }
    const keys = listCachedGameKeys(username);
    if (keys.length) {
        localStorage.removeItem(keys[0]);
        return true;
    }
    return false;
}

function pruneAnyAnalyzedCache() {
    // Last resort: drop any chessAnalyzed entry (prefer older versions / non-index)
    const victims = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('chessAnalyzed:')) continue;
        if (k.includes(':index:')) continue;
        victims.push(k);
    }
    // Prefer older cache versions
    victims.sort((a, b) => {
        const va = Number((a.match(/^chessAnalyzed:v(\d+):/) || [])[1] || 99);
        const vb = Number((b.match(/^chessAnalyzed:v(\d+):/) || [])[1] || 99);
        return va - vb;
    });
    if (!victims.length) return false;
    localStorage.removeItem(victims[0]);
    return true;
}

function loadCachedAnalysis(username, gameKey) {
    // Same CACHE_VERSION only — version bumps intentionally force re-analysis
    try {
        const raw = localStorage.getItem(cacheStorageKey(username, gameKey));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.moves || !Array.isArray(parsed.moves)) return null;
        parsed.gameKey = gameKey;
        if (!parsed.gameStory) finalizeAnalysis(parsed);
        return parsed;
    } catch (_) {
        return null;
    }
}

function hasCachedAnalysis(username, gameKey) {
    try {
        return !!localStorage.getItem(cacheStorageKey(username, gameKey));
    } catch (_) {
        return false;
    }
}

function rebuildCacheIndexFromStorage(username) {
    const prefix = `chessAnalyzed:v${CACHE_VERSION}:${username.toLowerCase()}:`;
    const indexKey = cacheIndexKey(username);
    const index = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix) || k === indexKey) continue;
        const gameKey = k.slice(prefix.length);
        if (!gameKey) continue;
        let endTime = 0;
        try {
            const parsed = JSON.parse(localStorage.getItem(k) || '');
            endTime = parsed?.endTime || 0;
        } catch (_) {}
        index.push({ gameKey, endTime });
    }
    index.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
    writeCacheIndex(username, index);
    return index;
}

function getCacheIndex(username) {
    let index = readCacheIndex(username);
    if (index.length) return index;
    // Index missing but games may still exist (quota / older builds)
    if (listCachedGameKeys(username).length) return rebuildCacheIndexFromStorage(username);
    return index;
}

function loadAllCachedAnalyses(username) {
    const index = getCacheIndex(username);
    const loaded = [];
    const seen = new Set();
    for (const entry of index) {
        const gameKey = entry.gameKey;
        if (!gameKey || seen.has(gameKey)) continue;
        const analysis = loadCachedAnalysis(username, gameKey);
        if (!analysis) continue;
        seen.add(gameKey);
        if (!analysis.endTime && entry.endTime) analysis.endTime = entry.endTime;
        if (!analysis.username) analysis.username = username;
        hydrateCachedAnalysis(analysis, analysis.pgn);
        analysis.qualityScore = analysis.qualityScore ?? gameQualityScore(analysis);
        loaded.push(analysis);
    }
    return loaded;
}

function saveCachedAnalysis(username, gameKey, analysis) {
    analysis.gameKey = gameKey;
    const payload = compactAnalysisForCache(analysis);
    const raw = JSON.stringify(payload);
    const key = cacheStorageKey(username, gameKey);

    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            localStorage.setItem(key, raw);
            let index = readCacheIndex(username).filter(e => e.gameKey !== gameKey);
            index.push({ gameKey, endTime: analysis.endTime || 0 });
            index.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
            // Grow freely — only prune when quota forces it (below)
            writeCacheIndex(username, index);
            return true;
        } catch (e) {
            const pruned = pruneOldestCacheEntry(username) || pruneAnyAnalyzedCache();
            if (!pruned) {
                log(`Cache save failed (${e.message}). Continuing without cache.`, true);
                return false;
            }
            if (attempt === 0) log('LocalStorage full — pruning older cached games…');
        }
    }
    log('Cache save failed after pruning. Continuing without cache.', true);
    return false;
}
