/* chess/tactics.js — Analyze Chess */

function sqCoords(sq) {
    return { c: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) };
}
function coordsSq(r, c) {
    return String.fromCharCode(97 + c) + (8 - r);
}
function onSameLine(a, b, c) {
    const A = sqCoords(a), B = sqCoords(b), C = sqCoords(c);
    const cross = (B.r - A.r) * (C.c - A.c) - (B.c - A.c) * (C.r - A.r);
    if (cross !== 0) return false;
    return Math.min(A.r, B.r) <= C.r && C.r <= Math.max(A.r, B.r)
        && Math.min(A.c, B.c) <= C.c && C.c <= Math.max(A.c, B.c);
}
function clearPath(board, r1, c1, r2, c2) {
    const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
    let r = r1 + dr, c = c1 + dc;
    while (r !== r2 || c !== c2) {
        if (board[r][c]) return false;
        r += dr; c += dc;
    }
    return true;
}
function canPieceAttack(board, piece, r, c, tr, tc) {
    const dr = tr - r, dc = tc - c;
    const adr = Math.abs(dr), adc = Math.abs(dc);
    if (piece.type === 'n') return (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
    if (piece.type === 'k') return adr <= 1 && adc <= 1 && (adr + adc > 0);
    if (piece.type === 'p') {
        const dir = piece.color === 'w' ? -1 : 1;
        return dr === dir && adc === 1;
    }
    if (piece.type === 'b' || piece.type === 'q') {
        if (adr === adc && adr > 0 && clearPath(board, r, c, tr, tc)) return true;
    }
    if (piece.type === 'r' || piece.type === 'q') {
        if ((dr === 0 || dc === 0) && (adr + adc) > 0 && clearPath(board, r, c, tr, tc)) return true;
    }
    return false;
}
function getAttackers(chess, square, byColor) {
    const { r: tr, c: tc } = sqCoords(square);
    const board = chess.board();
    const out = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.color !== byColor) continue;
            if (canPieceAttack(board, p, r, c, tr, tc)) {
                out.push({ square: coordsSq(r, c), type: p.type, color: p.color, value: PIECE_VAL[p.type] });
            }
        }
    }
    return out;
}
function isHanging(chess, square, ownerColor) {
    const piece = chess.get(square);
    if (!piece || piece.color !== ownerColor || piece.type === 'k') return false;
    const opp = ownerColor === 'w' ? 'b' : 'w';
    const attackers = getAttackers(chess, square, opp);
    if (!attackers.length) return false;
    const defenders = getAttackers(chess, square, ownerColor);
    const minAtk = Math.min(...attackers.map(a => a.value));
    const val = PIECE_VAL[piece.type];
    if (minAtk < val) return true;
    if (!defenders.length) return true;
    if (val >= 5 && attackers.length > defenders.length) return true;
    return false;
}
function eachPieceSquare(chess, color) {
    const squares = [];
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === color) squares.push({ sq: coordsSq(r, c), type: p.type, value: PIECE_VAL[p.type] });
        }
    }
    return squares;
}
function kingCastleWing(chess, color) {
    const king = eachPieceSquare(chess, color).find(p => p.type === 'k');
    if (!king) return null;
    const file = king.sq[0];
    if (file === 'g' || file === 'h') return 'kingside';
    if (file === 'a' || file === 'b' || file === 'c') return 'queenside';
    return null;
}
function allowsFork(chess, victimColor) {
    const opp = victimColor === 'w' ? 'b' : 'w';
    for (const atk of eachPieceSquare(chess, opp)) {
        if (atk.type === 'k') continue;
        const hits = [];
        const piece = chess.get(atk.sq);
        if (!piece) continue;
        const a = sqCoords(atk.sq);
        const board = chess.board();
        for (const vic of eachPieceSquare(chess, victimColor)) {
            if (vic.type !== 'k' && vic.value < 3) continue;
            const v = sqCoords(vic.sq);
            if (canPieceAttack(board, piece, a.r, a.c, v.r, v.c)) hits.push(vic);
        }
        const hasKing = hits.some(h => h.type === 'k');
        const valuables = hits.filter(h => h.type !== 'k' && h.value >= 3);
        if (hasKing && valuables.length) return true;
        if (valuables.length >= 2) return true;
    }
    return false;
}
function isPinnedToRoyalty(chess, square, ownerColor) {
    const piece = chess.get(square);
    if (!piece || piece.color !== ownerColor || piece.type === 'k') return false;
    const royals = eachPieceSquare(chess, ownerColor).filter(p => p.type === 'k' || p.type === 'q');
    const opp = ownerColor === 'w' ? 'b' : 'w';
    const board = chess.board();
    const A = sqCoords(square);
    for (const royal of royals) {
        if (royal.sq === square) continue;
        const B = sqCoords(royal.sq);
        const diag = Math.abs(A.r - B.r) === Math.abs(A.c - B.c);
        const ortho = A.r === B.r || A.c === B.c;
        if (!diag && !ortho) continue;
        if (!clearPath(board, B.r, B.c, A.r, A.c)) continue;
        const dirR = Math.sign(A.r - B.r);
        const dirC = Math.sign(A.c - B.c);
        let r = A.r + dirR, c = A.c + dirC;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const p = board[r][c];
            if (p) {
                if (p.color === opp) {
                    if (diag && (p.type === 'b' || p.type === 'q')) return true;
                    if (ortho && (p.type === 'r' || p.type === 'q')) return true;
                }
                break;
            }
            r += dirR; c += dirC;
        }
    }
    return false;
}
function hasBackRankRisk(chess, color) {
    const king = eachPieceSquare(chess, color).find(p => p.type === 'k');
    if (!king) return false;
    const rank = king.sq[1];
    const back = color === 'w' ? '1' : '8';
    if (rank !== back) return false;
    const file = king.sq[0];
    const escapeRank = color === 'w' ? '2' : '7';
    const escapes = [file + escapeRank];
    const fi = file.charCodeAt(0);
    if (fi > 97) escapes.push(String.fromCharCode(fi - 1) + escapeRank);
    if (fi < 104) escapes.push(String.fromCharCode(fi + 1) + escapeRank);
    const luft = escapes.some(sq => !chess.get(sq));
    if (luft) return false;
    const opp = color === 'w' ? 'b' : 'w';
    // Enemy heavy piece on back rank or able to land there next conceptually — check if back rank squares attacked
    const backSquares = [];
    for (let c = 0; c < 8; c++) backSquares.push(coordsSq(color === 'w' ? 7 : 0, c));
    return backSquares.some(sq => getAttackers(chess, sq, opp).some(a => a.type === 'r' || a.type === 'q'));
}

