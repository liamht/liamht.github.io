/* chess/pieces.js — piece identity, survival, and mate delivery */

/** Starting roster with queen/king-side names (same labels for both colours). */
const STARTING_PIECE_DEFS = [
    { key: 'qr', fileRank: ['a1', 'a8'], label: "Queen's rook", short: 'QR', type: 'r' },
    { key: 'qn', fileRank: ['b1', 'b8'], label: "Queen's knight", short: 'QN', type: 'n' },
    { key: 'qb', fileRank: ['c1', 'c8'], label: "Queen's bishop", short: 'QB', type: 'b' },
    { key: 'q', fileRank: ['d1', 'd8'], label: 'Queen', short: 'Q', type: 'q' },
    { key: 'k', fileRank: ['e1', 'e8'], label: 'King', short: 'K', type: 'k' },
    { key: 'kb', fileRank: ['f1', 'f8'], label: "King's bishop", short: 'KB', type: 'b' },
    { key: 'kn', fileRank: ['g1', 'g8'], label: "King's knight", short: 'KN', type: 'n' },
    { key: 'kr', fileRank: ['h1', 'h8'], label: "King's rook", short: 'KR', type: 'r' },
    { key: 'pa', fileRank: ['a2', 'a7'], label: 'a-pawn', short: 'aP', type: 'p' },
    { key: 'pb', fileRank: ['b2', 'b7'], label: 'b-pawn', short: 'bP', type: 'p' },
    { key: 'pc', fileRank: ['c2', 'c7'], label: 'c-pawn', short: 'cP', type: 'p' },
    { key: 'pd', fileRank: ['d2', 'd7'], label: 'd-pawn', short: 'dP', type: 'p' },
    { key: 'pe', fileRank: ['e2', 'e7'], label: 'e-pawn', short: 'eP', type: 'p' },
    { key: 'pf', fileRank: ['f2', 'f7'], label: 'f-pawn', short: 'fP', type: 'p' },
    { key: 'pg', fileRank: ['g2', 'g7'], label: 'g-pawn', short: 'gP', type: 'p' },
    { key: 'ph', fileRank: ['h2', 'h7'], label: 'h-pawn', short: 'hP', type: 'p' }
];

const MATE_PIECE_ORDER = [
    { type: 'q', label: 'Queen' },
    { type: 'r', label: 'Rook' },
    { type: 'b', label: 'Bishop' },
    { type: 'n', label: 'Knight' },
    { type: 'p', label: 'Pawn' },
    { type: 'k', label: 'King' }
];

function createSideRoster(color) {
    const idx = color === 'w' ? 0 : 1;
    const bySquare = {};
    const byId = {};
    for (const def of STARTING_PIECE_DEFS) {
        const id = color + ':' + def.key;
        const square = def.fileRank[idx];
        const piece = {
            id,
            color,
            key: def.key,
            label: def.label,
            short: def.short,
            type: def.type,
            square,
            alive: true,
            diedAtPly: null,
            promotedTo: null
        };
        byId[id] = piece;
        bySquare[square] = id;
    }
    return { bySquare, byId };
}

function findPieceIdOnSquare(roster, square) {
    return roster.bySquare[square] || null;
}

function clearSquare(roster, square) {
    const id = roster.bySquare[square];
    if (!id) return;
    delete roster.bySquare[square];
    if (roster.byId[id]) roster.byId[id].square = null;
}

function placePiece(roster, id, square) {
    const piece = roster.byId[id];
    if (!piece) return;
    if (piece.square) delete roster.bySquare[piece.square];
    piece.square = square;
    roster.bySquare[square] = id;
}

function killPiece(roster, id, ply) {
    const piece = roster.byId[id];
    if (!piece || !piece.alive) return;
    piece.alive = false;
    piece.diedAtPly = ply;
    if (piece.square) {
        delete roster.bySquare[piece.square];
        piece.square = null;
    }
}

/**
 * Replay a PGN and track each starting piece until capture (or game end).
 * Survival is reported in full moves.
 */
