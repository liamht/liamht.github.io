/* chess/learning.js — interactive opening / theory lessons */

const OPENING_FAMILY_INTROS = {
    "Indian Defense": "The Indian Defence is a family of chess openings for Black that begins with 1.d4 Nf6. Instead of staking an immediate symmetrical claim in the center with 1...d5, Black adopts a hypermodern approach: let White occupy the center with pawns, then counter-attack it dynamically from the flanks.",
    "King's Indian Defense": "The King's Indian Defence is a hypermodern opening where Black allows White a big pawn centre, then challenges it with ...d6, ...g6, ...Bg7 and later ...e5 or ...c5. Black accepts temporary space disadvantage for sharp counterplay.",
    "King's Indian Attack": "The King's Indian Attack is a flexible White system built around Nf3, g3, Bg2, and O-O. White often delays the central confrontation and aims for a kingside build-up similar to a reversed King's Indian.",
    "Queen's Indian Defense": "The Queen's Indian Defence answers 1.d4 Nf6 2.c4 with ...e6 and ...b6, planning ...Bb7. Black controls e4 with pieces rather than an early ...d5, aiming for a solid, flexible structure.",
    "Nimzo-Indian Defense": "The Nimzo-Indian Defence (1.d4 Nf6 2.c4 e6 3.Nc3 Bb4) pins the knight on c3, fights for e4, and often damages White's pawn structure for long-term dynamic compensation.",
    "Grünfeld Defense": "The Grünfeld Defence invites White to build a broad centre with c4/d4/Nc3, then strikes it immediately with ...d5. Black relies on piece activity and pressure against the centre rather than a locked pawn chain.",
    "Sicilian Defense": "The Sicilian Defence (1.e4 c5) is Black's most ambitious reply to 1.e4. By trading a flank pawn for a centre pawn later, Black creates asymmetric chances and long-term queenside counterplay.",
    "French Defense": "The French Defence (1.e4 e6) prepares ...d5 on the next move. Black builds a solid chain but often accepts a temporarily passive light-squared bishop in exchange for a sturdy centre and counter-punching chances.",
    "Caro-Kann Defense": "The Caro-Kann Defence (1.e4 c6) also prepares ...d5, but keeps the light-squared bishop freer than in the French. It is solid, classical, and aims for a healthy endgame structure.",
    "Ruy Lopez": "The Ruy Lopez (1.e4 e5 2.Nf3 Nc6 3.Bb5) is a classical king's-pawn opening. White pressures e5 through the pin/threat against c6 and plays for lasting central and kingside pressure.",
    "Italian Game": "The Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4) develops rapidly toward f7. It can stay quiet (Giuoco Piano) or explode into sharp gambit lines, but the theme is fast piece play and central control.",
    "Scotch Game": "The Scotch Game opens the centre early with 3.d4 after 1.e4 e5 2.Nf3 Nc6. White seeks open lines and piece activity before Black can fully consolidate.",
    "Queen's Gambit": "The Queen's Gambit (1.d4 d5 2.c4) offers a wing pawn to undermine Black's centre. Whether accepted or declined, the fight revolves around control of d5/e4 and healthy development.",
    "Queen's Gambit Declined": "In the Queen's Gambit Declined, Black holds d5 with ...e6. The position is sturdy and classical: both sides develop naturally while contesting the c- and e-files later.",
    "Queen's Gambit Accepted": "In the Queen's Gambit Accepted, Black takes on c4 and often returns the pawn later. The early capture clarifies the centre and can lead to open piece play.",
    "English Opening": "The English Opening (1.c4) is a flank start that eyes d5 without occupying the centre immediately. White often fianchettos and steers into structures related to the Sicilian or Queen's Gambit with colours reversed.",
    "Réti Opening": "The Réti Opening (1.Nf3) is a hypermodern start. White develops flexibly, often combined with c4/g3, and waits to choose a central structure based on Black's setup.",
    "Pirc Defense": "The Pirc Defence lets White take the centre with pawns while Black fianchettos and prepares ...d6/...e5 or ...c5 breaks. It is provocative and double-edged.",
    "Modern Defense": "The Modern Defence (...g6 early) is even more flexible than the Pirc. Black delays ...Nf6, keeps options open, and looks to strike the centre once White has committed pawns.",
    "Dutch Defense": "The Dutch Defence (1.d4 f5) seizes kingside space immediately. Black plays for imbalance and attacking chances, accepting structural risks around the king.",
    "Scandinavian Defense": "The Scandinavian Defence (1.e4 d5) forces an early clarification of the centre. Black often recaptures with the queen and accepts tempo hits in return for an open, straightforward game.",
    "Alekhine Defense": "Alekhine's Defence (1.e4 Nf6) invites White's pawns forward to chase the knight. Black hopes the overextended centre becomes a target later.",
    "London System": "The London System is a solid White setup with Bf4, e3, and Nf3. It values reliable development and a safe king over early theoretical battles.",
    "Catalan Opening": "The Catalan combines Queen's Gambit ideas with a kingside fianchetto (g3/Bg2). White pressures the queenside long diagonal while keeping a sound structure."
};

