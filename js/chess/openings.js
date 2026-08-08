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

function identifyOpening(historySans, fensAfterMoves) {
    // Continuous prefix from the start only — leaving book ends the match
    if (OPENING_FEN_MAP) {
        let bestMatch = { name: "Custom Game", count: 0 };
        for (let i = 0; i < fensAfterMoves.length; i++) {
            const board = fensAfterMoves[i].split(' ')[0];
            const name = OPENING_FEN_MAP.get(board);
            if (!name) break;
            bestMatch = { name, count: i + 1 };
        }
        return bestMatch;
    }

    let bestMatch = { name: "Custom Game", count: 0 };
    const cleanHistory = historySans.map(m => cleanMove(m));
    for (const op of ACTIVE_OPENING_BOOK) {
        if (!op.moves) continue;
        const opMovesClean = op.moves.map(m => cleanMove(m));
        let matchCount = 0;
        for (let i = 0; i < opMovesClean.length; i++) {
            if (i >= cleanHistory.length || cleanHistory[i] !== opMovesClean[i]) break;
            matchCount++;
        }
        if (matchCount > bestMatch.count) {
            bestMatch = { name: op.name, count: matchCount };
        }
    }
    return bestMatch;
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