function pieceLabel(type) {
    return ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[type] || 'piece';
}

function materialCount(chess, color) {
    let total = 0;
    for (const p of eachPieceSquare(chess, color)) {
        if (p.type !== 'k') total += p.value;
    }
    return total;
}

function lookAheadMaterialNet(startFen, userColor, futureMoves, maxPlies = 6) {
    const c = new Chess(startFen);
    let net = 0;
    const takes = [];
    for (let i = 0; i < Math.min(maxPlies, futureMoves.length); i++) {
        const mv = futureMoves[i];
        const moverIsUser = c.turn() === userColor;
        // Apply via from/to so we don't depend on SAN ambiguity
        const played = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
        if (!played) break;
        if (played.captured) {
            const val = PIECE_VAL[played.captured] || 0;
            net += moverIsUser ? val : -val;
            takes.push({
                ply: i + 1,
                byUser: moverIsUser,
                piece: played.captured,
                san: played.san,
                square: played.to
            });
        }
    }
    return { net, takes };
}

function describePlayerMove(opts) {
    const {
        before, after, move, bestMoveUci, userColor, clsLabel,
        futureMoves = [], evalDelta = 0
    } = opts;
    const themes = [];
    const bits = [];
    const opp = userColor === 'w' ? 'b' : 'w';
    const isNegative = ['Miss', 'Mistake', 'Blunder'].includes(clsLabel);
    const isPositive = ['Best', 'Excellent', 'Good', 'Great'].includes(clsLabel);
    let materialEvent = null;

    if (move.san === 'O-O' || move.san === 'O-O-O') {
        themes.push('castled_safe');
        bits.push(move.san === 'O-O' ? 'Castled kingside to safety' : 'Castled queenside to safety');
    }

    if (move.piece === 'p' && 'de'.includes(move.to[0]) && !move.captured) {
        themes.push('claimed_center');
        bits.push('Claimed space in the center');
    }

    if ((move.piece === 'n' || move.piece === 'b') && !move.captured) {
        const fromRank = parseInt(move.from[1], 10);
        const home = userColor === 'w' ? 1 : 8;
        if (fromRank === home) {
            themes.push('developed_piece');
            bits.push(`Developed the ${pieceLabel(move.piece)}`);
        }
    }

    // Fork detection
    {
        const board = after.board();
        const a = sqCoords(move.to);
        const piece = after.get(move.to);
        if (piece) {
            const hits = [];
            for (const vic of eachPieceSquare(after, opp)) {
                if (vic.type !== 'k' && vic.value < 3) continue;
                const v = sqCoords(vic.sq);
                if (canPieceAttack(board, piece, a.r, a.c, v.r, v.c)) hits.push(vic);
            }
            const hasKing = hits.some(h => h.type === 'k');
            const valuables = hits.filter(h => h.type !== 'k');
            if ((hasKing && valuables.length) || valuables.length >= 2) {
                themes.push('forked_piece');
                const names = valuables.map(v => pieceLabel(v.type));
                bits.push(hasKing
                    ? `Forked king and ${names.join('/')}`
                    : `Forked ${names.join(' and ')}`);
            }
        }
    }

    // --- Material: captures, hangs, sacrifices (with lookahead) ---
    const ourMatBefore = materialCount(before, userColor);
    const oppMatBefore = materialCount(before, opp);
    const ourMatAfter = materialCount(after, userColor);
    const oppMatAfter = materialCount(after, opp);
    const immediateNet = (ourMatAfter - oppMatAfter) - (ourMatBefore - oppMatBefore);

    const lookahead = lookAheadMaterialNet(after.fen(), userColor, futureMoves, 6);
    const sequenceNet = immediateNet + lookahead.net;

    // What we captured this move
    const capturedPiece = move.captured || null;
    // Newly hanging our pieces after the move
    const hangingOurs = [];
    for (const p of eachPieceSquare(after, userColor)) {
        if (p.type === 'k' || p.value < 1) continue;
        if (isHanging(after, p.sq, userColor) && !isHanging(before, p.sq, userColor)) {
            hangingOurs.push(p);
        }
    }
    // Prefer highest-value hanger
    hangingOurs.sort((a, b) => b.value - a.value);
    const primaryHang = hangingOurs[0] || null;

    // Did opponent actually take a hanging piece soon?
    const hangTaken = primaryHang
        ? lookahead.takes.find(t => !t.byUser && t.piece === primaryHang.type && t.square === primaryHang.sq)
          || lookahead.takes.find(t => !t.byUser && t.piece === primaryHang.type)
        : null;

    // Reciprocal take of our moved piece (sacrificed onto a square)
    const movedPieceTaken = lookahead.takes.find(t => !t.byUser && t.square === move.to && t.piece === move.piece);

    if (capturedPiece) {
        bits.push(`Took the ${pieceLabel(capturedPiece)}`);
    }

    // Classify material event
    const offeredPiece = primaryHang?.type || (movedPieceTaken ? move.piece : null);
    const offeredValue = offeredPiece ? (PIECE_VAL[offeredPiece] || 0) : 0;
    const gainedValue = capturedPiece ? (PIECE_VAL[capturedPiece] || 0) : 0;

    const looksLikeOffer = !!(primaryHang || movedPieceTaken || (capturedPiece && gainedValue < (PIECE_VAL[move.piece] || 0) && isHanging(after, move.to, userColor)));
    const regainedValue = lookahead.takes.filter(t => t.byUser).reduce((s, t) => s + (PIECE_VAL[t.piece] || 0), 0);
    const compensated = sequenceNet >= 0 || (offeredValue > 0 && regainedValue >= offeredValue);
    const evalSupportsSac = isPositive || evalDelta <= 1.2;

    // Sacrifice: only meaningful pieces (N+), and only when the sequence is compensated.
    // evalSupportsSac is a secondary gate once compensation already looks real.
    if (
        looksLikeOffer &&
        offeredPiece &&
        offeredValue >= 3 &&
        compensated &&
        evalSupportsSac &&
        !isNegative
    ) {
        themes.push('great_sacrifice');
        const regain = lookahead.takes.filter(t => t.byUser).map(t => pieceLabel(t.piece));
        materialEvent = {
            kind: 'sacrifice',
            offered: offeredPiece,
            captured: capturedPiece,
            regained: lookahead.takes.filter(t => t.byUser).map(t => t.piece),
            net: sequenceNet
        };
        bits.unshift(
            regain.length
                ? `Sacrificed the ${pieceLabel(offeredPiece)} to win ${regain.join('/')}`
                : `Sacrificed the ${pieceLabel(offeredPiece)} for a better outcome`
        );
    } else if (primaryHang && (hangTaken || (isNegative && offeredValue >= 3))) {
        // Hang: require the piece was taken in the continuation, or a real piece hung on a bad move.
        // Skip uncompensated hanging pawns with no take — too many false positives.
        themes.push('hung_piece');
        materialEvent = {
            kind: 'hang',
            offered: primaryHang.type,
            captured: capturedPiece,
            taken: !!hangTaken,
            net: sequenceNet
        };
        bits.unshift(
            hangTaken
                ? `Hung the ${pieceLabel(primaryHang.type)} (taken on ${hangTaken.san})`
                : `Hung the ${pieceLabel(primaryHang.type)}`
        );
        if (primaryHang.type === 'q') {
            themes.push('queen_trap');
        }
    } else if (capturedPiece && sequenceNet > 0) {
        themes.push('won_material');
        materialEvent = {
            kind: 'capture',
            offered: null,
            captured: capturedPiece,
            net: sequenceNet
        };
        if (!bits.some(b => b.startsWith('Took the'))) {
            bits.unshift(`Won the ${pieceLabel(capturedPiece)}`);
        } else {
            // Upgrade wording when lookahead confirms we're ahead
            const idx = bits.findIndex(b => b.startsWith('Took the'));
            if (idx >= 0 && sequenceNet >= gainedValue) {
                bits[idx] = `Won the ${pieceLabel(capturedPiece)}` +
                    (lookahead.net > 0 ? ` (kept the material)` : '');
            }
        }
    } else if (capturedPiece && Math.abs(immediateNet) <= 1 && gainedValue >= 1) {
        materialEvent = {
            kind: 'exchange',
            offered: null,
            captured: capturedPiece,
            net: sequenceNet
        };
    }

    if (isPinnedToRoyalty(after, move.to, opp) || (move.captured && isPinnedToRoyalty(before, move.to, opp))) {
        themes.push('pinned_piece');
        bits.push('Pinned an enemy piece');
    }

    // Discovered attack we delivered
    for (const vic of eachPieceSquare(after, opp)) {
        if (vic.value < 3) continue;
        const atkAfter = getAttackers(after, vic.sq, userColor).filter(a => a.type === 'b' || a.type === 'r' || a.type === 'q');
        const atkBeforeSq = getAttackers(before, vic.sq, userColor).map(a => a.square);
        for (const a of atkAfter) {
            if (atkBeforeSq.includes(a.square)) continue;
            if (onSameLine(a.square, vic.sq, move.from)) {
                themes.push('discovered_attack_given');
                bits.push(`Unleashed a discovered attack on the ${pieceLabel(vic.type)}`);
                break;
            }
        }
        if (themes.includes('discovered_attack_given')) break;
    }

    // Discovered attack we walked into
    if (primaryHang) {
        const atkAfter = getAttackers(after, primaryHang.sq, opp).filter(a => a.type === 'b' || a.type === 'r' || a.type === 'q');
        const atkBefore = getAttackers(before, primaryHang.sq, opp).map(a => a.square);
        for (const a of atkAfter) {
            if (atkBefore.includes(a.square)) continue;
            if (onSameLine(a.square, primaryHang.sq, move.from)) {
                themes.push('discovered_attack');
                bits.push(`Walked into a discovered attack on the ${pieceLabel(primaryHang.type)}`);
                break;
            }
        }
    }

    if (bestMoveUci && bestMoveUci.length >= 4) {
        const to = bestMoveUci.slice(2, 4);
        const target = before.get(to);
        if (target && target.color === opp && isHanging(before, to, opp) && !(move.captured && move.to === to)) {
            themes.push('missed_hanging');
            bits.push(`Missed a hanging ${pieceLabel(target.type)}`);
            if (!materialEvent) {
                materialEvent = { kind: 'missed_capture', captured: target.type, offered: null, net: 0 };
            }
        }
    }

    if (move.piece === 'p') {
        const wing = kingCastleWing(before, userColor);
        const file = move.from[0];
        if ((wing === 'kingside' && 'fgh'.includes(file)) || (wing === 'queenside' && 'abc'.includes(file))) {
            if (isNegative) {
                themes.push('castle_pawn_push');
                bits.push('Pushed pawns in front of the castled king');
            }
        }
    }

    if (allowsFork(after, userColor) && !allowsFork(before, userColor) && isNegative) {
        themes.push('fork_victim');
        bits.push('Walked into a fork');
    }

    for (const p of eachPieceSquare(after, userColor)) {
        if (p.value >= 3 && isPinnedToRoyalty(after, p.sq, userColor) && isHanging(after, p.sq, userColor)) {
            themes.push('pin_problem');
            bits.push(`Left the ${pieceLabel(p.type)} pinned and vulnerable`);
            break;
        }
    }

    if (hasBackRankRisk(after, userColor) && isNegative) {
        themes.push('back_rank');
        bits.push('Allowed back-rank pressure');
    }

    const king = eachPieceSquare(after, userColor).find(p => p.type === 'k');
    if (king && ((userColor === 'w' && king.sq === 'e1') || (userColor === 'b' && king.sq === 'e8'))) {
        const fullmove = parseInt(after.fen().split(' ')[5], 10) || 0;
        if (fullmove >= 10 && isNegative) {
            themes.push('king_in_center');
            bits.push('King still stuck in the center');
        }
    }

    // --- Structure: fianchetto, doubled/isolated pawns, bad bishop ---
    detectStructureThemes({
        before, after, move, userColor, themes, bits, isNegative, isPositive
    });

    if (!bits.length) {
        if (clsLabel === 'Best') bits.push('Precise — matched the engine idea');
        else if (clsLabel === 'Excellent') bits.push('Nearly best — tiny expected-points dip');
        else if (clsLabel === 'Good') bits.push('Solid improving move');
        else if (clsLabel === 'Inaccuracy' || clsLabel === 'Okay') bits.push('Quiet move that keeps the position playable');
        else if (clsLabel === 'Miss') bits.push('Missed a chance to convert the opponent’s error');
        else if (clsLabel === 'Book') bits.push('Followed the opening book');
        else if (clsLabel === 'Theory') bits.push('Followed a famous theoretical line');
        else bits.push('Changed the tension without a clear tactical label');
        if (!isNegative && !themes.length) themes.push('quiet_improve');
    }

    const uniqueThemes = [...new Set(themes)].filter(t => THEME_CATALOG[t]);
    return {
        themes: uniqueThemes,
        narrative: `What you did here: ${bits[0]}${bits[1] ? ` — ${bits[1]}` : ''}.`,
        materialEvent
    };
}