function boardFen(fen) {
    return String(fen || '').split(' ')[0];
}

function fenSimilarity(a, b) {
    const pa = boardFen(a).split('/');
    const pb = boardFen(b).split('/');
    let score = 0;
    for (let r = 0; r < 8; r++) {
        const ra = expandFenRank(pa[r] || '');
        const rb = expandFenRank(pb[r] || '');
        for (let c = 0; c < 8; c++) if (ra[c] === rb[c]) score++;
    }
    return score;
}

function expandFenRank(rank) {
    const out = [];
    for (const ch of rank) {
        if (/[1-8]/.test(ch)) {
            for (let i = 0; i < Number(ch); i++) out.push('.');
        } else out.push(ch);
    }
    while (out.length < 8) out.push('.');
    return out.slice(0, 8);
}

/** Reconstruct a SAN path from the start position to a book FEN (board only). */
function reconstructMovesToFen(targetFen, maxDepth = 16) {
    const target = boardFen(targetFen);
    const startFen = new Chess().fen();
    if (!target || target === boardFen(startFen)) return [];

    // Prefer paths that stay inside the opening book — yields natural move orders
    if (OPENING_FEN_MAP && OPENING_FEN_MAP.size) {
        const q = [{ fen: startFen, moves: [] }];
        const seen = new Set([boardFen(startFen)]);
        for (let qi = 0; qi < q.length; qi++) {
            const node = q[qi];
            if (node.moves.length >= maxDepth) continue;
            const chess = new Chess(node.fen);
            for (const m of chess.moves({ verbose: true })) {
                chess.move(m);
                const fen = chess.fen();
                const board = boardFen(fen);
                chess.undo();
                if (seen.has(board)) continue;
                if (board !== target && !OPENING_FEN_MAP.has(board)) continue;
                seen.add(board);
                const moves = node.moves.concat(m.san);
                if (board === target) return moves;
                q.push({ fen, moves });
            }
        }
    }

    // Fallback: beam search toward the target board
    let beam = [{ fen: startFen, moves: [], score: fenSimilarity(startFen, target) }];
    const globalSeen = new Set([boardFen(startFen)]);

    for (let depth = 0; depth < Math.min(maxDepth, 14); depth++) {
        const candidates = [];
        for (const node of beam) {
            const chess = new Chess(node.fen);
            if (boardFen(chess.fen()) === target) return node.moves;
            for (const m of chess.moves({ verbose: true })) {
                chess.move(m);
                const fen = chess.fen();
                const board = boardFen(fen);
                chess.undo();
                if (board === target) return node.moves.concat(m.san);
                if (globalSeen.has(board)) continue;
                candidates.push({
                    fen,
                    moves: node.moves.concat(m.san),
                    score: fenSimilarity(board, target),
                    board
                });
            }
        }
        candidates.sort((a, b) => b.score - a.score || a.moves.length - b.moves.length);
        beam = [];
        for (const c of candidates) {
            if (globalSeen.has(c.board)) continue;
            globalSeen.add(c.board);
            beam.push(c);
            if (beam.length >= 60) break;
        }
        if (!beam.length) break;
    }
    return beam[0] && boardFen(beam[0].fen) === target ? beam[0].moves : null;
}

function openingIntroFor(name, family) {
    if (OPENING_FAMILY_INTROS[name]) return OPENING_FAMILY_INTROS[name];
    if (OPENING_FAMILY_INTROS[family]) return OPENING_FAMILY_INTROS[family];
    for (const key of Object.keys(OPENING_FAMILY_INTROS)) {
        if (name.includes(key) || family.includes(key)) return OPENING_FAMILY_INTROS[key];
    }
    return `${name} is part of the ${family} family. Play through the line move by move to see how each side develops their plan: centre control, piece placement, and the first typical breaks.`;
}