function trackPieceLifetimes(pgn) {
    const empty = { white: [], black: [], totalPlies: 0 };
    if (!pgn) return empty;
    try {
        const chess = new Chess();
        if (!chess.load_pgn(pgn)) return empty;
        const history = chess.history({ verbose: true });
        const white = createSideRoster('w');
        const black = createSideRoster('b');
        const rosters = { w: white, b: black };

        for (let i = 0; i < history.length; i++) {
            const mv = history[i];
            const ply = i + 1;
            const mover = rosters[mv.color];
            const foe = rosters[mv.color === 'w' ? 'b' : 'w'];

            // Captures (including en passant)
            if (mv.captured) {
                let capSq = mv.to;
                if (mv.flags && mv.flags.includes('e')) {
                    const rank = mv.color === 'w' ? '5' : '4';
                    capSq = mv.to[0] + rank;
                }
                const victimId = findPieceIdOnSquare(foe, capSq);
                if (victimId) killPiece(foe, victimId, ply);
            }

            const moverId = findPieceIdOnSquare(mover, mv.from);
            if (moverId) {
                placePiece(mover, moverId, mv.to);
                if (mv.promotion) {
                    mover.byId[moverId].promotedTo = mv.promotion;
                    mover.byId[moverId].type = mv.promotion;
                }
            }

            // Castling: also move the rook
            if (mv.flags && (mv.flags.includes('k') || mv.flags.includes('q'))) {
                const isKingSide = mv.flags.includes('k');
                if (mv.color === 'w') {
                    const from = isKingSide ? 'h1' : 'a1';
                    const to = isKingSide ? 'f1' : 'd1';
                    const rookId = findPieceIdOnSquare(mover, from);
                    if (rookId) placePiece(mover, rookId, to);
                } else {
                    const from = isKingSide ? 'h8' : 'a8';
                    const to = isKingSide ? 'f8' : 'd8';
                    const rookId = findPieceIdOnSquare(mover, from);
                    if (rookId) placePiece(mover, rookId, to);
                }
            }
        }

        const totalPlies = history.length;
        const listFrom = (color, roster) => STARTING_PIECE_DEFS.map(def => {
            const p = roster.byId[color + ':' + def.key];
            const died = p.diedAtPly;
            const survivalPlies = died != null ? died : Math.max(totalPlies, 0);
            return {
                key: def.key,
                label: def.label,
                short: def.short,
                type: def.type,
                alive: p.alive,
                diedAtPly: died,
                survivalPlies,
                survivalMoves: Math.max(0, Math.round((survivalPlies / 2) * 10) / 10),
                promotedTo: p.promotedTo
            };
        });

        return {
            white: listFrom('w', white),
            black: listFrom('b', black),
            totalPlies
        };
    } catch (_) {
        return empty;
    }
}