function pawnFileCounts(chess, color) {
    const counts = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0 };
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.type === 'p' && p.color === color) {
                const file = String.fromCharCode(97 + c);
                counts[file] += 1;
            }
        }
    }
    return counts;
}

function adjacentFiles(file) {
    const i = file.charCodeAt(0) - 97;
    const out = [];
    if (i > 0) out.push(String.fromCharCode(97 + i - 1));
    if (i < 7) out.push(String.fromCharCode(97 + i + 1));
    return out;
}

function isIsolatedOnFile(counts, file) {
    if ((counts[file] || 0) < 1) return false;
    return adjacentFiles(file).every(f => (counts[f] || 0) === 0);
}

function bishopMobility(chess, square, color) {
    const piece = chess.get(square);
    if (!piece || piece.type !== 'b' || piece.color !== color) return 0;
    // Count pseudo-legal target squares for that bishop
    try {
        const moves = chess.moves({ square, verbose: true }) || [];
        return moves.length;
    } catch (_) {
        return 0;
    }
}

function sameColorSquare(sq) {
    const c = sq.charCodeAt(0) - 97;
    const r = Number(sq[1]) - 1;
    return (c + r) % 2 === 0 ? 'dark' : 'light';
}

function countOwnPawnsOnColor(chess, color, shade) {
    let n = 0;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.type !== 'p' || p.color !== color) continue;
            const sq = coordsSq(r, c);
            if (sameColorSquare(sq) === shade) n += 1;
        }
    }
    return n;
}