function pieceNameFromSan(san) {
    if (!san) return 'pawn';
    if (san.startsWith('O-O-O') || san === '0-0-0') return 'king';
    if (san.startsWith('O-O') || san === '0-0') return 'king';
    const ch = san[0];
    if (ch === 'N') return 'knight';
    if (ch === 'B') return 'bishop';
    if (ch === 'R') return 'rook';
    if (ch === 'Q') return 'queen';
    if (ch === 'K') return 'king';
    return 'pawn';
}

function explainOpeningMove({ family, fullName, san, ply, isWhiteMove, verbose, beforeFen, afterFen }) {
    const fam = `${family} ${fullName}`.toLowerCase();
    const move = cleanMove(san);
    const dest = verbose?.to || '';
    const from = verbose?.from || '';
    const piece = pieceNameFromSan(move);
    const capture = !!(verbose && verbose.captured);
    const who = isWhiteMove ? 'White' : 'Black';
    const sidePlan = isWhiteMove ? 'White' : 'Black';

    // Castling
    if (move.startsWith('O-O-O') || move === '0-0-0') {
        return `${who} castles queenside, tucking the king away and bringing a rook toward the centre files — often a signal that the game will become sharp.`;
    }
    if (move.startsWith('O-O') || move === '0-0') {
        return `${who} castles kingside. King safety first: now the rook can join the fight and the middlegame plans can begin in earnest.`;
    }

    // Family-flavoured early moves
    if (move === 'd4' && ply === 0) {
        return `${who} occupies the centre with the d-pawn — a classical claim on e5/c5 and the foundation of many queen's-pawn openings.`;
    }
    if (move === 'e4' && ply === 0) {
        return `${who} takes central space with the e-pawn, opening lines for the queen and bishop and asking Black how to contest e5.`;
    }
    if (move === 'c4' && ply === 0) {
        return `${who} starts on the flank with the English idea: control d5 without committing a central pawn yet.`;
    }
    if (move === 'Nf3' && ply === 0) {
        return `${who} develops a knight flexibly. This keeps options open — it can steer into Réti, English, or classical d4 systems.`;
    }

    if (move === 'd5' && ply <= 2 && !isWhiteMove) {
        return `Black stakes a direct claim in the centre with ...d5, answering White's space grab in classical style.`;
    }
    if (move === 'e5' && ply <= 2 && !isWhiteMove) {
        return `Black mirrors in the centre with ...e5, fighting for equal space and open development.`;
    }
    if (move === 'c5' && ply <= 2 && !isWhiteMove) {
        if (fam.includes('sicilian')) {
            return `The Sicilian starts here: ...c5 fights for d4 from the flank and creates the asymmetrical pawn structure Black wants.`;
        }
        return `Black challenges the centre from the c-file. Trading a flank pawn for a central pawn later is a common goal.`;
    }
    if (move === 'c6' && ply <= 2 && !isWhiteMove) {
        if (fam.includes('caro')) {
            return `Caro-Kann preparation: ...c6 supports ...d5 next while keeping the light-squared bishop's future healthier than in the French.`;
        }
        return `Black supports a ...d5 break with ...c6, building a solid central foothold.`;
    }
    if (move === 'e6' && ply <= 3 && !isWhiteMove) {
        if (fam.includes('french')) {
            return `French Defence structure: ...e6 prepares ...d5. Black accepts a temporarily hemmed bishop for a rock-solid centre.`;
        }
        if (fam.includes('indian') || fam.includes('nimzo') || fam.includes('queen\'s indian')) {
            return `...e6 is a flexible Indian move — it opens the dark-squared bishop and keeps ...d5 or ...Bb4 ideas available.`;
        }
        return `...e6 bolsters the centre and frees the dark-squared bishop.`;
    }

    if (move === 'Nf6' && ply <= 3) {
        if (!isWhiteMove && (fam.includes('indian') || fam.includes('nimzo') || fam.includes('grünfeld') || fam.includes('grunfeld') || fam.includes('king\'s indian') || fam.includes('pirc') || fam.includes('alekhine'))) {
            return `The Indian idea in action: Black's knight comes to f6, controlling e4 and d5 while staying ready to counter-attack White's centre instead of occupying it immediately with ...d5.`;
        }
        return `${who} develops the knight to f6 — natural development that eyes the centre and prepares castling.`;
    }

    if (move === 'Nc6' && ply <= 4) {
        return `${who} develops the queen's knight toward the centre, increasing pressure on d4/e5 and clearing the back rank for later coordination.`;
    }

    if (move === 'c4' && ply >= 1 && ply <= 5 && isWhiteMove) {
        if (fam.includes('indian') || fam.includes('gambit') || fam.includes('catalan') || fam.includes('english')) {
            return `White gains queenside space with c4 — a Queen's Gambit-style clamp on d5 that asks Black how they will contest the centre.`;
        }
        return `White expands with c4, fighting for d5 and opening a path for the queen toward the queenside.`;
    }

    if ((move === 'g6' || move === 'g3') && ply <= 8) {
        const fianchettoSide = move === 'g6' ? 'Black' : 'White';
        if (fam.includes('king\'s indian') || fam.includes('modern') || fam.includes('pirc') || fam.includes('catalan') || fam.includes('rét') || fam.includes('reti') || fam.includes('hungarian') || fam.includes('indian')) {
            return `${fianchettoSide} prepares a kingside fianchetto. The bishop will sit on the long diagonal, pressuring the centre from a distance — classic hypermodern play, especially while no immediate attack is crashing through.`;
        }
        return `${fianchettoSide} prepares to fianchetto. The bishop will influence the long diagonal and help shelter the king.`;
    }

    if ((move === 'b6' || move === 'b3') && ply <= 8) {
        return `${who} prepares a queenside fianchetto, aiming the bishop at the central dark/light squares from the flank.`;
    }

    if (move === 'Bg7' || move === 'Bg2') {
        return `${who} completes the fianchetto. That bishop is a long-term asset: it defends the king and bites into the centre and queenside.`;
    }
    if (move === 'Bb7' || move === 'Bb2') {
        return `${who} places the bishop on the long diagonal from the queenside, watching e4/e5 and supporting central breaks.`;
    }
    if (move === 'Bb4' || move === 'Bb5') {
        if (move === 'Bb4' && fam.includes('nimzo')) {
            return `The Nimzo pin: Black pins the knight on c3, fights for e4, and is ready to damage White's structure if White allows ...Bxc3.`;
        }
        if (move === 'Bb5' && (fam.includes('lopez') || fam.includes('ruy'))) {
            return `Ruy Lopez pressure: White's bishop eyes c6, indirectly fighting for the e5 pawn and shaping the whole opening battle.`;
        }
        return `${who} develops the bishop with a pin/pressure idea, restricting an enemy knight and steering the game toward a concrete fight.`;
    }
    if (move === 'Bc4' || move === 'Bc5') {
        return `${who} develops the bishop onto an active diagonal aimed at the vulnerable f2/f7 point — a hallmark of Italian-style play.`;
    }
    if (move === 'Bf4' || move === 'Bf5') {
        return `${who} develops the bishop outside the pawn chain early (London/Slav-style thinking), keeping it active before locking the structure.`;
    }

    if (move === 'd6' && !isWhiteMove && ply <= 8) {
        if (fam.includes('king\'s indian') || fam.includes('pirc') || fam.includes('modern')) {
            return `...d6 solidifies the centre and prepares the classic breaks (...e5 or ...c5). Black is building the springboard for the counter-attack.`;
        }
        return `...d6 supports the centre and frees the light-squared bishop while keeping the position flexible.`;
    }
    if (move === 'd5' && !isWhiteMove && (fam.includes('grünfeld') || fam.includes('grunfeld'))) {
        return `The Grünfeld strike: Black hits the centre with ...d5 at once, inviting White forward so the pieces can pressure the big pawn centre.`;
    }

    if (capture) {
        const taken = pieceLabel(verbose.captured);
        return `${who} captures on ${dest}, exchanging a ${taken}. In the opening this usually clarifies the centre or removes a key defender.`;
    }

    if (piece === 'pawn' && (dest[1] === '4' || dest[1] === '5') && ply < 10) {
        return `${who} advances a pawn in the centre/space race. Every central pawn push gains ground but also leaves squares behind that pieces must cover.`;
    }

    if (piece === 'knight' || piece === 'bishop') {
        return `${who} develops the ${piece} to ${dest}. In this ${family} setup, getting pieces to active squares quickly matters as much as the pawn centre itself.`;
    }
    if (piece === 'queen' && ply < 12) {
        return `${who} brings the queen out early to ${dest}. Useful if it creates a concrete threat — risky if it becomes a target for tempo-gaining developing moves.`;
    }
    if (piece === 'rook') {
        return `${who} improves a rook toward ${dest}, connecting pieces and eyeing open or semi-open files.`;
    }

    return `${who} plays ${move}. Stay focused on the ${family} plan: develop, contest the centre, and only then look for the thematic break.`;
}