function matePieceLabel(type) {
    return ({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn', k: 'King' })[type] || 'Piece';
}

/** Piece type that delivered checkmate (last move), or null. */
function matingPieceFromPgn(pgn) {
    if (!pgn) return null;
    try {
        const chess = new Chess();
        if (!chess.load_pgn(pgn)) return null;
        const history = chess.history({ verbose: true });
        if (!history.length) return null;
        const replay = new Chess();
        for (const mv of history) replay.move(mv);
        const last = history[history.length - 1];
        const isMate = (last.san && last.san.includes('#')) ||
            (typeof replay.in_checkmate === 'function' && replay.in_checkmate());
        if (!isMate) return null;
        return last.promotion || last.piece || null;
    } catch (_) {
        return null;
    }
}

function wonByCheckmate(analysis) {
    if (!analysis || analysis.result !== 'WIN') return false;
    if ((analysis.oppResultDetail || '').toLowerCase() === 'checkmated') return true;
    const last = analysis.moves?.[analysis.moves.length - 1];
    return !!(last && isPlayerMove(analysis, last) && String(last.san || '').includes('#'));
}

/**
 * Aggregate average survival (full moves) for the reviewed player's pieces
 * as White and as Black across the profile sample.
 */
function aggregatePieceSurvival(profile) {
    const sides = {
        white: {},
        black: {}
    };
    for (const def of STARTING_PIECE_DEFS) {
        sides.white[def.key] = { label: def.label, short: def.short, type: def.type, sum: 0, n: 0, deaths: 0 };
        sides.black[def.key] = { label: def.label, short: def.short, type: def.type, sum: 0, n: 0, deaths: 0 };
    }

    for (const g of profile.analyzedGames || []) {
        let list = g.pieceSurvival;
        if (!list) {
            if (!g.pgn) continue;
            const life = trackPieceLifetimes(g.pgn);
            list = g.isWhite ? life.white : life.black;
            g.pieceSurvival = list;
        }
        const bucket = g.isWhite ? sides.white : sides.black;
        for (const p of list) {
            const row = bucket[p.key];
            if (!row) continue;
            row.sum += p.survivalMoves;
            row.n += 1;
            if (!p.alive) row.deaths += 1;
        }
    }

    const toRows = (bucket) => STARTING_PIECE_DEFS.map(def => {
        const row = bucket[def.key];
        return {
            key: def.key,
            label: def.label,
            short: def.short,
            type: def.type,
            avgMoves: row.n ? Math.round((row.sum / row.n) * 10) / 10 : null,
            games: row.n,
            deathRate: row.n ? Math.round((row.deaths / row.n) * 1000) / 10 : null
        };
    });

    return {
        white: toRows(sides.white),
        black: toRows(sides.black)
    };
}

function aggregateCheckmatePieces(profile) {
    const counts = { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 };
    let total = 0;
    for (const g of profile.analyzedGames || []) {
        if (!wonByCheckmate(g)) continue;
        // Must be our mating move
        const last = (g.moves || [])[g.moves.length - 1];
        if (last && !isPlayerMove(g, last)) continue;
        let type = g.matePiece;
        if (type === undefined) {
            type = g.pgn ? matingPieceFromPgn(g.pgn) : null;
            g.matePiece = type;
        }
        if (!type || counts[type] == null) continue;
        counts[type] += 1;
        total += 1;
    }
    const rows = MATE_PIECE_ORDER.map(p => ({
        type: p.type,
        label: p.label,
        count: counts[p.type] || 0,
        pct: total ? Math.round((counts[p.type] / total) * 1000) / 10 : 0
    })).filter(r => r.count > 0);
    return { total, rows };
}

function renderPieceSurvivalPanel(profile, survivalData) {
    const el = document.getElementById('analysis-piece-survival');
    if (!el) return;
    const data = survivalData || aggregatePieceSurvival(profile);
    const hasWhite = data.white.some(r => r.games > 0);
    const hasBlack = data.black.some(r => r.games > 0);
    if (!hasWhite && !hasBlack) {
        el.innerHTML = '<div class="insight-empty">Piece survival will appear after games with PGNs are analyzed.</div>';
        return;
    }

    const col = (title, rows) => {
        if (!rows.some(r => r.games > 0)) {
            return `<div class="survival-col"><div class="profile-kicker">${title}</div><div class="insight-empty">No games.</div></div>`;
        }
        const pawns = rows.filter(r => r.type === 'p');
        const pieces = rows.filter(r => r.type !== 'p');
        const rowHtml = (r) => {
            if (!r.games) return '';
            const maxAvg = Math.max(...rows.filter(x => x.avgMoves != null).map(x => x.avgMoves), 1);
            const width = r.avgMoves != null ? Math.max(6, Math.round((r.avgMoves / maxAvg) * 100)) : 0;
            return `
                <div class="survival-row" title="${r.label}: avg ${r.avgMoves} moves · captured in ${r.deathRate}% of games">
                    <div class="survival-label">${r.label}</div>
                    <div class="survival-track"><div class="survival-fill" style="width:${width}%"></div></div>
                    <div class="survival-val">${r.avgMoves}<span class="survival-sub">mv</span></div>
                </div>
            `;
        };
        return `
            <div class="survival-col">
                <div class="profile-kicker">${title}</div>
                <div class="survival-group-label">Pieces</div>
                ${pieces.map(rowHtml).join('')}
                <div class="survival-group-label">Pawns</div>
                ${pawns.map(rowHtml).join('')}
            </div>
        `;
    };

    el.innerHTML = `
        <div class="survival-grid">
            ${col('As White', data.white)}
            ${col('As Black', data.black)}
        </div>
        <div class="heatmap-note mt-2">Average full moves until that starting piece is captured (or the game ends). Queen’s / King’s names follow the starting file.</div>
    `;
}

function renderCheckmateWithPanel(profile, matesData) {
    const el = document.getElementById('analysis-checkmates');
    if (!el) return;
    const { total, rows } = matesData || aggregateCheckmatePieces(profile);
    if (!total) {
        el.innerHTML = '<div class="insight-empty">No checkmate wins in this sample yet — wins by resignation/timeout won’t appear here.</div>';
        return;
    }
    el.innerHTML = `
        <div class="mate-meta">${total} checkmate win${total === 1 ? '' : 's'} in this sample</div>
        ${rows.map(r => `
            <div class="mate-row">
                <div class="mate-label">${r.label}</div>
                <div class="mate-track"><div class="mate-fill" style="width:${Math.max(r.pct, 3)}%"></div></div>
                <div class="mate-pct">${r.pct}%</div>
                <div class="mate-count">${r.count}×</div>
            </div>
        `).join('')}
    `;
}