function detectStructureThemes({ before, after, move, userColor, themes, bits, isNegative, isPositive }) {
    const fianchettoSq = userColor === 'w'
        ? { g: 'g2', b: 'b2' }
        : { g: 'g7', b: 'b7' };

    // Completing a fianchetto
    if (
        (move.san === 'Bg2' || move.san === 'Bb2' || move.san === 'Bg7' || move.san === 'Bb7') &&
        move.piece === 'b'
    ) {
        themes.push('fianchetto');
        bits.push('Completed a fianchetto on the long diagonal');
    }

    // Trading away your fianchetto bishop (moved from the hole and captured something / was an exchange)
    const fromFian = move.from === fianchettoSq.g || move.from === fianchettoSq.b;
    if (fromFian && move.piece === 'b' && move.captured && isNegative) {
        themes.push('traded_fianchetto');
        bits.push('Traded away the fianchetto bishop');
    }

    // Doubled / isolated pawns created by this move
    const beforeFiles = pawnFileCounts(before, userColor);
    const afterFiles = pawnFileCounts(after, userColor);
    for (const file of 'abcdefgh') {
        if ((afterFiles[file] || 0) >= 2 && (beforeFiles[file] || 0) < 2) {
            themes.push('doubled_pawns');
            bits.push(`Created doubled pawns on the ${file}-file`);
            break;
        }
    }
    for (const file of 'abcdefgh') {
        if (isIsolatedOnFile(afterFiles, file) && !isIsolatedOnFile(beforeFiles, file)) {
            // Only flag when we caused it (our pawn move/capture onto that file, or we captured a neighbour)
            const touched = move.piece === 'p' && (move.to[0] === file || move.from[0] === file);
            const captureNear = move.captured && adjacentFiles(file).includes(move.to[0]);
            if (touched || captureNear || isNegative) {
                themes.push('isolated_pawn');
                bits.push(`Left an isolated pawn on the ${file}-file`);
                break;
            }
        }
    }

    // Bad bishop: our bishop on same colour as many of our pawns, low mobility, after we push a same-colour pawn
    if (isNegative || (move.piece === 'p' && !isPositive)) {
        for (const b of eachPieceSquare(after, userColor)) {
            if (b.type !== 'b') continue;
            const shade = sameColorSquare(b.sq);
            const pawnsOn = countOwnPawnsOnColor(after, userColor, shade);
            const mob = bishopMobility(after, b.sq, userColor);
            const mobBefore = bishopMobility(before, b.sq, userColor);
            if (pawnsOn >= 3 && mob <= 2 && mob <= mobBefore) {
                themes.push('bad_bishop');
                bits.push(`Hemmed in a bad ${shade}-squared bishop`);
                break;
            }
        }
    }
}