function annotateLessonMoves(moves, meta) {
    const chess = new Chess();
    const startFen = chess.fen();
    const steps = [];
    const fens = [startFen];
    for (let i = 0; i < moves.length; i++) {
        const beforeFen = chess.fen();
        const verbose = chess.move(moves[i], { sloppy: true });
        if (!verbose) break;
        const afterFen = chess.fen();
        fens.push(afterFen);
        steps.push({
            san: verbose.san,
            from: verbose.from,
            to: verbose.to,
            comment: explainOpeningMove({
                family: meta.family,
                fullName: meta.name,
                san: verbose.san,
                ply: i,
                isWhiteMove: i % 2 === 0,
                verbose,
                beforeFen,
                afterFen
            })
        });
    }
    return { steps, fens };
}

function buildLearningLesson(kind, name) {
    if (kind === 'theory') {
        const g = findFamousByName(name);
        if (!g?.moves?.length) return null;
        const family = 'Famous game';
        const intro = g.theme
            ? `${g.theme}${g.year ? ` (${g.year}` : ''}${g.white && g.black ? `: ${g.white} vs ${g.black}` : ''}${g.year ? ')' : ''}.`
            : `A curated famous game to study. Play through the moves and notice how the attack or defensive idea unfolds.`;
        const { steps, fens } = annotateLessonMoves(g.moves, { family: g.name, name: g.name });
        // Prefer theme-aware first comments for theory games
        if (steps[0] && g.theme) {
            steps[0].comment = `The game begins. Theme to watch: ${g.theme}.`;
        }
        return {
            kind: 'theory',
            name: g.name,
            family,
            intro,
            steps,
            fens,
            related: []
        };
    }

    const op = findOpeningByName(name);
    const family = openingFamily(op?.name || name);
    const intro = openingIntroFor(op?.name || name, family);

    let moves = null;
    if (Array.isArray(op?.moves) && op.moves.length) {
        moves = op.moves.map(cleanMove);
    } else if (op?.fen) {
        moves = reconstructMovesToFen(op.fen);
    }

    // INTERNAL book fallback by family name
    if ((!moves || !moves.length) && Array.isArray(INTERNAL_BOOK)) {
        const hit = INTERNAL_BOOK.find(o => o.name === family || o.name === name || (o.moves && openingFamily(o.name) === family));
        if (hit?.moves?.length) moves = hit.moves.map(cleanMove);
    }

    if (!moves || !moves.length) {
        return {
            kind: 'opening',
            name: op?.name || name,
            family,
            intro,
            steps: [],
            fens: [new Chess().fen()],
            related: [],
            error: 'Could not reconstruct a move path to this opening position. Try a related line from the same family.'
        };
    }

    const { steps, fens } = annotateLessonMoves(moves, { family, name: op?.name || name });
    const related = (ACTIVE_OPENING_BOOK || [])
        .filter(o => openingFamily(o.name) === family && o.name !== (op?.name || name))
        .slice(0, 10);

    return {
        kind: 'opening',
        name: op?.name || name,
        family,
        intro,
        steps,
        fens,
        related
    };
}

function renderLearnBoard(fen, highlight) {
    const board = document.getElementById('learn-board');
    if (!board) return;
    board.innerHTML = '';
    const chess = new Chess(fen);
    const pos = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            const sqId = String.fromCharCode(97 + c) + (8 - r);
            sq.className = `square ${(r + c) % 2 === 0 ? 'white' : 'black'}`;
            if (highlight && (sqId === highlight.from || sqId === highlight.to)) sq.classList.add('highlight');
            const p = pos[r][c];
            if (p) {
                const img = document.createElement('img');
                img.className = 'piece';
                img.src = `https://lichess1.org/assets/piece/cburnett/${p.color}${p.type.toUpperCase()}.svg`;
                sq.appendChild(img);
            }
            board.appendChild(sq);
        }
    }
}

