/* chess/insights.js — Coach Notes V2: evidence-backed, player-specific coaching */

function sideMaterialFromFen(fen) {
    const board = String(fen || '').split(' ')[0] || '';
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let white = 0;
    let black = 0;
    for (const ch of board) {
        const t = ch.toLowerCase();
        if (!values[t]) continue;
        if (ch === ch.toUpperCase()) white += values[t];
        else black += values[t];
    }
    return { white, black };
}

function onlyPawnsOrKings(fen) {
    const board = String(fen || '').split(' ')[0] || '';
    for (const ch of board) {
        if (!/[pnbrqk]/i.test(ch)) continue;
        const t = ch.toLowerCase();
        if (t !== 'p' && t !== 'k') return false;
    }
    return true;
}

function escInsightHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function movedPieceType(move) {
    const san = move?.san || '';
    if (!san) return null;
    if (san === 'O-O' || san === 'O-O-O') return 'k';
    if (/^[NBRQK]/.test(san)) return san[0].toLowerCase();
    return 'p';
}

function avg(nums) {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function makeEvidence(g, m, i) {
    if (!g || !m) return null;
    return {
        gameKey: g.gameKey || null,
        moveIndex: i,
        san: m.san || '',
        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : `${m.moveNum}${m.turn === 'w' ? '.' : '...'} ${m.san}`,
        opponent: g.opponent || (g.isWhite ? g.blackUsername : g.whiteUsername) || 'opponent',
        result: g.result || '',
        label: m.classification?.label || '',
        evalDelta: m.evalDelta != null ? m.evalDelta : null,
        endTime: g.endTime || 0
    };
}

function pushThemeExample(store, themeId, hit, polarity) {
    if (!store[themeId]) store[themeId] = { hits: 0, polarity, examples: [] };
    store[themeId].hits += 1;
    const examples = store[themeId].examples;
    const score = (hit.m.classification?.label === 'Blunder' ? 3
        : hit.m.classification?.label === 'Mistake' ? 2
        : hit.m.classification?.label === 'Miss' ? 1 : 0)
        + (hit.m.evalDelta || 0);
    examples.push({ ...hit, _score: score });
    examples.sort((a, b) => (b._score - a._score) || ((b.g.endTime || 0) - (a.g.endTime || 0)));
    if (examples.length > 3) examples.length = 3;
}

function confidenceFromRated(ratedN) {
    if (ratedN < 8) return 'low';
    if (ratedN < 25) return 'medium';
    return 'high';
}

function confidenceFactor(c) {
    return c === 'high' ? 1 : c === 'medium' ? 0.75 : 0.45;
}

function makeInsightCard( partial ) {
    return {
        id: partial.id,
        priority: Math.max(0, Math.min(100, Math.round(partial.priority || 0))),
        confidence: partial.confidence || 'low',
        title: partial.title || '',
        body: partial.body || '',
        advice: partial.advice || '',
        evidence: (partial.evidence || []).filter(Boolean).slice(0, 3),
        links: partial.links || [],
        themeKey: partial.themeKey || null
    };
}

function evidenceFromHits(hits) {
    return (hits || [])
        .map(h => makeEvidence(h.g, h.m, h.i))
        .filter(e => e && e.gameKey);
}

function collectInsightCorpus(profile) {
    const games = profile.analyzedGames || [];
    const byPhase = {
        opening: { moves: [], labels: {}, themes: {}, material: [], games: 0 },
        middlegame: { moves: [], labels: {}, themes: {}, material: [], games: 0 },
        endgame: { moves: [], labels: {}, themes: {}, material: [], games: 0 }
    };
    const bookDepths = [];
    let oppBrokeFirst = 0;
    let youBrokeFirst = 0;
    let stayedInBook = 0;
    const earlyBishopSacs = [];
    const knightDevelops = [];
    const knightExchanges = [];
    let endgameEntered = 0;
    let endgameEnteredDown = 0;
    let endgameLosses = 0;
    let endgameLossesEnteredDown = 0;
    let pawnEndgameBlunders = 0;
    let pawnEndgameMoves = 0;
    const lossPhase = { opening: 0, middlegame: 0, endgame: 0, unknown: 0 };

    const themeStore = {};
    const phaseBlunders = { opening: [], middlegame: [], endgame: [] };
    const openingFamilies = { white: {}, black: {} };
    const keyLosses = { opening: [], middlegame: [], endgame: [] };
    const endgameDownLosses = [];
    const pieceEvidence = {};
    for (const p of ['p', 'n', 'b', 'r', 'q', 'k']) {
        pieceEvidence[p] = { bad: null, good: null };
    }

    const bumpFamily = (side, family, patch) => {
        if (!openingFamilies[side][family]) {
            openingFamilies[side][family] = {
                family, side, games: 0, wins: 0, losses: 0, draws: 0,
                openingBlunders: 0, worstLoss: null, sampleGame: null
            };
        }
        const row = openingFamilies[side][family];
        Object.assign(row, patch(row));
    };

    for (const g of games) {
        const { phases, openingEnd, endgameStart } = assignMovePhases(g);
        const phaseSeen = { opening: false, middlegame: false, endgame: false };
        bookDepths.push(openingEnd >= 0 ? openingEnd + 1 : 0);

        const family = openingFamily(g.openingName || 'Custom Game');
        const side = g.isWhite ? 'white' : 'black';
        bumpFamily(side, family, (row) => {
            row.games += 1;
            if (g.result === 'WIN') row.wins += 1;
            else if (g.result === 'LOSS') row.losses += 1;
            else row.draws += 1;
            if (!row.sampleGame) row.sampleGame = g;
            return row;
        });

        let broke = null;
        for (let i = 0; i < (g.moves || []).length; i++) {
            const label = g.moves[i].classification?.label;
            if (label !== 'Book' && label !== 'Theory') {
                broke = { i, player: isPlayerMove(g, g.moves[i]) };
                break;
            }
        }
        if (!broke) stayedInBook += 1;
        else if (broke.player) youBrokeFirst += 1;
        else oppBrokeFirst += 1;

        let enteredDown = false;
        if (endgameStart != null && g.moves[endgameStart]?.fen) {
            endgameEntered += 1;
            const mat = sideMaterialFromFen(g.moves[endgameStart].fen);
            const mine = g.isWhite ? mat.white : mat.black;
            const theirs = g.isWhite ? mat.black : mat.white;
            enteredDown = mine < theirs;
            if (enteredDown) endgameEnteredDown += 1;
            if (g.result === 'LOSS') {
                endgameLosses += 1;
                if (enteredDown) {
                    endgameLossesEnteredDown += 1;
                    endgameDownLosses.push(g);
                }
            }
        }

        if (g.result === 'LOSS') {
            const keyIdx = g.gameStory?.keyMoveIndex;
            if (keyIdx != null && phases[keyIdx]) {
                lossPhase[phases[keyIdx]] += 1;
                const m = g.moves[keyIdx];
                keyLosses[phases[keyIdx]].push({ g, m, i: keyIdx });
                const famRow = openingFamilies[side][family];
                if (famRow && (!famRow.worstLoss || (g.endTime || 0) > (famRow.worstLoss.endTime || 0))) {
                    famRow.worstLoss = { gameKey: g.gameKey, moveIndex: keyIdx, endTime: g.endTime || 0, g, m, i: keyIdx };
                }
            } else {
                lossPhase.unknown += 1;
            }
        }

        for (let i = 0; i < (g.moves || []).length; i++) {
            const m = g.moves[i];
            if (!isPlayerMove(g, m) || !m.classification?.label) continue;
            const phase = phases[i] || 'middlegame';
            const bucket = byPhase[phase];
            if (!bucket) continue;
            if (!phaseSeen[phase]) {
                phaseSeen[phase] = true;
                bucket.games += 1;
            }
            bucket.moves.push({ g, m, i, phase });
            const label = m.classification.label;
            bucket.labels[label] = (bucket.labels[label] || 0) + 1;
            for (const t of m.moveThemes || []) {
                if (PROFILE_SKIP_THEMES.has(t)) continue;
                bucket.themes[t] = (bucket.themes[t] || 0) + 1;
                const cat = THEME_CATALOG[t];
                if (cat) pushThemeExample(themeStore, t, { g, m, i }, cat.polarity);
            }
            if (m.materialEvent) bucket.material.push(m.materialEvent);

            if (['Blunder', 'Mistake', 'Miss'].includes(label)) {
                phaseBlunders[phase].push({ g, m, i, evalDelta: m.evalDelta || 0 });
                if (phase === 'opening') {
                    const famRow = openingFamilies[side][family];
                    if (famRow && label === 'Blunder') famRow.openingBlunders += 1;
                }
            }

            const piece = movedPieceType(m);
            if (piece && pieceEvidence[piece]) {
                if (['Blunder', 'Mistake'].includes(label)) {
                    const cur = pieceEvidence[piece].bad;
                    if (!cur || (m.evalDelta || 0) > (cur.m.evalDelta || 0)) {
                        pieceEvidence[piece].bad = { g, m, i };
                    }
                }
                if (label === 'Best' || label === 'Excellent') {
                    if (!pieceEvidence[piece].good) pieceEvidence[piece].good = { g, m, i };
                }
            }

            if (phase === 'opening' && piece === 'b' && m.moveNum <= 4) {
                const ev = m.materialEvent;
                if (ev && (ev.kind === 'sacrifice' || ev.kind === 'hang') && (ev.offered === 'b' || !ev.offered)) {
                    earlyBishopSacs.push({ m, ev, g, i });
                }
            }
            if (phase === 'middlegame' && piece === 'n') {
                knightDevelops.push({ m, g, i });
                if (m.materialEvent?.kind === 'exchange' || (m.materialEvent?.kind === 'capture' && m.materialEvent?.offered === 'n')) {
                    knightExchanges.push({ m, g, i });
                }
            }
            if (phase === 'endgame' && m.fen && onlyPawnsOrKings(m.fen)) {
                pawnEndgameMoves += 1;
                if (label === 'Blunder' || label === 'Mistake') pawnEndgameBlunders += 1;
            }
        }
    }

    for (const phase of Object.keys(phaseBlunders)) {
        phaseBlunders[phase].sort((a, b) => (b.evalDelta - a.evalDelta) || ((b.g.endTime || 0) - (a.g.endTime || 0)));
        if (phaseBlunders[phase].length > 12) phaseBlunders[phase].length = 12;
    }
    for (const phase of Object.keys(keyLosses)) {
        keyLosses[phase].sort((a, b) => ((b.g.endTime || 0) - (a.g.endTime || 0)));
        if (keyLosses[phase].length > 5) keyLosses[phase].length = 5;
    }

    return {
        games: games.length,
        byPhase,
        bookDepths,
        oppBrokeFirst,
        youBrokeFirst,
        stayedInBook,
        earlyBishopSacs,
        knightDevelops,
        knightExchanges,
        endgameEntered,
        endgameEnteredDown,
        endgameLosses,
        endgameLossesEnteredDown,
        pawnEndgameMoves,
        pawnEndgameBlunders,
        lossPhase,
        themeStore,
        phaseBlunders,
        openingFamilies,
        keyLosses,
        endgameDownLosses,
        pieceEvidence
    };
}

function phaseQualitySummary(bucket) {
    const total = bucket.moves.length;
    if (!total) return null;
    const blunders = bucket.labels.Blunder || 0;
    const mistakes = bucket.labels.Mistake || 0;
    const best = (bucket.labels.Best || 0) + (bucket.labels.Excellent || 0);
    const good = bucket.labels.Good || 0;
    const rated = total - (bucket.labels.Book || 0) - (bucket.labels.Theory || 0);
    return {
        total,
        rated,
        blunderRate: total ? blunders / total : 0,
        mistakeRate: total ? mistakes / total : 0,
        bestRate: rated ? best / rated : 0,
        goodRate: rated ? (best + good) / rated : 0
    };
}

function topTheme(themes, polarity, minHits = 2) {
    let best = null;
    for (const [id, hits] of Object.entries(themes || {})) {
        const cat = THEME_CATALOG[id];
        if (!cat || cat.polarity !== polarity) continue;
        if (hits < minHits) continue;
        if (!best || hits > best.hits) best = { id, hits, cat };
    }
    return best;
}

function favouriteOpeningLine(profile) {
    const white = topOpeningEntries(profile.openingsWhite || {}, profile.whiteGames || 0, 1)[0];
    const black = topOpeningEntries(profile.openingsBlack || {}, profile.blackGames || 0, 1)[0];
    const pick = (!white && black) ? { side: 'Black', entry: black }
        : (!black && white) ? { side: 'White', entry: white }
        : (white && black)
            ? (white.count >= black.count ? { side: 'White', entry: white } : { side: 'Black', entry: black })
            : null;
    return pick;
}

function softBody(confidence, text) {
    if (confidence === 'low') return `Early signal: ${text}`;
    return text;
}

function rankAndCap(cards, limit = 4) {
    return (cards || [])
        .filter(Boolean)
        .sort((a, b) => (b.priority - a.priority) || a.id.localeCompare(b.id))
        .slice(0, limit);
}

function demoteDuplicateThemes(sections) {
    const seen = new Set();
    for (const key of ['overview', 'opening', 'middlegame', 'endgame']) {
        const list = sections[key] || [];
        const kept = [];
        for (const card of list) {
            if (card.themeKey && seen.has(card.themeKey)) {
                card.priority = Math.max(0, card.priority - 25);
            }
            if (card.themeKey) seen.add(card.themeKey);
            kept.push(card);
        }
        sections[key] = rankAndCap(kept, 4);
    }
}

function pickWeeklyFocus(sections) {
    const all = [];
    for (const key of ['overview', 'opening', 'middlegame', 'endgame']) {
        for (const c of sections[key] || []) all.push(c);
    }
    const eligible = all.filter(c => c.confidence !== 'low' || all.every(x => x.confidence === 'low'));
    eligible.sort((a, b) => b.priority - a.priority);
    return eligible[0] || null;
}

function themeCardFromStore(corpus, polarity, games) {
    const minHits = Math.max(2, Math.floor(games * 0.12));
    let best = null;
    for (const [id, row] of Object.entries(corpus.themeStore || {})) {
        if (row.polarity !== polarity || row.hits < minHits) continue;
        if (PROFILE_SKIP_THEMES.has(id)) continue;
        if (!best || row.hits > best.hits) best = { id, ...row, cat: THEME_CATALOG[id] };
    }
    if (!best?.cat) return null;
    const conf = confidenceFromRated(best.hits * 2);
    const sev = polarity === 'bad' ? 1.15 : 0.85;
    const priority = Math.min(100, best.hits * 8 * sev * confidenceFactor(conf));
    return makeInsightCard({
        id: `theme_${polarity}_${best.id}`,
        themeKey: best.id,
        priority,
        confidence: conf,
        title: polarity === 'bad'
            ? `Loudest leak · ${best.id.replace(/_/g, ' ')}`
            : `Strength · ${best.id.replace(/_/g, ' ')}`,
        body: softBody(conf, `${best.cat.detail} (${best.hits}× in this sample).`),
        advice: polarity === 'bad'
            ? 'Before you commit, slow-check the unprotected unit or tactic that keeps biting you.'
            : 'Lean into this — force positions where this idea shows up.',
        evidence: evidenceFromHits(best.examples)
    });
}

function phaseAccuracyCard(phase, corpus) {
    const bucket = corpus.byPhase[phase];
    const q = phaseQualitySummary(bucket);
    if (!q || q.rated < 6) return null;
    const conf = confidenceFromRated(q.rated);
    const blPct = Math.round(q.blunderRate * 100);
    const bestPct = Math.round(q.bestRate * 100);
    const isBad = blPct >= 10 || (phase === 'middlegame' && blPct >= 8);
    const isGood = bestPct >= 40 && blPct <= 6;
    if (!isBad && !isGood) return null;
    const priority = isBad
        ? Math.min(100, 40 + blPct * 2.2) * confidenceFactor(conf)
        : Math.min(100, 30 + bestPct * 0.6) * confidenceFactor(conf) * 0.7;
    const evidence = evidenceFromHits((corpus.phaseBlunders[phase] || []).slice(0, 3));
    return makeInsightCard({
        id: `phase_acc_${phase}`,
        priority,
        confidence: conf,
        title: isBad
            ? `${phase[0].toUpperCase()}${phase.slice(1)} accuracy dip`
            : `${phase[0].toUpperCase()}${phase.slice(1)} looks clean`,
        body: softBody(conf, isBad
            ? `About ${blPct}% of your ${phase} moves are Blunders (${bestPct}% Best/Excellent among rated tries).`
            : `About ${bestPct}% Best/Excellent among rated ${phase} moves, with blunders near ${blPct}%.`),
        advice: isBad
            ? `Spend training time on ${phase} calculation — review the cited slips before the next session.`
            : `Keep converting calm ${phase} positions the same way.`,
        evidence
    });
}

function worstOpeningFamilyCard(corpus) {
    const candidates = [];
    for (const side of ['white', 'black']) {
        for (const row of Object.values(corpus.openingFamilies[side] || {})) {
            if (row.games < 3 || row.family === 'Custom / Unknown') continue;
            const wr = row.games ? row.wins / row.games : 0;
            if (wr > 0.4 && row.losses < 3) continue;
            candidates.push({ ...row, wr });
        }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.wr - b.wr || b.losses - a.losses);
    const worst = candidates[0];
    if (worst.losses < 2 && worst.wr >= 0.35) return null;
    const conf = worst.games >= 6 ? 'high' : worst.games >= 3 ? 'medium' : 'low';
    const priority = Math.min(100, (1 - worst.wr) * 70 + worst.losses * 6) * confidenceFactor(conf);
    const evidence = [];
    if (worst.worstLoss?.gameKey) {
        evidence.push(makeEvidence(worst.worstLoss.g, worst.worstLoss.m, worst.worstLoss.i));
    } else if (worst.sampleGame?.gameKey) {
        const g = worst.sampleGame;
        const idx = g.gameStory?.keyMoveIndex ?? Math.max(0, (g.moves || []).length - 1);
        evidence.push(makeEvidence(g, g.moves?.[idx], idx));
    }
    return makeInsightCard({
        id: `open_family_${worst.side}_${worst.family}`,
        priority,
        confidence: conf,
        title: `${worst.family} as ${worst.side === 'white' ? 'White' : 'Black'}`,
        body: softBody(conf,
            `Record ${worst.wins}–${worst.losses}–${worst.draws} across ${worst.games} games` +
            (worst.openingBlunders ? ` · ${worst.openingBlunders} opening blunder${worst.openingBlunders === 1 ? '' : 's'}` : '') +
            ` (${Math.round(worst.wr * 100)}% wins).`),
        advice: 'Study a model line in Learn, then replay your worst loss move-by-move.',
        evidence,
        links: [{ kind: 'learn-opening', name: worst.family }]
    });
}

function buildOverviewInsights(profile, corpus) {
    const cards = [];
    const games = corpus.games;
    if (!games) {
        return [makeInsightCard({
            id: 'need_games',
            priority: 10,
            confidence: 'low',
            title: 'Waiting on sample size',
            body: 'Analyse a handful of games and this overview will fill with patterns from your play.',
            advice: 'Review a profile or a few single games to unlock coaching.'
        })];
    }

    if (games < 5) {
        cards.push(makeInsightCard({
            id: 'small_sample',
            priority: 20,
            confidence: 'low',
            title: 'Small sample',
            body: `Only ${games} analyzed game${games === 1 ? '' : 's'} so far — reads will sharpen after ~8–10.`,
            advice: 'Keep scanning; avoid overreacting to one result.'
        }));
    }

    const wr = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
    const whiteWr = profile.whiteGames ? Math.round((profile.whiteWins / profile.whiteGames) * 100) : null;
    const blackWr = profile.blackGames ? Math.round((profile.blackWins / profile.blackGames) * 100) : null;
    cards.push(makeInsightCard({
        id: 'scoreline',
        priority: 25,
        confidence: confidenceFromRated(profile.playerMoves || 0),
        title: 'Scoreline',
        body: `Across ${games} analyzed game${games === 1 ? '' : 's'} you’re scoring ${wr}% wins` +
            (whiteWr != null && blackWr != null ? ` (${whiteWr}% as White · ${blackWr}% as Black).` : '.'),
        advice: whiteWr != null && blackWr != null && Math.abs(whiteWr - blackWr) >= 15
            ? (whiteWr < blackWr
                ? 'Prioritize White repertoire and early plans — the colour gap is real in this sample.'
                : 'Prioritize Black defences — you’re underperforming with that colour.')
            : 'Use the focus card below as your single training target this week.'
    }));

    const leak = themeCardFromStore(corpus, 'bad', games);
    if (leak) cards.push(leak);
    const strength = themeCardFromStore(corpus, 'good', games);
    if (strength) cards.push(strength);

    const lossParts = [];
    let topLossPhase = null;
    let topLossN = 0;
    for (const phase of ['opening', 'middlegame', 'endgame']) {
        const n = corpus.lossPhase[phase] || 0;
        if (n) lossParts.push(`${n} decided in the ${phase}`);
        if (n > topLossN) {
            topLossN = n;
            topLossPhase = phase;
        }
    }
    if (profile.losses && topLossPhase && topLossN >= 2) {
        const conf = confidenceFromRated(topLossN * 3);
        cards.push(makeInsightCard({
            id: `loss_phase_${topLossPhase}`,
            priority: Math.min(100, 35 + topLossN * 8) * confidenceFactor(conf),
            confidence: conf,
            title: `Losses cluster in the ${topLossPhase}`,
            body: softBody(conf, `When you lose, the key moment is most often: ${lossParts.join(', ')}.`),
            advice: `Drill ${topLossPhase} decisions — start with the cited key moments.`,
            evidence: evidenceFromHits(corpus.keyLosses[topLossPhase] || [])
        }));
    }

    if (corpus.endgameEntered >= 3 && corpus.endgameEnteredDown / corpus.endgameEntered >= 0.55) {
        const pctDown = Math.round((corpus.endgameEnteredDown / corpus.endgameEntered) * 100);
        const conf = confidenceFromRated(corpus.endgameEntered * 2);
        cards.push(makeInsightCard({
            id: 'endgame_enter_down',
            priority: Math.min(100, 50 + pctDown * 0.4) * confidenceFactor(conf),
            confidence: conf,
            title: 'Endgames start from a deficit',
            body: softBody(conf,
                `You reach an endgame in ${corpus.endgameEntered} games, but enter it down on material ${pctDown}% of the time — many losses are decided before the last phase.`),
            advice: 'Fight for a better middlegame trade balance; don’t “hope” in bad endings.',
            evidence: (corpus.endgameDownLosses || []).slice(0, 3).map(g => {
                const idx = g.gameStory?.keyMoveIndex ?? Math.max(0, (g.moves || []).length - 1);
                return makeEvidence(g, g.moves?.[idx], idx);
            })
        }));
    }

    return rankAndCap(cards, 4);
}

function buildOpeningInsights(profile, corpus) {
    const cards = [];
    const bucket = corpus.byPhase.opening;
    const fav = favouriteOpeningLine(profile);
    const avgBookPlies = avg(corpus.bookDepths);
    const avgFullMoves = Math.round((avgBookPlies / 2) * 10) / 10;
    const q = phaseQualitySummary(bucket);
    const confOpen = confidenceFromRated(q?.rated || 0);

    if (fav) {
        const v = fav.entry.variations?.[0]?.name;
        const depthNote = avgFullMoves <= 3.5
            ? `you rarely steer it deeper than about ${Math.max(2, Math.round(avgFullMoves))} moves before leaving comfort book`
            : avgFullMoves <= 6
                ? `you typically stay in known waters for around ${avgFullMoves} moves`
                : `you’re happy to go deep — averaging about ${avgFullMoves} moves of book/theory`;
        const sideKey = fav.side === 'White' ? 'white' : 'black';
        const fam = corpus.openingFamilies[sideKey]?.[fav.entry.name];
        const evidence = [];
        if (fam?.sampleGame?.gameKey) {
            const g = fam.sampleGame;
            evidence.push(makeEvidence(g, g.moves?.[Math.min(10, (g.moves || []).length - 1)], Math.min(10, (g.moves || []).length - 1)));
        }
        cards.push(makeInsightCard({
            id: 'fav_opening',
            priority: 40 + Math.min(20, fav.entry.count * 2),
            confidence: fav.entry.count >= 5 ? 'high' : fav.entry.count >= 3 ? 'medium' : 'low',
            title: `Favourite · ${fav.entry.name}`,
            body: softBody(confOpen,
                `You favour the ${fav.entry.name} as ${fav.side}` +
                (v && v !== fav.entry.name ? ` (often the ${v} flavour)` : '') +
                `, and ${depthNote}.` +
                (fav.entry.count >= 3
                    ? ` Record ${fav.entry.wins}–${fav.entry.losses}–${fav.entry.draws} (${fav.entry.winRate}% wins).`
                    : '')),
            advice: 'Pick one model game in Learn and compare your branch points.',
            evidence,
            links: [{ kind: 'learn-opening', name: fav.entry.name }]
        }));
    }

    const worst = worstOpeningFamilyCard(corpus);
    if (worst) cards.push(worst);

    const brokeTotal = corpus.oppBrokeFirst + corpus.youBrokeFirst;
    if (brokeTotal >= 4) {
        const oppPct = Math.round((corpus.oppBrokeFirst / brokeTotal) * 100);
        const conf = confidenceFromRated(brokeTotal * 2);
        if (oppPct >= 58 || oppPct <= 42) {
            cards.push(makeInsightCard({
                id: 'book_break',
                priority: 35 * confidenceFactor(conf),
                confidence: conf,
                title: oppPct >= 58 ? 'Opponents break book first' : 'You leave book first',
                body: softBody(conf, oppPct >= 58
                    ? `Opponents leave book/theory before you in about ${oppPct}% of games — you’re often reacting.`
                    : `You’re usually the one to leave book first (${100 - oppPct}% of the time), so middlegame plans start on your terms.`),
                advice: oppPct >= 58
                    ? 'Prepare a sharp “what if they deviate?” plan in your main lines.'
                    : 'Make sure your early deviations are intentional plans, not impatience.'
            }));
        }
    }

    if (corpus.earlyBishopSacs.length >= 2) {
        const n = corpus.earlyBishopSacs.length;
        const badNet = corpus.earlyBishopSacs.filter(x => (x.ev.net || 0) <= 0 || x.ev.kind === 'hang').length;
        const conf = confidenceFromRated(n * 3);
        cards.push(makeInsightCard({
            id: 'early_bishop',
            themeKey: 'great_sacrifice',
            priority: Math.min(100, 30 + n * 10) * confidenceFactor(conf),
            confidence: conf,
            title: 'Early bishop adventures',
            body: softBody(conf,
                `When you develop a bishop early (moves 2–4), it turns into a sacrifice or hang in ${n} spot${n === 1 ? '' : 's'}` +
                (badNet >= Math.ceil(n * 0.5) ? ' — often without clear material back.' : '.')
            ),
            advice: 'Only sac the bishop when you can name the concrete follow-up before you play it.',
            evidence: evidenceFromHits(corpus.earlyBishopSacs.slice(0, 3))
        }));
    }

    const acc = phaseAccuracyCard('opening', corpus);
    if (acc) cards.push(acc);

    if (!cards.length) {
        cards.push(makeInsightCard({
            id: 'open_empty',
            priority: 10,
            confidence: 'low',
            title: 'Opening read forming',
            body: 'Not enough opening samples yet for a first read — keep analysing games.',
            advice: 'A few more games in your main lines will unlock family-specific notes.'
        }));
    }
    return rankAndCap(cards, 4);
}

function buildMiddlegameInsights(profile, corpus, heatData) {
    const cards = [];
    const bucket = corpus.byPhase.middlegame;
    if (!bucket.moves.length) {
        return [makeInsightCard({
            id: 'mid_empty',
            priority: 15,
            confidence: 'low',
            title: 'Thin middlegame sample',
            body: 'Many of your games skim past a clear middlegame (short miniatures or early endgames).',
            advice: 'Analyse longer games to flesh this phase out.'
        })];
    }

    const acc = phaseAccuracyCard('middlegame', corpus);
    if (acc) cards.push(acc);

    const hung = bucket.themes.hung_piece || 0;
    if (hung >= 3) {
        const row = corpus.themeStore.hung_piece;
        const conf = confidenceFromRated(hung * 2);
        cards.push(makeInsightCard({
            id: 'mid_hang',
            themeKey: 'hung_piece',
            priority: Math.min(100, 45 + hung * 5) * confidenceFactor(conf),
            confidence: conf,
            title: 'Loose pieces in the middlegame',
            body: softBody(conf, `Hung-piece moments showed up ${hung}× — unprotected units are a recurring theme.`),
            advice: 'Before every commit, ask: is anything unprotected?',
            evidence: evidenceFromHits(row?.examples || [])
        }));
    }

    const forks = bucket.themes.fork_victim || 0;
    if (forks >= 3) {
        const row = corpus.themeStore.fork_victim;
        const conf = confidenceFromRated(forks * 2);
        cards.push(makeInsightCard({
            id: 'mid_fork',
            themeKey: 'fork_victim',
            priority: Math.min(100, 40 + forks * 5) * confidenceFactor(conf),
            confidence: conf,
            title: 'Walking into forks',
            body: softBody(conf, `You’re walking into forks ${forks}× in this sample.`),
            advice: 'Watch knight checks and double attacks when the position opens.',
            evidence: evidenceFromHits(row?.examples || [])
        }));
    }

    const missed = bucket.themes.missed_hanging || 0;
    const won = bucket.themes.won_material || 0;
    if (missed >= 3 && missed > won) {
        const row = corpus.themeStore.missed_hanging;
        const conf = confidenceFromRated(missed * 2);
        cards.push(makeInsightCard({
            id: 'mid_missed',
            themeKey: 'missed_hanging',
            priority: Math.min(100, 42 + missed * 4) * confidenceFactor(conf),
            confidence: conf,
            title: 'Missing hanging material',
            body: softBody(conf, `You miss hanging enemy material (${missed}×) more often than you cash in wins (${won}×).`),
            advice: 'Train a “free piece?” scan each turn before looking for fancy ideas.',
            evidence: evidenceFromHits(row?.examples || [])
        }));
    } else if (won >= 3) {
        const row = corpus.themeStore.won_material;
        cards.push(makeInsightCard({
            id: 'mid_won',
            themeKey: 'won_material',
            priority: 32,
            confidence: confidenceFromRated(won * 2),
            title: 'You convert tactics',
            body: `When tactics land, you convert material (${won}× won-material themes).`,
            advice: 'Keep forcing those concrete wins — it’s a real strength.',
            evidence: evidenceFromHits(row?.examples || [])
        }));
    }

    const knightN = corpus.knightDevelops.length;
    const knightX = corpus.knightExchanges.length;
    if (knightN >= 6) {
        const tradePct = Math.round((knightX / knightN) * 100);
        const conf = confidenceFromRated(knightN);
        if (tradePct >= 35) {
            cards.push(makeInsightCard({
                id: 'mid_knight_trade',
                priority: 38 * confidenceFactor(conf),
                confidence: conf,
                title: 'Knights are “one and done”',
                body: softBody(conf,
                    `You develop knights actively, but about ${tradePct}% of those moves are tied to an immediate exchange — they rarely stay to dominate a square.`),
                advice: 'Ask whether the knight can sit on an outpost for two more moves before you trade.',
                evidence: evidenceFromHits(corpus.knightExchanges.slice(0, 3))
            }));
        }
    }

    const heat = heatData || (typeof buildPhaseColorHeatmaps === 'function'
        ? buildPhaseColorHeatmaps(profile)
        : null);
    if (heat?.buckets) {
        for (const color of ['white', 'black']) {
            const b = heat.buckets[color].middlegame;
            if (b.total < 12) continue;
            let hotSq = null;
            let hotN = 0;
            for (const [sq, n] of Object.entries(b.counts)) {
                if (n > hotN) {
                    hotN = n;
                    hotSq = sq;
                }
            }
            if (hotSq && hotN >= 4) {
                cards.push(makeInsightCard({
                    id: `mid_heat_${color}`,
                    priority: 28 + Math.min(20, hotN),
                    confidence: confidenceFromRated(b.total),
                    title: `Habit square as ${color === 'white' ? 'White' : 'Black'}`,
                    body: `Your middlegame pieces keep landing on ${hotSq.toUpperCase()} (${hotN}×) — check whether it’s a strong outpost or a trade magnet.`,
                    advice: `Review two games where you occupied ${hotSq.toUpperCase()} and note if the piece was stable.`
                }));
                break;
            }
        }
    }

    if (!cards.length) {
        cards.push(makeInsightCard({
            id: 'mid_forming',
            priority: 12,
            confidence: 'low',
            title: 'Middlegame patterns forming',
            body: 'More games will sharpen this read.',
            advice: 'Keep analysing; middlegame themes need volume.'
        }));
    }
    return rankAndCap(cards, 4);
}

function buildEndgameInsights(profile, corpus) {
    const cards = [];
    const bucket = corpus.byPhase.endgame;
    const q = phaseQualitySummary(bucket);

    if (!corpus.endgameEntered) {
        return [makeInsightCard({
            id: 'end_none',
            priority: 12,
            confidence: 'low',
            title: 'Few true endgames',
            body: 'Few of these games reach a true endgame (queens off / sparse material).',
            advice: 'When longer games appear, we’ll rate how you convert or defend.'
        })];
    }

    const enterPct = Math.round((corpus.endgameEntered / corpus.games) * 100);
    cards.push(makeInsightCard({
        id: 'end_rate',
        priority: 22,
        confidence: confidenceFromRated(corpus.endgameEntered * 2),
        title: 'Endgame frequency',
        body: `You reach endgame conditions in ${corpus.endgameEntered}/${corpus.games} games (${enterPct}%).`,
        advice: 'Longer technical games will teach more than miniatures here.'
    }));

    if (corpus.endgameEntered >= 3) {
        const downPct = Math.round((corpus.endgameEnteredDown / corpus.endgameEntered) * 100);
        const conf = confidenceFromRated(corpus.endgameEntered * 2);
        if (downPct >= 50) {
            cards.push(makeInsightCard({
                id: 'end_down',
                priority: Math.min(100, 48 + downPct * 0.35) * confidenceFactor(conf),
                confidence: conf,
                title: 'Arriving worse into endings',
                body: softBody(conf,
                    `You often enter the endgame already down on material (${downPct}% of those games)` +
                    (corpus.endgameLossesEnteredDown >= 2
                        ? ' — and that deficit shows up again in your losses.'
                        : '.')
                ),
                advice: 'Defend or complicate earlier; don’t bank on swindles from −2.',
                evidence: (corpus.endgameDownLosses || []).slice(0, 3).map(g => {
                    const idx = g.gameStory?.keyMoveIndex ?? Math.max(0, (g.moves || []).length - 1);
                    return makeEvidence(g, g.moves?.[idx], idx);
                })
            }));
        } else if (downPct <= 30) {
            cards.push(makeInsightCard({
                id: 'end_good_entry',
                priority: 30 * confidenceFactor(conf),
                confidence: conf,
                title: 'Healthy endgame entries',
                body: softBody(conf, `You usually arrive level or ahead (only ${downPct}% start down) — a good platform to convert.`),
                advice: 'Practice clean technique so those advantages don’t evaporate.'
            }));
        }
    }

    const acc = phaseAccuracyCard('endgame', corpus);
    if (acc) cards.push(acc);

    if (corpus.pawnEndgameMoves >= 10) {
        const bad = corpus.pawnEndgameBlunders;
        const badPct = Math.round((bad / corpus.pawnEndgameMoves) * 100);
        const conf = confidenceFromRated(corpus.pawnEndgameMoves);
        cards.push(makeInsightCard({
            id: 'end_pawns',
            priority: (badPct >= 8 ? 40 : 28) * confidenceFactor(conf),
            confidence: conf,
            title: 'Pawn endings',
            body: softBody(conf, badPct <= 5
                ? 'With just pawns (and kings) left you’re at your best — serious errors almost disappear.'
                : `Even in pawn endings you’re not fully safe — ${badPct}% of those moves are still Mistakes/Blunders.`),
            advice: badPct <= 5
                ? 'Steer toward pawn endings when you’re ahead.'
                : 'Drill king-and-pawn fundamentals (opposition, key squares).'
        }));
    }

    const backRank = bucket.themes.back_rank || 0;
    if (backRank >= 2) {
        const row = corpus.themeStore.back_rank;
        cards.push(makeInsightCard({
            id: 'end_backrank',
            themeKey: 'back_rank',
            priority: 36 + backRank * 4,
            confidence: confidenceFromRated(backRank * 3),
            title: 'Back-rank issues linger',
            body: `Back-rank themes still bite in the ending (${backRank}×).`,
            advice: 'Make luft before the heavy pieces come in.',
            evidence: evidenceFromHits(row?.examples || [])
        }));
    }

    return rankAndCap(cards, 4);
}

const PIECE_COACH_ORDER = [
    { type: 'p', label: 'Pawn' },
    { type: 'n', label: 'Knight' },
    { type: 'b', label: 'Bishop' },
    { type: 'r', label: 'Rook' },
    { type: 'q', label: 'Queen' },
    { type: 'k', label: 'King' }
];

function emptyPieceBucket() {
    return {
        total: 0,
        rated: 0,
        labels: {},
        themes: {},
        captures: 0,
        exchanges: 0,
        hangsOffered: 0,
        sacs: 0,
        missedCaptures: 0,
        castles: 0,
        checks: 0
    };
}

function collectByPieceStats(profile) {
    const buckets = {};
    for (const p of PIECE_COACH_ORDER) buckets[p.type] = emptyPieceBucket();

    for (const g of profile.analyzedGames || []) {
        for (const m of g.moves || []) {
            if (!isPlayerMove(g, m) || !m.classification?.label) continue;
            const type = movedPieceType(m);
            if (!type || !buckets[type]) continue;
            const b = buckets[type];
            b.total += 1;
            const label = m.classification.label;
            b.labels[label] = (b.labels[label] || 0) + 1;
            if (label !== 'Book' && label !== 'Theory') b.rated += 1;
            for (const t of m.moveThemes || []) {
                b.themes[t] = (b.themes[t] || 0) + 1;
            }
            const ev = m.materialEvent;
            if (ev?.kind === 'capture') b.captures += 1;
            if (ev?.kind === 'exchange') b.exchanges += 1;
            if (ev?.kind === 'hang' && (ev.offered === type || !ev.offered)) b.hangsOffered += 1;
            if (ev?.kind === 'sacrifice') b.sacs += 1;
            if (ev?.kind === 'missed_capture') b.missedCaptures += 1;
            if (type === 'k' && (m.san === 'O-O' || m.san === 'O-O-O')) b.castles += 1;
            if (String(m.san || '').includes('+') || String(m.san || '').includes('#')) b.checks += 1;
        }
    }
    return buckets;
}

function buildByPieceInsights(profile, survivalData, corpus) {
    const buckets = collectByPieceStats(profile);
    const survival = survivalData !== undefined
        ? survivalData
        : (typeof aggregatePieceSurvival === 'function' ? aggregatePieceSurvival(profile) : null);
    const pieceEv = corpus?.pieceEvidence || {};

    const survivalDeathRate = (pieceType) => {
        if (!survival) return null;
        const rows = [...(survival.white || []), ...(survival.black || [])]
            .filter(r => r.type === pieceType && r.games > 0 && r.deathRate != null);
        if (!rows.length) return null;
        const sum = rows.reduce((a, r) => a + r.deathRate * r.games, 0);
        const n = rows.reduce((a, r) => a + r.games, 0);
        return n ? Math.round((sum / n) * 10) / 10 : null;
    };

    return PIECE_COACH_ORDER.map(({ type, label }) => {
        const b = buckets[type];
        const good = [];
        const bad = [];
        const evidence = [];
        const evBad = pieceEv[type]?.bad;
        const evGood = pieceEv[type]?.good;
        if (evBad) evidence.push(makeEvidence(evBad.g, evBad.m, evBad.i));
        else if (evGood) evidence.push(makeEvidence(evGood.g, evGood.m, evGood.i));

        if (b.total < 4) {
            return {
                type,
                label,
                total: b.total,
                good: ['Not enough moves with this piece yet for a clear read.'],
                bad: [],
                evidence: []
            };
        }

        const best = (b.labels.Best || 0) + (b.labels.Excellent || 0);
        const goodN = b.labels.Good || 0;
        const blunders = b.labels.Blunder || 0;
        const mistakes = b.labels.Mistake || 0;
        const rated = Math.max(b.rated, 1);
        const bestPct = Math.round(((best + goodN) / rated) * 1000) / 10;
        const badPct = Math.round(((blunders + mistakes) / rated) * 1000) / 10;
        const blPct = Math.round((blunders / rated) * 1000) / 10;

        if (bestPct >= 45) {
            good.push(`Clean mover: ${bestPct}% of rated ${label.toLowerCase()} moves are Best/Excellent/Good.`);
        } else if (bestPct >= 32) {
            good.push(`Respectable accuracy — ${bestPct}% Best/Excellent/Good on rated ${label.toLowerCase()} moves.`);
        }
        if (b.captures >= 3) {
            good.push(`Picks up material often with this piece (${b.captures} winning captures in the sample).`);
        }
        if (type === 'k' && b.castles >= 3) {
            good.push(`Castles regularly (${b.castles}×) — king safety is part of your routine.`);
        }
        if (b.checks >= 4 && (type === 'q' || type === 'r' || type === 'n')) {
            good.push(`Creates pressure: ${b.checks} checks delivered with the ${label.toLowerCase()}.`);
        }
        if (b.sacs >= 2 && type !== 'p') {
            if (b.hangsOffered < b.sacs) {
                good.push(`Willing to sacrifice this piece (${b.sacs}×) when you see compensation.`);
            }
        }
        const topGood = Object.entries(b.themes)
            .filter(([id]) => THEME_CATALOG[id]?.polarity === 'good' && !PROFILE_SKIP_THEMES.has(id))
            .sort((a, c) => c[1] - a[1])[0];
        if (topGood && topGood[1] >= 2) {
            good.push(THEME_CATALOG[topGood[0]].detail);
        }

        if (blPct >= 10) {
            bad.push(`Blunder-prone with the ${label.toLowerCase()}: ${blPct}% of rated moves are Blunders.` +
                (evBad ? ` Example: ${formatMoveRef(evBad.m)}.` : ''));
        } else if (badPct >= 18) {
            bad.push(`Mistakes add up — ${badPct}% of rated ${label.toLowerCase()} moves are Mistake/Blunder.`);
        }
        if (b.hangsOffered >= 3) {
            bad.push(`This piece gets hung or left loose too often (${b.hangsOffered}×).`);
        }
        if (b.missedCaptures >= 3) {
            bad.push(`Misses hanging enemy units while moving the ${label.toLowerCase()} (${b.missedCaptures}×).`);
        }
        if (b.exchanges >= 4 && (type === 'n' || type === 'b')) {
            const tradePct = Math.round((b.exchanges / b.total) * 100);
            if (tradePct >= 20) {
                bad.push(`Often “one and done” — about ${tradePct}% of these moves are immediate exchanges.`);
            }
        }
        if (type === 'q' && blunders >= 2) {
            bad.push('Queen raids are risky in this sample — double-check retreat squares before committing her.');
        }
        if (type === 'k' && (b.themes.king_in_center || 0) >= 2) {
            bad.push('The king gets caught in the centre more than once — castle or close the middle sooner.');
        }
        if (type === 'r' && (b.themes.back_rank || 0) >= 2) {
            bad.push('Back-rank themes show up around your rook play — make luft before the heavy pieces invade.');
        }
        const death = survivalDeathRate(type);
        if (death != null && death >= 70 && type !== 'p' && type !== 'k') {
            bad.push(`Starting ${label.toLowerCase()}s leave the board in ~${death}% of games — they don’t last long.`);
        } else if (death != null && death <= 35 && type !== 'p' && type !== 'k' && type !== 'q') {
            good.push(`Your starting ${label.toLowerCase()}s tend to survive (${death}% capture rate across games).`);
        }
        const topBad = Object.entries(b.themes)
            .filter(([id]) => THEME_CATALOG[id]?.polarity === 'bad')
            .sort((a, c) => c[1] - a[1])[0];
        if (topBad && topBad[1] >= 2) {
            bad.push(THEME_CATALOG[topBad[0]].detail);
        }

        if (!good.length) good.push('No standout strength yet — mostly mixed results with this piece.');
        if (!bad.length) bad.push('No loud weakness flagged for this piece in the current sample.');

        return {
            type,
            label,
            total: b.total,
            bestPct,
            badPct,
            good,
            bad,
            evidence: evidence.filter(Boolean).slice(0, 1)
        };
    });
}

function generateProfileInsights(profile, opts = {}) {
    const corpus = collectInsightCorpus(profile);
    const survival = opts.survival !== undefined
        ? opts.survival
        : (typeof aggregatePieceSurvival === 'function' ? aggregatePieceSurvival(profile) : null);
    const heat = opts.heat !== undefined
        ? opts.heat
        : (typeof buildPhaseColorHeatmaps === 'function' ? buildPhaseColorHeatmaps(profile) : null);

    const sections = {
        overview: buildOverviewInsights(profile, corpus),
        opening: buildOpeningInsights(profile, corpus),
        middlegame: buildMiddlegameInsights(profile, corpus, heat),
        endgame: buildEndgameInsights(profile, corpus)
    };
    demoteDuplicateThemes(sections);
    const focus = pickWeeklyFocus(sections);

    return {
        version: 2,
        focus,
        overview: sections.overview,
        opening: sections.opening,
        middlegame: sections.middlegame,
        endgame: sections.endgame,
        byPiece: buildByPieceInsights(profile, survival, corpus),
        corpus
    };
}

function insightParagraphsHtml(lines) {
    if (!lines?.length) return '<div class="insight-empty">No notes yet.</div>';
    return lines.map(t => `<p class="coach-line">${escInsightHtml(t)}</p>`).join('');
}

function coachConfidenceChip(confidence) {
    const c = confidence || 'low';
    return `<span class="coach-conf coach-conf-${escInsightHtml(c)}">${escInsightHtml(c)}</span>`;
}

function coachEvidenceHtml(evidence) {
    if (!evidence?.length) return '';
    return `
        <div class="coach-evidence">
            <div class="coach-evidence-label">Evidence</div>
            ${evidence.map(e => {
                if (!e.gameKey) {
                    return `<div class="coach-evidence-item is-static">${escInsightHtml(e.moveRef || e.san)} · vs ${escInsightHtml(e.opponent)}</div>`;
                }
                const label = e.label ? ` · ${e.label}` : '';
                return `<button type="button" class="coach-evidence-item" onclick="openCoachEvidence(decodeURIComponent('${encodeURIComponent(e.gameKey)}'), ${Number(e.moveIndex)})">
                    vs ${escInsightHtml(e.opponent)} · ${escInsightHtml(e.moveRef || e.san)}${escInsightHtml(label)}${e.result ? ` · ${escInsightHtml(e.result)}` : ''}
                </button>`;
            }).join('')}
        </div>
    `;
}

function coachLinksHtml(links) {
    if (!links?.length) return '';
    return `
        <div class="coach-links">
            ${links.map(l => {
                if (l.kind === 'learn-opening' && l.name) {
                    return `<button type="button" class="p-button p-button-text p-button-sm p-component" onclick="openLearningItem('opening', decodeURIComponent('${encodeURIComponent(l.name)}'))">
                        <span class="p-button-icon-left pi pi-book"></span>
                        <span class="p-button-label">Study ${escInsightHtml(l.name)} in Learn</span>
                    </button>`;
                }
                return '';
            }).join('')}
        </div>
    `;
}

function insightCardsHtml(cards, { focusStyle = false } = {}) {
    if (!cards?.length) return '<div class="insight-empty">No notes yet.</div>';
    // Backward compat: plain strings
    if (typeof cards[0] === 'string') return insightParagraphsHtml(cards);
    return cards.map(card => `
        <div class="coach-card${focusStyle ? ' is-focus' : ''}">
            <div class="coach-card-head">
                <div class="coach-card-title">${escInsightHtml(card.title)}</div>
                ${coachConfidenceChip(card.confidence)}
            </div>
            <p class="coach-card-body">${escInsightHtml(card.body)}</p>
            ${card.advice ? `<p class="coach-card-advice"><span class="coach-advice-label">Do this:</span> ${escInsightHtml(card.advice)}</p>` : ''}
            ${coachEvidenceHtml(card.evidence)}
            ${coachLinksHtml(card.links)}
        </div>
    `).join('');
}

function openCoachEvidence(gameKey, moveIndex) {
    if (!gameKey || typeof openReviewFromStore !== 'function') return;
    openReviewFromStore(gameKey);
    const idx = Number(moveIndex);
    if (Number.isFinite(idx) && idx >= 0) {
        setTimeout(() => {
            if (typeof goToMove === 'function') goToMove(idx);
        }, 0);
    }
}

function byPieceCoachHtml(pieces) {
    if (!pieces?.length) return '<div class="insight-empty">No piece notes yet.</div>';
    return `
        <div class="piece-coach-grid">
            ${pieces.map(p => `
                <div class="piece-coach-card">
                    <div class="piece-coach-head">
                        <span class="piece-coach-name">${escInsightHtml(p.label)}</span>
                        <span class="piece-coach-meta">${p.total} move${p.total === 1 ? '' : 's'}${p.bestPct != null ? ` · ${p.bestPct}% Best/Excellent/Good` : ''}</span>
                    </div>
                    <div class="game-coach-cols">
                        <div>
                            <div class="game-coach-side-label good">Pros</div>
                            <ul class="game-coach-list">
                                ${(p.good || []).map(t => `<li class="game-coach-good">${escInsightHtml(t)}</li>`).join('') || '<li class="game-coach-muted">—</li>'}
                            </ul>
                        </div>
                        <div>
                            <div class="game-coach-side-label bad">Cons</div>
                            <ul class="game-coach-list">
                                ${(p.bad || []).map(t => `<li class="game-coach-bad">${escInsightHtml(t)}</li>`).join('') || '<li class="game-coach-muted">—</li>'}
                            </ul>
                        </div>
                    </div>
                    ${p.evidence?.length ? coachEvidenceHtml(p.evidence) : ''}
                </div>
            `).join('')}
        </div>
    `;
}

/** Build Insights-tab aggregates once (during scan / idle), not on every tab paint. */
function rebuildAnalysisSnapshot(profile) {
    if (!profile || !(profile.analyzedGames || []).length) {
        if (profile) {
            profile.analysisSnapshot = null;
            profile.analysisSnapshotDirty = false;
        }
        return null;
    }
    for (const g of profile.analyzedGames) {
        if (typeof hydrateCachedAnalysis === 'function') hydrateCachedAnalysis(g, g.pgn);
        if (typeof enrichAnalysisMeta === 'function') enrichAnalysisMeta(g);
    }
    const heat = typeof buildPhaseColorHeatmaps === 'function'
        ? buildPhaseColorHeatmaps(profile)
        : null;
    const survival = typeof aggregatePieceSurvival === 'function'
        ? aggregatePieceSurvival(profile)
        : null;
    const mates = typeof aggregateCheckmatePieces === 'function'
        ? aggregateCheckmatePieces(profile)
        : null;
    const insights = generateProfileInsights(profile, { survival, heat });
    const analytics = typeof computeProfileAnalytics === 'function'
        ? computeProfileAnalytics(profile)
        : null;
    profile.analysisSnapshot = {
        gameCount: profile.analyzedGames.length,
        insights,
        survival,
        mates,
        heat,
        analytics
    };
    profile.analysisSnapshotDirty = false;
    return profile.analysisSnapshot;
}

function finishBarsHtml(groups, total, resultKey) {
    const order = ['mate', 'resign', 'timeout', 'draw', 'win', 'other'];
    const entries = order
        .map(k => ({ key: k, n: groups?.[k] || 0 }))
        .filter(e => e.n > 0);
    if (!entries.length || !total) {
        return '<div class="insight-empty">No finishes in this bucket yet.</div>';
    }
    return `
        <div class="finish-stack">
            ${entries.map(e => {
                const pct = Math.round((e.n / total) * 1000) / 10;
                const label = (typeof FINISH_GROUP_LABELS !== 'undefined' && FINISH_GROUP_LABELS[e.key])
                    || e.key;
                return `
                    <div class="finish-row">
                        <div class="finish-label">${escInsightHtml(label)}</div>
                        <div class="finish-track">
                            <div class="finish-fill finish-${escInsightHtml(resultKey.toLowerCase())}" style="width:${Math.max(pct, e.n ? 3 : 0)}%"></div>
                        </div>
                        <div class="finish-pct">${e.n} · ${pct}%</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function evidenceBtnHtml(ev) {
    if (!ev?.gameKey) return '';
    return `<button type="button" class="coach-evidence-item" onclick="openCoachEvidence(decodeURIComponent('${encodeURIComponent(ev.gameKey)}'), ${Number(ev.moveIndex)})">
        vs ${escInsightHtml(ev.opponent || 'opponent')} · ${escInsightHtml(ev.moveRef || ev.san || '')}${ev.label ? ` · ${escInsightHtml(ev.label)}` : ''}
    </button>`;
}

function wldMiniHtml(row, title) {
    if (!row?.games) return '';
    return `
        <div class="split-stat-card">
            <div class="split-stat-title">${escInsightHtml(title)}</div>
            <div class="split-stat-line">${row.games} games · ${row.wins}/${row.losses}/${row.draws}${row.wr != null ? ` · ${row.wr}% W` : ''}</div>
            <div class="split-stat-line text-color-secondary">${row.avgAccuracy != null ? `${row.avgAccuracy}% acc` : '—'}${row.avgCpl != null ? ` · ${row.avgCpl} CPL` : ''}</div>
        </div>
    `;
}

function renderProfileFormPanel(profile, analyticsData) {
    const root = document.getElementById('analysis-form');
    if (!root) return;
    const a = analyticsData || (typeof computeProfileAnalytics === 'function'
        ? computeProfileAnalytics(profile)
        : null);
    if (!a || !a.gameCount) {
        root.innerHTML = '<div class="insight-empty">Form stats appear once games are analyzed.</div>';
        return;
    }

    const wins = Object.values(a.finishGroups.WIN || {}).reduce((s, n) => s + n, 0);
    const losses = Object.values(a.finishGroups.LOSS || {}).reduce((s, n) => s + n, 0);
    const draws = Object.values(a.finishGroups.DRAW || {}).reduce((s, n) => s + n, 0);
    const gap = a.avgRatingGap;
    const pc = a.phaseCpl || {};

    const resignNote = a.resignLosses
        ? `<div class="form-note text-color-secondary text-sm mb-3">
            Losses: ${a.matedLosses} by mate · ${a.resignLosses} by resign
            ${a.earlyResignLosses ? ` (${a.earlyResignLosses} while eval was not fully dead)` : ''}.
           </div>`
        : '';

    const gapCards = ['underdog', 'even', 'favorite']
        .map(k => wldMiniHtml(a.gapBands?.[k], (typeof GAP_BAND_LABELS !== 'undefined' ? GAP_BAND_LABELS[k] : k)))
        .filter(Boolean)
        .join('');

    const tcCards = Object.entries(a.timeClassStats || {})
        .filter(([, row]) => row.games > 0)
        .sort((x, y) => y[1].games - x[1].games)
        .map(([k, row]) => {
            const label = typeof formatTimeClassLabel === 'function' ? formatTimeClassLabel(k) : k;
            return wldMiniHtml(row, label);
        })
        .join('');

    root.innerHTML = `
        <div class="form-metrics">
            <div class="form-metric">
                <div class="form-metric-value">${a.avgAccuracy != null ? `${a.avgAccuracy}%` : '—'}</div>
                <div class="form-metric-label">Avg accuracy</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.avgGameElo != null
                    ? (typeof formatGameEloLabel === 'function' ? formatGameEloLabel(a.avgGameElo) : a.avgGameElo)
                    : '—'}</div>
                <div class="form-metric-label">Avg Game ELO</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.avgCpl != null ? a.avgCpl : '—'}</div>
                <div class="form-metric-label">Avg CPL</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.avgGameCpl != null ? a.avgGameCpl : '—'}</div>
                <div class="form-metric-label">CPL / game</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.avgSwingCp != null ? a.avgSwingCp : '—'}</div>
                <div class="form-metric-label">Avg max swing</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.collapses || 0}/${a.comebacks || 0}</div>
                <div class="form-metric-label">Collapses / comebacks</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${a.avgOppAccuracy != null ? `${a.avgOppAccuracy}%` : '—'}</div>
                <div class="form-metric-label">Opp accuracy</div>
            </div>
            <div class="form-metric">
                <div class="form-metric-value">${gap == null ? '—' : (gap >= 0 ? `+${gap}` : String(gap))}</div>
                <div class="form-metric-label">Rating gap</div>
            </div>
        </div>
        <div class="profile-kicker mb-2">CPL by phase</div>
        <div class="phase-cpl-row mb-3">
            <span>Opening <strong>${pc.opening != null ? pc.opening : '—'}</strong></span>
            <span>Middlegame <strong>${pc.middlegame != null ? pc.middlegame : '—'}</strong></span>
            <span>Endgame <strong>${pc.endgame != null ? pc.endgame : '—'}</strong></span>
        </div>
        ${resignNote}
        <div class="finish-grid mb-3">
            <div class="finish-col">
                <div class="profile-kicker">Wins · ${wins}</div>
                ${finishBarsHtml(a.finishGroups.WIN, wins, 'WIN')}
            </div>
            <div class="finish-col">
                <div class="profile-kicker">Losses · ${losses}</div>
                ${finishBarsHtml(a.finishGroups.LOSS, losses, 'LOSS')}
            </div>
            <div class="finish-col">
                <div class="profile-kicker">Draws · ${draws}</div>
                ${finishBarsHtml(a.finishGroups.DRAW, draws, 'DRAW')}
            </div>
        </div>
        ${gapCards ? `<div class="profile-kicker mb-2">Performance vs rating gap</div><div class="split-stat-grid mb-3">${gapCards}</div>` : ''}
        ${tcCards ? `<div class="profile-kicker mb-2">By time control</div><div class="split-stat-grid">${tcCards}</div>` : ''}
    `;
}

function renderTacticsEnginePanel(profile, analyticsData) {
    const root = document.getElementById('analysis-tactics');
    if (!root) return;
    const a = analyticsData || (typeof computeProfileAnalytics === 'function'
        ? computeProfileAnalytics(profile)
        : null);
    if (!a || !a.gameCount) {
        root.innerHTML = '<div class="insight-empty">Tactics stats appear once games are analyzed.</div>';
        return;
    }

    const mat = a.materialCards || [];
    const em = a.engineMisses || {};
    const alt = a.altEngine || {};
    const od = a.opponentDynamics || {};
    const ks = a.kingSafety || [];

    const matHtml = mat.length
        ? mat.map(c => `
            <div class="theme-freq-card polarity-${escInsightHtml(c.polarity)}">
                <div class="theme-freq-pct">${c.pctGames}%</div>
                <div class="theme-freq-body">
                    <div class="theme-freq-text">${escInsightHtml(c.label)} in ${c.games} game${c.games === 1 ? '' : 's'} (${c.events}×)</div>
                    <div class="theme-freq-detail text-color-secondary">Material-event rate from hang / sac / capture tagging.</div>
                    ${c.evidence ? `<div class="coach-evidence">${evidenceBtnHtml(c.evidence)}</div>` : ''}
                </div>
            </div>
        `).join('')
        : '<div class="insight-empty">No material events tagged yet.</div>';

    const engineHtml = em.chances
        ? `<div class="split-stat-card">
                <div class="split-stat-title">Missed engine shots</div>
                <div class="split-stat-line">${em.capture} capture · ${em.check} check misses (${em.chances} chances)</div>
                <div class="coach-evidence">
                    ${evidenceBtnHtml(em.examples?.capture)}
                    ${evidenceBtnHtml(em.examples?.check)}
                </div>
           </div>`
        : `<div class="split-stat-card"><div class="split-stat-title">Missed engine shots</div><div class="split-stat-line text-color-secondary">No clear capture/check engine misses in this sample.</div></div>`;

    const altHtml = alt.games
        ? `<div class="split-stat-card">
                <div class="split-stat-title">MultiPV / deepen</div>
                <div class="split-stat-line">${alt.games} deepened game${alt.games === 1 ? '' : 's'}</div>
                <div class="split-stat-line text-color-secondary">When missing #1, played a top-2 line ${alt.top2Rate != null ? `${alt.top2Rate}%` : '—'} of the time (${alt.top2Hits}/${alt.chances})</div>
           </div>`
        : `<div class="split-stat-card"><div class="split-stat-title">MultiPV / deepen</div><div class="split-stat-line text-color-secondary">Deepen a review to track top-2 engine hits.</div></div>`;

    const oppHtml = `
        <div class="split-stat-card">
            <div class="split-stat-title">You punish mistakes</div>
            <div class="split-stat-line">${od.punishRate != null ? `${od.punishRate}%` : '—'} after opp Mistake/Blunder (${od.punishedOpp || 0}/${od.oppBlunders || 0})</div>
            ${od.punishEvidence ? `<div class="coach-evidence">${evidenceBtnHtml(od.punishEvidence)}</div>` : ''}
        </div>
        <div class="split-stat-card">
            <div class="split-stat-title">Opponents punish you</div>
            <div class="split-stat-line">${od.outplayRate != null ? `${od.outplayRate}%` : '—'} after your Mistake/Blunder (${od.oppPunishedYou || 0}/${od.yourBlunders || 0})</div>
            ${od.outplayEvidence ? `<div class="coach-evidence">${evidenceBtnHtml(od.outplayEvidence)}</div>` : ''}
        </div>
    `;

    const ksHtml = ks.length
        ? `<div class="profile-kicker mb-2">King safety</div>
           <div class="theme-freq-list mb-3">${ks.map(c => `
                <div class="theme-freq-card polarity-bad">
                    <div class="theme-freq-pct">${c.pct}%</div>
                    <div class="theme-freq-body">
                        <div class="theme-freq-text">${escInsightHtml(c.text)}</div>
                        <div class="theme-freq-detail text-color-secondary">${escInsightHtml(c.detail)}</div>
                        ${c.evidence ? `<div class="coach-evidence">${evidenceBtnHtml(c.evidence)}</div>` : ''}
                    </div>
                </div>
           `).join('')}</div>`
        : '';

    root.innerHTML = `
        <div class="profile-kicker mb-2">Material events</div>
        <div class="theme-freq-list mb-3">${matHtml}</div>
        <div class="profile-kicker mb-2">Engine &amp; opponents</div>
        <div class="split-stat-grid mb-3">${engineHtml}${altHtml}${oppHtml}</div>
        ${ksHtml}
    `;
}

function renderThemeFrequencyPanel(profile, analyticsData) {
    const root = document.getElementById('analysis-themes');
    if (!root) return;
    const a = analyticsData || (typeof computeProfileAnalytics === 'function'
        ? computeProfileAnalytics(profile)
        : null);
    const cards = a?.themeCards || [];
    if (!cards.length) {
        root.innerHTML = '<div class="insight-empty">Theme frequency fills in as tactical and positional tags appear on your moves.</div>';
        return;
    }

    const habits = cards.filter(c => c.skipped && c.polarity === 'good').slice(0, 4);
    // King-safety themes are featured in the tactics panel — keep theme list focused elsewhere
    const focus = cards.filter(c => !c.skipped && !c.kingSafety).slice(0, 10);

    const cardHtml = (c) => {
        const ev = c.evidence;
        const evidenceBtn = ev?.gameKey
            ? `<button type="button" class="coach-evidence-item" onclick="openCoachEvidence(decodeURIComponent('${encodeURIComponent(ev.gameKey)}'), ${Number(ev.moveIndex)})">
                    vs ${escInsightHtml(ev.opponent)} · ${escInsightHtml(ev.moveRef || ev.san)}${ev.label ? ` · ${escInsightHtml(ev.label)}` : ''}
               </button>`
            : '';
        return `
            <div class="theme-freq-card polarity-${escInsightHtml(c.polarity)}${c.skipped ? ' is-habit' : ''}">
                <div class="theme-freq-pct">${c.pct}%</div>
                <div class="theme-freq-body">
                    <div class="theme-freq-text">${escInsightHtml(c.text)}</div>
                    <div class="theme-freq-detail text-color-secondary">${escInsightHtml(c.detail)}</div>
                    ${evidenceBtn ? `<div class="coach-evidence">${evidenceBtn}</div>` : ''}
                </div>
            </div>
        `;
    };

    root.innerHTML = `
        ${habits.length ? `
            <div class="theme-habits mb-3">
                <div class="profile-kicker mb-2">Healthy habits</div>
                <div class="theme-freq-list">${habits.map(cardHtml).join('')}</div>
            </div>
        ` : ''}
        <div class="profile-kicker mb-2">Standing out</div>
        <div class="theme-freq-list">
            ${focus.length ? focus.map(cardHtml).join('') : '<div class="insight-empty">No distinctive themes yet.</div>'}
        </div>
    `;
}

function renderCoachInsights(profile, insightsData) {
    const root = document.getElementById('analysis-coach');
    if (!root) return;
    const insights = insightsData || generateProfileInsights(profile);
    const focusBlock = insights.focus
        ? `<div class="coach-block coach-focus-block">
                <div class="coach-kicker">This week’s focus</div>
                ${insightCardsHtml([insights.focus], { focusStyle: true })}
           </div>`
        : '';
    root.innerHTML = `
        ${focusBlock}
        <div class="coach-block">
            <div class="coach-kicker">Overview</div>
            ${insightCardsHtml(insights.overview)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Opening</div>
            ${insightCardsHtml(insights.opening)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Middlegame</div>
            ${insightCardsHtml(insights.middlegame)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Endgame</div>
            ${insightCardsHtml(insights.endgame)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">By piece</div>
            <div class="text-color-secondary text-sm mb-2">Pros and cons of how you handle each piece type — with an example move when we have one.</div>
            ${byPieceCoachHtml(insights.byPiece)}
        </div>
    `;
}

/** Per-game coach notes from the reviewed player's perspective. */
function generateGameCoachNotes(analysis) {
    const { phases, endgameStart } = assignMovePhases(analysis);
    const byPhase = {
        opening: { good: [], bad: [], moves: [] },
        middlegame: { good: [], bad: [], moves: [] },
        endgame: { good: [], bad: [], moves: [] }
    };

    for (let i = 0; i < (analysis.moves || []).length; i++) {
        const m = analysis.moves[i];
        if (!isPlayerMove(analysis, m) || !m.classification?.label) continue;
        const phase = phases[i] || 'middlegame';
        if (!byPhase[phase]) continue;
        byPhase[phase].moves.push({ m, i });
    }

    const pushUnique = (arr, text, limit = 3) => {
        if (!text || arr.includes(text) || arr.length >= limit) return;
        arr.push(text);
    };

    for (const phase of ['opening', 'middlegame', 'endgame']) {
        const bucket = byPhase[phase];
        let best = 0;
        let good = 0;
        let blunders = 0;
        let mistakes = 0;
        let misses = 0;
        let book = 0;
        const themeGood = {};
        const themeBad = {};
        const materialNotes = [];
        const badMoveRefs = [];

        for (const { m, i } of bucket.moves) {
            const label = m.classification.label;
            if (label === 'Best' || label === 'Excellent') best += 1;
            else if (label === 'Good') good += 1;
            else if (label === 'Blunder') {
                blunders += 1;
                badMoveRefs.push({ m, i, label });
            } else if (label === 'Mistake') {
                mistakes += 1;
                badMoveRefs.push({ m, i, label });
            } else if (label === 'Miss') {
                misses += 1;
                badMoveRefs.push({ m, i, label });
            } else if (label === 'Book' || label === 'Theory') book += 1;

            for (const t of m.moveThemes || []) {
                const cat = THEME_CATALOG[t];
                if (!cat) continue;
                if (cat.polarity === 'good') themeGood[t] = (themeGood[t] || 0) + 1;
                else themeBad[t] = (themeBad[t] || 0) + 1;
            }

            const ev = m.materialEvent;
            if (ev) {
                const ref = formatMoveRef(m);
                if (ev.kind === 'sacrifice' && (ev.net || 0) <= 0) {
                    materialNotes.push({ bad: true, text: `Loose sac on ${ref} didn’t pay back clearly — revisit that moment.` });
                } else if (ev.kind === 'hang') {
                    materialNotes.push({ bad: true, text: `Hung material on ${ref} — check unprotected units next time.` });
                } else if (ev.kind === 'capture' || (ev.kind === 'sacrifice' && (ev.net || 0) > 0)) {
                    materialNotes.push({ bad: false, text: `Won / forced material around ${ref}.` });
                } else if (ev.kind === 'missed_capture') {
                    materialNotes.push({ bad: true, text: `Missed a hanging piece near ${ref} — scan for free takes.` });
                }
            }
        }

        const n = bucket.moves.length;
        if (!n) {
            if (phase === 'endgame' && endgameStart == null) {
                pushUnique(bucket.bad, 'This game never reached a true endgame.');
            } else {
                pushUnique(bucket.bad, 'No moves for you in this phase.');
            }
            continue;
        }

        if (book >= 2 && phase === 'opening') {
            pushUnique(bucket.good, `Stayed in book/theory for ${book} of your opening moves.`);
        }
        if (best + good >= 2) {
            pushUnique(bucket.good, `${best + good} Best/Excellent/Good moves out of ${n} in this phase.`);
        } else if (best >= 1) {
            pushUnique(bucket.good, `Found ${best} Best/Excellent move${best === 1 ? '' : 's'} here.`);
        }

        const topGoodTheme = Object.entries(themeGood).sort((a, b) => b[1] - a[1])[0];
        if (topGoodTheme && THEME_CATALOG[topGoodTheme[0]]) {
            pushUnique(bucket.good, THEME_CATALOG[topGoodTheme[0]].detail);
        }
        for (const note of materialNotes.filter(x => !x.bad)) {
            pushUnique(bucket.good, note.text, 2);
        }

        if (blunders) {
            const ex = badMoveRefs.find(x => x.label === 'Blunder');
            pushUnique(bucket.bad,
                `${blunders} blunder${blunders === 1 ? '' : 's'} in this phase` +
                (ex ? ` (e.g. ${formatMoveRef(ex.m)})` : '') +
                ' — the biggest accuracy leak.');
        }
        if (mistakes) {
            const ex = badMoveRefs.find(x => x.label === 'Mistake');
            pushUnique(bucket.bad,
                `${mistakes} mistake${mistakes === 1 ? '' : 's'} that still hurt` +
                (ex ? ` (e.g. ${formatMoveRef(ex.m)})` : '') + '.');
        }
        if (misses && !blunders) {
            pushUnique(bucket.bad, `${misses} miss${misses === 1 ? '' : 'es'} — failed to convert after an opponent error.`);
        }
        const topBadTheme = Object.entries(themeBad).sort((a, b) => b[1] - a[1])[0];
        if (topBadTheme && THEME_CATALOG[topBadTheme[0]]) {
            pushUnique(bucket.bad, THEME_CATALOG[topBadTheme[0]].detail);
        }
        for (const note of materialNotes.filter(x => x.bad)) {
            pushUnique(bucket.bad, note.text, 2);
        }

        if (phase === 'endgame' && endgameStart != null && analysis.moves[endgameStart]?.fen) {
            const mat = sideMaterialFromFen(analysis.moves[endgameStart].fen);
            const mine = analysis.isWhite ? mat.white : mat.black;
            const theirs = analysis.isWhite ? mat.black : mat.white;
            if (mine < theirs) {
                pushUnique(bucket.bad, `You entered the endgame down on material (${mine} vs ${theirs}).`);
            } else if (mine > theirs) {
                pushUnique(bucket.good, `You entered the endgame ahead on material (${mine} vs ${theirs}).`);
            }
        }

        if (!bucket.good.length) pushUnique(bucket.good, 'Nothing strongly positive stood out — mostly quiet or mixed moves.');
        if (!bucket.bad.length) pushUnique(bucket.bad, 'No major red flags in this phase from the labels we tracked.');
    }

    const overview = [];
    if (analysis.gameStory?.headline) overview.push(analysis.gameStory.headline);
    if (analysis.gameStory?.detail) overview.push(analysis.gameStory.detail);
    const you = sideMoveStats(analysis, true);
    if (you.accuracy != null) {
        overview.push(
            `Your rated-move accuracy this game: ${you.accuracy}%` +
            (you.gameElo != null
                ? ` · Game ELO guess ${typeof formatGameEloLabel === 'function' ? formatGameEloLabel(you.gameElo) : you.gameElo}.`
                : '.')
        );
    }
    if (analysis.gameStory?.keyMoveRef) {
        overview.push(`Key moment to revisit: ${analysis.gameStory.keyMoveRef}.`);
    }
    if (!overview.length) overview.push('Here’s a quick good/bad split by phase for your moves.');

    return {
        overview,
        opening: byPhase.opening,
        middlegame: byPhase.middlegame,
        endgame: byPhase.endgame
    };
}

function gameCoachPhaseHtml(title, bucket) {
    const good = (bucket.good || []).map(t => `<li class="game-coach-good">${escInsightHtml(t)}</li>`).join('');
    const bad = (bucket.bad || []).map(t => `<li class="game-coach-bad">${escInsightHtml(t)}</li>`).join('');
    return `
        <div class="coach-block">
            <div class="coach-kicker">${title}</div>
            <div class="game-coach-cols">
                <div>
                    <div class="game-coach-side-label good">What went well</div>
                    <ul class="game-coach-list">${good || '<li class="game-coach-muted">—</li>'}</ul>
                </div>
                <div>
                    <div class="game-coach-side-label bad">What hurt</div>
                    <ul class="game-coach-list">${bad || '<li class="game-coach-muted">—</li>'}</ul>
                </div>
            </div>
        </div>
    `;
}

function buildGameByPieceNotes(analysis) {
    const buckets = {};
    for (const p of PIECE_COACH_ORDER) buckets[p.type] = emptyPieceBucket();

    for (const m of analysis.moves || []) {
        if (!isPlayerMove(analysis, m) || !m.classification?.label) continue;
        const type = movedPieceType(m);
        if (!type || !buckets[type]) continue;
        const b = buckets[type];
        b.total += 1;
        const label = m.classification.label;
        b.labels[label] = (b.labels[label] || 0) + 1;
        if (label !== 'Book' && label !== 'Theory') b.rated += 1;
        for (const t of m.moveThemes || []) b.themes[t] = (b.themes[t] || 0) + 1;
        const ev = m.materialEvent;
        if (ev?.kind === 'capture') b.captures += 1;
        if (ev?.kind === 'hang') b.hangsOffered += 1;
        if (ev?.kind === 'sacrifice') b.sacs += 1;
        if (ev?.kind === 'missed_capture') b.missedCaptures += 1;
        if (type === 'k' && (m.san === 'O-O' || m.san === 'O-O-O')) b.castles += 1;
    }

    return PIECE_COACH_ORDER.map(({ type, label }) => {
        const b = buckets[type];
        const good = [];
        const bad = [];
        if (!b.total) {
            return { type, label, total: 0, good: ['Not used this game.'], bad: [] };
        }
        const best = (b.labels.Best || 0) + (b.labels.Excellent || 0) + (b.labels.Good || 0);
        const blunders = b.labels.Blunder || 0;
        const mistakes = b.labels.Mistake || 0;
        if (best) good.push(`${best} Best/Excellent/Good move${best === 1 ? '' : 's'} with the ${label.toLowerCase()}.`);
        if (b.captures) good.push(`Won material with it (${b.captures}×).`);
        if (b.castles) good.push('Castled to safety.');
        if (blunders) bad.push(`${blunders} blunder${blunders === 1 ? '' : 's'} with the ${label.toLowerCase()}.`);
        if (mistakes) bad.push(`${mistakes} mistake${mistakes === 1 ? '' : 's'}.`);
        if (b.hangsOffered) bad.push(`Left this piece loose / hanging (${b.hangsOffered}×).`);
        if (b.missedCaptures) bad.push(`Missed a hanging piece while moving it (${b.missedCaptures}×).`);
        if (!good.length) good.push('No standout plus with this piece.');
        if (!bad.length) bad.push('No serious red flags with this piece.');
        return { type, label, total: b.total, good, bad };
    }).filter(p => p.total > 0 || p.good[0] !== 'Not used this game.');
}

function renderGameCoachNotes(analysis) {
    const notes = generateGameCoachNotes(analysis);
    const byPiece = buildGameByPieceNotes(analysis);
    return `
        <div class="game-coach">
            <div class="coach-block">
                <div class="coach-kicker">Overview</div>
                ${insightParagraphsHtml(notes.overview)}
            </div>
            ${gameCoachPhaseHtml('Opening', notes.opening)}
            ${gameCoachPhaseHtml('Middlegame', notes.middlegame)}
            ${gameCoachPhaseHtml('Endgame', notes.endgame)}
            <div class="coach-block">
                <div class="coach-kicker">By piece</div>
                ${byPieceCoachHtml(byPiece)}
            </div>
        </div>
    `;
}