function refineMaterialWithEval(analysis) {
    // Second pass: use eval trajectory to confirm sacrifices vs true hangs
    const moves = analysis.moves || [];
    const pe = (m) => playerEvalAt(analysis, m);
    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (!isPlayerMove(analysis, m) || !m.materialEvent || !m.classification?.label) continue;
        const now = pe(m);
        let later = now;
        for (let j = i + 1; j < Math.min(moves.length, i + 8); j++) {
            later = pe(moves[j]);
        }
        const swing = later - now;
        const ev = m.materialEvent;

        if (ev.kind === 'hang' && swing >= 120 && !['Mistake', 'Blunder'].includes(m.classification.label)) {
            // Looked like a hang but position improved → treat as sacrifice
            ev.kind = 'sacrifice';
            ev.confirmedByEval = true;
            m.moveThemes = [...new Set([...(m.moveThemes || []).filter(t => t !== 'hung_piece' && t !== 'queen_trap'), 'great_sacrifice'])];
            const offered = pieceLabel(ev.offered);
            const regained = (ev.regained || []).map(pieceLabel).join('/');
            m.classification.desc = `What you did here: Sacrificed the ${offered}${regained ? ` to win ${regained}` : ' for a better outcome'}.`;
        } else if (ev.kind === 'sacrifice' && swing <= -150 && (m.evalDelta || 0) >= 2) {
            // Called a sac but eval collapsed → true hang/blunder
            ev.kind = 'hang';
            ev.confirmedByEval = true;
            m.moveThemes = [...new Set([...(m.moveThemes || []).filter(t => t !== 'great_sacrifice'), 'hung_piece'])];
            if (ev.offered === 'q') m.moveThemes.push('queen_trap');
            m.classification.desc = `What you did here: Hung the ${pieceLabel(ev.offered)} without getting enough back.`;
        } else if (ev.kind === 'capture' && ev.captured) {
            // Keep piece name prominent in narrative if missing
            if (!/pawn|knight|bishop|rook|queen/i.test(m.classification.desc || '')) {
                m.classification.desc = `What you did here: Won the ${pieceLabel(ev.captured)}.`;
            }
        }
    }
}