function updateLearningLessonView() {
    const lesson = ChessApp.learnLesson;
    if (!lesson) return;
    const ply = lesson.ply || 0;
    const fen = lesson.fens[ply] || lesson.fens[0];
    const step = ply > 0 ? lesson.steps[ply - 1] : null;
    renderLearnBoard(fen, step ? { from: step.from, to: step.to } : null);

    const title = document.getElementById('learn-move-title');
    const comment = document.getElementById('learn-move-comment');
    const progress = document.getElementById('learn-move-progress');
    if (ply === 0) {
        if (title) title.innerText = 'Starting position';
        if (comment) comment.innerText = lesson.intro;
    } else if (step) {
        const num = Math.floor((ply - 1) / 2) + 1;
        const dots = (ply - 1) % 2 === 0 ? '.' : '...';
        if (title) title.innerText = `${num}${dots} ${step.san}`;
        if (comment) comment.innerText = step.comment;
    }
    if (progress) progress.innerText = `Move ${ply} / ${lesson.steps.length}`;

    const prev = document.getElementById('learn-btn-prev');
    const next = document.getElementById('learn-btn-next');
    if (prev) prev.disabled = ply <= 0;
    if (next) next.disabled = ply >= lesson.steps.length;
}

function learningStep(delta) {
    const lesson = ChessApp.learnLesson;
    if (!lesson) return;
    const next = Math.max(0, Math.min(lesson.steps.length, (lesson.ply || 0) + delta));
    lesson.ply = next;
    updateLearningLessonView();
}

