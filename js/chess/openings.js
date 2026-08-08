/* chess/openings.js — Analyze Chess */

function setOpeningBook(book) {
    ACTIVE_OPENING_BOOK = Array.isArray(book) ? book : INTERNAL_BOOK;
    OPENING_FEN_MAP = null;
    if (ACTIVE_OPENING_BOOK.length && ACTIVE_OPENING_BOOK[0].fen) {
        OPENING_FEN_MAP = new Map();
        for (const op of ACTIVE_OPENING_BOOK) {
            if (op.fen) OPENING_FEN_MAP.set(op.fen.split(' ')[0], op.name);
        }
    }
}

function cleanMove(move) {
    if (!move) return "";
    return move.toString().replace(/^\d+\.+/, '').replace(/[+#?]/g, '').trim();
}

function openingSpecificityScore(name) {
    if (!name || name === 'Custom Game') return 0;
    let score = String(name).length;
    if (String(name).includes(':')) score += 40;
    return score;
}

function pickBetterOpeningMatch(a, b) {
    if ((b.count || 0) > (a.count || 0)) return b;
    if ((a.count || 0) > (b.count || 0)) return a;
    return openingSpecificityScore(b.name) > openingSpecificityScore(a.name) ? b : a;
}

function identifyOpeningByMoves(historySans) {
    let bestMatch = { name: 'Custom Game', count: 0 };
    const cleanHistory = historySans.map(m => cleanMove(m));
    // Prefer move-list entries from the active book, and always include INTERNAL_BOOK
    // so FEN-only catalogs still get SAN fallback for common lines.
    const catalogs = [];
    if (Array.isArray(ACTIVE_OPENING_BOOK)) catalogs.push(ACTIVE_OPENING_BOOK);
    if (Array.isArray(INTERNAL_BOOK)) catalogs.push(INTERNAL_BOOK);
    const seen = new Set();
    for (const catalog of catalogs) {
        for (const op of catalog) {
            if (!op?.moves?.length || !op.name || seen.has(op.name)) continue;
            seen.add(op.name);
            const opMovesClean = op.moves.map(m => cleanMove(m));
            let matchCount = 0;
            for (let i = 0; i < opMovesClean.length; i++) {
                if (i >= cleanHistory.length || cleanHistory[i] !== opMovesClean[i]) break;
                matchCount++;
            }
            if (matchCount > 0) {
                bestMatch = pickBetterOpeningMatch(bestMatch, { name: op.name, count: matchCount });
            }
        }
    }
    return bestMatch;
}

function identifyOpening(historySans, fensAfterMoves) {
    // Continuous prefix from the start only — leaving book ends the match
    let fenMatch = { name: 'Custom Game', count: 0 };
    if (OPENING_FEN_MAP && Array.isArray(fensAfterMoves)) {
        for (let i = 0; i < fensAfterMoves.length; i++) {
            const board = fensAfterMoves[i].split(' ')[0];
            const name = OPENING_FEN_MAP.get(board);
            if (!name) break;
            fenMatch = { name, count: i + 1 };
        }
    }

    const movesMatch = identifyOpeningByMoves(historySans);
    return pickBetterOpeningMatch(fenMatch, movesMatch);
}

// Famous / well-known games for "Theory" tags (fallback if famous-games.json fails)

function setFamousGames(games) {
    ACTIVE_FAMOUS_GAMES = Array.isArray(games) && games.length
        ? games.filter(g => g && g.name && Array.isArray(g.moves) && g.moves.length >= 12)
        : INTERNAL_FAMOUS_GAMES;
}

function famousEra(year) {
    if (!year || year < 1900) return 'Romantic & classics';
    if (year < 1946) return 'Early world champions';
    if (year < 1972) return 'Post-war champions';
    if (year < 2000) return 'Fischer to Kasparov era';
    return 'Modern championships';
}

function formatMovesLine(moves) {
    if (!moves?.length) return '';
    const parts = [];
    for (let i = 0; i < moves.length; i++) {
        if (i % 2 === 0) parts.push(`${Math.floor(i / 2) + 1}.`);
        parts.push(moves[i]);
    }
    return parts.join(' ');
}

function findOpeningByName(name) {
    if (!name) return null;
    const book = ACTIVE_OPENING_BOOK || [];
    const exact = book.find(o => o.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    return book.find(o => (o.name || '').toLowerCase() === lower) || null;
}

function findFamousByName(name) {
    if (!name) return null;
    const catalog = ACTIVE_FAMOUS_GAMES.length ? ACTIVE_FAMOUS_GAMES : INTERNAL_FAMOUS_GAMES;
    const exact = catalog.find(g => g.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    return catalog.find(g => (g.name || '').toLowerCase() === lower)
        || catalog.find(g => (g.name || '').toLowerCase().includes(lower) || lower.includes((g.name || '').toLowerCase()))
        || null;
}

function openingsByFamily() {
    const map = new Map();
    for (const op of (ACTIVE_OPENING_BOOK || [])) {
        if (!op?.name) continue;
        const family = openingFamily(op.name);
        if (!map.has(family)) map.set(family, []);
        map.get(family).push(op);
    }
    for (const list of map.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function famousByEra() {
    const map = new Map();
    const catalog = ACTIVE_FAMOUS_GAMES.length ? ACTIVE_FAMOUS_GAMES : INTERNAL_FAMOUS_GAMES;
    for (const g of catalog) {
        const era = famousEra(g.year);
        if (!map.has(era)) map.set(era, []);
        map.get(era).push(g);
    }
    for (const list of map.values()) {
        list.sort((a, b) => (a.year || 0) - (b.year || 0) || a.name.localeCompare(b.name));
    }
    const order = [
        'Romantic & classics',
        'Early world champions',
        'Post-war champions',
        'Fischer to Kasparov era',
        'Modern championships'
    ];
    return order.filter(k => map.has(k)).map(k => [k, map.get(k)]);
}

function identifyTheory(historySans) {
    const cleanHistory = historySans.map(m => cleanMove(m));
    let best = { name: null, count: 0 };
    const catalog = ACTIVE_FAMOUS_GAMES.length ? ACTIVE_FAMOUS_GAMES : INTERNAL_FAMOUS_GAMES;
    for (const game of catalog) {
        let matchCount = 0;
        for (let i = 0; i < game.moves.length; i++) {
            if (i >= cleanHistory.length || cleanHistory[i] !== cleanMove(game.moves[i])) break;
            matchCount++;
        }
        // Require a meaningful famous-game stretch (not just the first few opening moves)
        if (matchCount >= 12 && matchCount > best.count) {
            best = { name: game.name, count: matchCount };
        }
    }
    return best;
}

function openingFamily(name) {
    if (!name || name === 'Custom Game') return 'Custom / Unknown';
    return name.split(':')[0].trim();
}