function learningGoStart() {
    if (!ChessApp.learnLesson) return;
    ChessApp.learnLesson.ply = 0;
    updateLearningLessonView();
}

function learningGoEnd() {
    const lesson = ChessApp.learnLesson;
    if (!lesson) return;
    lesson.ply = lesson.steps.length;
    updateLearningLessonView();
}

function renderLearningLessonShell(lesson) {
    const relatedHtml = lesson.related?.length
        ? `<div class="mt-4">
                <div class="profile-kicker">Related lines in ${lesson.family}</div>
                ${lesson.related.map(s => `
                    <button type="button" class="p-button p-button-text p-component w-full text-left justify-content-start mb-1" onclick="openLearningItem('opening', decodeURIComponent('${encodeURIComponent(s.name)}'))">
                        ${s.name}
                    </button>
                `).join('')}
           </div>`
        : '';

    const errorHtml = lesson.error
        ? `<div class="insight-empty mb-3">${lesson.error}</div>`
        : '';

    return `
        <div class="learn-lesson">
            <button type="button" class="p-button p-component p-button-secondary mb-3" onclick="closeLearningDetail()">
                <span class="p-button-icon-left pi pi-arrow-left"></span>
                <span class="p-button-label">Back</span>
            </button>
            <div class="profile-kicker">${lesson.kind === 'theory' ? 'Famous game · Theory' : `Opening · ${lesson.family}`}</div>
            <div class="text-2xl font-bold mb-2">${lesson.name}</div>
            <div class="text-color-secondary text-sm mb-3 line-height-3">${lesson.intro}</div>
            ${errorHtml}
            <div class="learn-lesson-grid">
                <div>
                    <div class="board-wrapper learn-board-wrap mb-3">
                        <div id="learn-board" class="chess-board"></div>
                    </div>
                    <div class="review-nav flex flex-wrap gap-2">
                        <button type="button" class="p-button p-component p-button-secondary" onclick="learningGoStart()">
                            <span class="p-button-icon-left pi pi-step-backward"></span>
                            <span class="p-button-label">Start</span>
                        </button>
                        <button type="button" id="learn-btn-prev" class="p-button p-component p-button-secondary" onclick="learningStep(-1)">
                            <span class="p-button-icon-left pi pi-caret-left"></span>
                            <span class="p-button-label">Prev</span>
                        </button>
                        <button type="button" id="learn-btn-next" class="p-button p-component" onclick="learningStep(1)">
                            <span class="p-button-label">Next</span>
                            <span class="p-button-icon-right pi pi-caret-right"></span>
                        </button>
                        <button type="button" class="p-button p-component p-button-secondary" onclick="learningGoEnd()">
                            <span class="p-button-label">End</span>
                            <span class="p-button-icon-right pi pi-step-forward"></span>
                        </button>
                    </div>
                </div>
                <div class="p-card p-component">
                    <div class="p-card-body">
                        <div id="learn-move-progress" class="profile-kicker">Move 0 / 0</div>
                        <div id="learn-move-title" class="text-xl font-bold mb-2">Starting position</div>
                        <div id="learn-move-comment" class="text-color-secondary text-sm line-height-3">${lesson.intro}</div>
                    </div>
                </div>
            </div>
            ${relatedHtml}
        </div>
    `;
}
