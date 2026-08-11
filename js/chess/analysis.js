/* chess/analysis.js — Analyze Chess */

async function resolveStockfishWorkerUrl() {
    // Prefer same-origin script — most reliable for Workers on GitHub Pages
    try {
        const local = await fetch(STOCKFISH_LOCAL, { method: 'HEAD', cache: 'no-cache' });
        if (local.ok) {
            log('Using local /stockfish.js');
            return STOCKFISH_LOCAL;
        }
        log(`Local stockfish HEAD status ${local.status}`);
    } catch (e) {
        log(`Local stockfish check failed: ${e.message}`);
    }

    log('Falling back to CDN blob...');
    const response = await fetch(STOCKFISH_CDN);
    if (!response.ok) throw new Error(`Stockfish CDN returned ${response.status}`);
    const scriptBody = await response.text();
    if (!scriptBody || scriptBody.length < 1000) throw new Error("Stockfish script empty/truncated");
    log(`Stockfish downloaded (${Math.round(scriptBody.length / 1024)} KB).`);
    return URL.createObjectURL(new Blob([scriptBody], { type: 'application/javascript' }));
}

function createEngine(workerUrl, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(workerUrl);
        } catch (err) {
            reject(err);
            return;
        }

        let settled = false;
        const lines = [];
        const bootTimeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                try { worker.terminate(); } catch (_) {}
                const tail = lines.slice(-5).join(' | ') || '(no messages)';
                reject(new Error(`Engine boot timeout. Last: ${tail}`));
            }
        }, timeoutMs);

        const finishOk = () => {
            if (settled) return;
            settled = true;
            clearTimeout(bootTimeout);
            worker.onmessage = null;
            worker.onerror = null;
            resolve(worker);
        };

        worker.onmessage = (e) => {
            const msg = typeof e.data === 'string' ? e.data.trim() : String(e.data || '');
            if (msg) {
                lines.push(msg.slice(0, 80));
                if (lines.length > 20) lines.shift();
            }
            // Ready as soon as UCI handshake completes — do not wait for readyok
            if (msg === 'uciok' || /(^|\s)uciok(\s|$)/.test(msg)) finishOk();
        };
        worker.onerror = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(bootTimeout);
            try { worker.terminate(); } catch (_) {}
            reject(new Error(err.message || "Worker error"));
        };

        worker.postMessage('uci');
    });
}

function moveToUci(move) {
    const promo = move.promotion ? String(move.promotion).toLowerCase() : '';
    return move.from + move.to + promo;
}

/** True if played UCI is PV1, or PV2 within tieCp of PV1 (Familiar-style near-best). */
function isEngineTopOrTied(best, move, tieCp = 0) {
    if (!best?.bestMove || !move) return false;
    const uci = moveToUci(move);
    const topUci = String(best.bestMove).toLowerCase();
    if (uci === topUci) return true;
    if (!tieCp || tieCp <= 0) return false;
    const alt = (best.altMoves || [])[0];
    if (!alt?.move || String(alt.move).toLowerCase() !== uci) return false;
    if (alt.scoreCp == null || best.score == null) return false;
    const top = scoreForSideToMove(best);
    let altCp = alt.scoreCp;
    if (alt.isMate) {
        const n = Math.abs(altCp) || 1;
        altCp = altCp > 0 ? (600 - Math.min(n, 10) * 10) : (-600 + Math.min(n, 10) * 10);
    }
    return Math.abs(top - altCp) <= tieCp;
}

function scoreForSideToMove(analysis) {
    if (!analysis) return 0;
    if (analysis.isMate) {
        // Mate scores: positive = side to move is mating. Cap magnitude so mate-distance
        // flicker cannot invent multi-pawn "blunders" between two shallow searches.
        const n = Math.abs(analysis.score) || 1;
        const capped = Math.min(n, 10);
        return analysis.score > 0 ? (600 - capped * 10) : (-600 + capped * 10);
    }
    // Clamp ordinary evals so one noisy depth-5 spike can't dominate
    return Math.max(-1500, Math.min(1500, analysis.score || 0));
}

/** Map player-centric centipawns → expected score / win probability in [0, 1]. */
function evalCpToWinProb(cp, k) {
    const coeff = (k != null && Number.isFinite(k))
        ? k
        : (typeof getActiveAnalysisPreset === 'function' && getActiveAnalysisPreset()?.winProbK != null
            ? getActiveAnalysisPreset().winProbK
            : 0.55);
    const pawns = Math.max(-12, Math.min(12, (Number(cp) || 0) / 100));
    return 1 / (1 + Math.exp(-coeff * pawns));
}

function topEngineGapCp(bestBefore) {
    const alts = bestBefore?.altMoves || [];
    if (!alts.length || bestBefore.score == null) return null;
    const top = scoreForSideToMove(bestBefore);
    const alt = alts[0];
    if (!alt || alt.scoreCp == null) return null;
    let altCp = alt.scoreCp;
    if (alt.isMate) {
        const n = Math.abs(altCp) || 1;
        altCp = altCp > 0 ? (600 - Math.min(n, 10) * 10) : (-600 + Math.min(n, 10) * 10);
    }
    return Math.max(0, top - altCp);
}

/**
 * Centipawn loss + expected-points (win-prob) loss.
 * Adaptive noise: quieter positions keep the full floor; mates / clear PV gaps / critical
 * moments trust the engine more (lower floor).
 */
function computeEvalDelta(bestBefore, actualAfter, opts = {}) {
    // UCI scores are from the side to move:
    // before = player's turn, after = opponent's turn → playerEvalAfter = -scoreAfter
    const before = scoreForSideToMove(bestBefore);
    const afterForPlayer = -scoreForSideToMove(actualAfter);
    const rawCpl = Math.max(0, before - afterForPlayer);

    let noise = opts.noiseFloor != null
        ? opts.noiseFloor
        : (typeof getEvalNoiseFloorCp === 'function' ? getEvalNoiseFloorCp() : EVAL_NOISE_FLOOR_CP);
    if (bestBefore?.isMate || actualAfter?.isMate) noise = Math.min(noise, 35);
    const gap = opts.engineGapCp != null ? opts.engineGapCp : topEngineGapCp(bestBefore);
    if (gap != null && gap >= 180) noise = Math.min(noise, 45);
    if (opts.critical) noise = Math.min(noise, 55);
    if (opts.deepened) noise = Math.min(noise, 50);

    const evalDeltaCp = Math.max(0, rawCpl - noise);
    const winBefore = evalCpToWinProb(before);
    const winAfter = evalCpToWinProb(afterForPlayer);
    // Expected points lost (0–1). Apply a softer zeroing so Familiar still sees Excellent-tier dips.
    const winLossRaw = Math.max(0, winBefore - winAfter);
    const zeroBelow = noise * (typeof getActiveAnalysisPreset === 'function'
        && getActiveAnalysisPreset()?.id === 'familiar' ? 0.25 : 0.5);
    const winLoss = rawCpl < zeroBelow ? 0 : winLossRaw;

    return {
        rawCpl,
        evalDeltaCp,
        evalDelta: evalDeltaCp / 100,
        winLoss,
        winBefore,
        winAfter,
        beforeCp: before,
        afterCp: afterForPlayer,
        noiseUsed: noise
    };
}

function isCriticalMoment(chessBefore, move, best, rawCpl) {
    // Keep this narrow — every capture/check used to force a depth+4 MultiPV re-search
    // and roughly doubled scan time. Only re-search when the first pass already looks sharp.
    if (best?.isMate) return true;
    const cpl = rawCpl || 0;
    if (cpl >= 220) return true;
    const san = String(move?.san || '');
    if ((san.includes('#') || san.includes('+')) && cpl >= 120) return true;
    if (move?.captured && cpl >= 150) return true;
    try {
        const inCheck = (typeof chessBefore.in_check === 'function' && chessBefore.in_check())
            || (typeof chessBefore.inCheck === 'function' && chessBefore.inCheck());
        if (inCheck && cpl >= 120) return true;
    } catch (_) {}
    return false;
}

function getEngineAnalysis(engine, fen, opts = {}) {
    const depth = opts.depth ?? (typeof getScanEngineDepth === 'function' ? getScanEngineDepth() : ENGINE_DEPTH);
    const multiPv = Math.max(1, opts.multiPv ?? 1);
    const baseDepth = typeof getScanEngineDepth === 'function' ? getScanEngineDepth() : ENGINE_DEPTH;
    const timeoutMs = opts.timeoutMs ?? (
        depth > baseDepth
            ? REVIEW_ENGINE_TIMEOUT_MS
            : (typeof getScanEngineTimeoutMs === 'function' ? getScanEngineTimeoutMs(depth) : 2500)
    );

    return new Promise((resolve) => {
        if (!enginesReady || !engine) {
            return resolve({ score: 0, isMate: false, bestMove: '', reliable: false, altMoves: [] });
        }
        let score = 0, isMate = false, bestMove = '';
        const pvLines = new Map(); // multipv index -> { move, scoreCp, isMate }
        let settled = false;

        const finish = (reliable) => {
            if (settled) return;
            settled = true;
            engine.removeEventListener('message', handler);
            clearTimeout(timeout);
            if (multiPv > 1) {
                try { engine.postMessage('setoption name MultiPV value 1'); } catch (_) {}
            }
            const altMoves = [];
            for (let i = 2; i <= multiPv; i++) {
                const line = pvLines.get(i);
                if (line?.move) altMoves.push(line);
            }
            // Prefer multipv 1 for score/best if we got it
            const top = pvLines.get(1);
            if (top) {
                score = top.scoreCp;
                isMate = !!top.isMate;
                if (top.move) bestMove = top.move;
            }
            resolve({ score, isMate, bestMove, reliable, altMoves });
        };

        const timeout = setTimeout(() => {
            try { engine.postMessage('stop'); } catch (_) {}
            finish(!!bestMove || pvLines.has(1));
        }, timeoutMs);

        const handler = (e) => {
            if (typeof e.data !== 'string') return;
            const msg = e.data;
            if (msg.includes(' score ')) {
                const pvIdx = Number((msg.match(/\bmultipv (\d+)/) || [])[1] || 1);
                let lineScore = null;
                let lineMate = false;
                const cp = msg.match(/score cp (-?\d+)/);
                const mate = msg.match(/score mate (-?\d+)/);
                if (cp) {
                    lineScore = parseInt(cp[1], 10);
                    lineMate = false;
                } else if (mate) {
                    lineScore = parseInt(mate[1], 10);
                    lineMate = true;
                }
                const pvMove = (msg.match(/\bpv\s+(\S+)/) || [])[1];
                if (lineScore != null) {
                    const prev = pvLines.get(pvIdx) || {};
                    pvLines.set(pvIdx, {
                        move: pvMove || prev.move || '',
                        scoreCp: lineScore,
                        isMate: lineMate
                    });
                    if (pvIdx === 1) {
                        score = lineScore;
                        isMate = lineMate;
                    }
                }
            }
            if (msg.startsWith('bestmove')) {
                const m = msg.match(/bestmove\s+(\S+)/);
                bestMove = m && m[1] !== '(none)' ? m[1] : '';
                finish(!!bestMove || pvLines.has(1));
            }
        };
        engine.addEventListener('message', handler);
        if (multiPv > 1) {
            try { engine.postMessage(`setoption name MultiPV value ${multiPv}`); } catch (_) {}
        }
        engine.postMessage(`position fen ${fen}`);
        engine.postMessage(`go depth ${depth}`);
    });
}

/**
 * Chess.com-style expected-points bands (V2 help-center cutoffs).
 * Best = engine top choice only. Excellent = tiny EP loss (including near-zero non-best).
 * Great / Miss applied afterward.
 */
function classifyMove({
    evalDelta = 0,
    winLoss = null,
    isPlayer,
    isBook,
    isTheory,
    playedBest,
    reliable,
    theoryName,
    openingName
}) {
    const stem = (playerText, opponentText) => (isPlayer ? playerText : opponentText);

    if (isTheory) {
        return {
            label: 'Theory',
            class: 'cls-theory',
            desc: stem(
                theoryName ? `Replaying ${theoryName}.` : 'Following a famous theoretical game.',
                theoryName ? `Opponent stays in ${theoryName}.` : 'Opponent follows the theoretical line.'
            )
        };
    }
    if (isBook) {
        return {
            label: 'Book',
            class: 'cls-book',
            desc: stem(
                openingName ? `Opening book — ${openingName}.` : 'Standard opening book move.',
                openingName ? `Opponent book move — ${openingName}.` : 'Opponent opening book move.'
            )
        };
    }

    let ep = winLoss != null && Number.isFinite(winLoss)
        ? Math.max(0, winLoss)
        : Math.min(1, Math.max(0, (evalDelta || 0) / 5));
    const preset = typeof getActiveAnalysisPreset === 'function' ? getActiveAnalysisPreset() : null;
    if (preset?.epScale != null && Number.isFinite(preset.epScale)) {
        ep *= Math.max(0.2, Math.min(1.5, preset.epScale));
    }
    const bands = preset?.epBands || {};
    const excellentCap = bands.excellent != null ? bands.excellent : 0.02;
    const goodCap = bands.good != null ? bands.good : 0.05;
    const inaccCap = bands.inaccuracy != null ? bands.inaccuracy : 0.10;
    const mistakeCap = bands.mistake != null ? bands.mistake : 0.20;

    // Chess.com: Best = engine top choice. Zero EP after noise without matching top → Excellent.
    if (playedBest) {
        return {
            label: 'Best',
            class: 'cls-best',
            desc: stem('Engine top choice.', 'Opponent played the engine top choice.')
        };
    }

    if (!reliable) {
        if (ep <= goodCap) {
            return {
                label: 'Good',
                class: 'cls-good',
                desc: stem('Strong, practical move.', 'Strong, practical opponent move.')
            };
        }
        return {
            label: 'Inaccuracy',
            class: 'cls-inaccuracy',
            desc: stem(
                'Uncertain engine sample — treated as a small concession.',
                'Uncertain engine sample — opponent move treated as a small concession.'
            )
        };
    }

    if (ep <= excellentCap) {
        return {
            label: 'Excellent',
            class: 'cls-excellent',
            desc: stem('Nearly best — tiny expected-points dip.', 'Nearly best for the opponent.')
        };
    }
    if (ep <= goodCap) {
        return {
            label: 'Good',
            class: 'cls-good',
            desc: stem('Sound move; slight expected-points concession.', 'Sound opponent move; slight concession.')
        };
    }
    if (ep <= inaccCap) {
        return {
            label: 'Inaccuracy',
            class: 'cls-inaccuracy',
            desc: stem('Small slip — clearly better was available.', 'Opponent inaccuracy — small slip.')
        };
    }
    if (ep <= mistakeCap) {
        return {
            label: 'Mistake',
            class: 'cls-mistake',
            desc: stem('Real damage to winning chances.', 'Opponent mistake — real damage to their chances.')
        };
    }
    return {
        label: 'Blunder',
        class: 'cls-blunder',
        desc: stem('Heavy expected-points collapse.', 'Opponent blunder — heavy expected-points collapse.')
    };
}

/** Upgrade Best → Great when MultiPV shows a clear only-move. */
function maybeUpgradeToGreat(cls, { playedBest, engineGapCp } = {}) {
    if (!cls || !playedBest || cls.label !== 'Best') return cls;
    const preset = typeof getActiveAnalysisPreset === 'function' ? getActiveAnalysisPreset() : null;
    const need = preset?.greatGapCp != null ? preset.greatGapCp : 160;
    if (engineGapCp == null || engineGapCp < need) return cls;
    return {
        label: 'Great',
        class: 'cls-great',
        desc: 'Critical only-move — much better than the alternatives.'
    };
}

/**
 * Chess.com-style Miss: failed to punish / convert, or missed a hanging capture.
 * Applied for whichever side just moved (not only the profile user).
 */
function maybeUpgradeToMiss(cls, {
    prevOppLabel,
    winBefore,
    winLoss,
    playedBest,
    materialEvent
} = {}) {
    if (!cls || playedBest) return cls;
    if (['Book', 'Theory', 'Best', 'Excellent', 'Good', 'Great', 'Miss'].includes(cls.label)) return cls;

    const missCls = {
        label: 'Miss',
        class: 'cls-miss',
        desc: 'Missed a chance to convert after the opponent’s error.'
    };

    if (materialEvent?.kind === 'missed_capture' && ['Inaccuracy', 'Mistake', 'Blunder'].includes(cls.label)) {
        return {
            ...missCls,
            desc: materialEvent.captured
                ? `Missed a hanging ${pieceLabel(materialEvent.captured)}.`
                : 'Missed a hanging piece.'
        };
    }

    // Strict: opponent just Mistake/Blundered, we were better, and we failed to punish
    const oppGaveChance = prevOppLabel === 'Blunder'
        || (prevOppLabel === 'Mistake' && winBefore != null && winBefore >= 0.72);
    const wasBetter = winBefore != null && Number.isFinite(winBefore) && winBefore >= 0.66;
    if (oppGaveChance && wasBetter && ['Mistake', 'Blunder'].includes(cls.label)) {
        return missCls;
    }
    if (oppGaveChance && wasBetter && cls.label === 'Inaccuracy' && (winLoss || 0) >= 0.05) {
        return missCls;
    }
    return cls;
}

/** Soft-preset: demote borderline Blunders that aren’t hangs / mates. */
function maybeSoftDemoteBlunder(cls, { materialEvent, best, winLoss } = {}) {
    const preset = typeof getActiveAnalysisPreset === 'function' ? getActiveAnalysisPreset() : null;
    if (!preset?.softBlunders || !cls || cls.label !== 'Blunder') return cls;
    if (materialEvent?.kind === 'hang') return cls;
    if (best?.isMate) return cls;
    const ep = winLoss != null && Number.isFinite(winLoss) ? winLoss : 0;
    const keep = preset.softBlunderKeepEp != null ? preset.softBlunderKeepEp : 0.28;
    if (ep >= keep) return cls;
    return {
        label: 'Mistake',
        class: 'cls-mistake',
        desc: 'Real damage to winning chances.'
    };
}

/** Prefer theme/material wording for Miss/Mistake/Blunder headlines. */
function enrichClassificationDesc(cls, { themes = [], materialEvent = null, narrative = '', isPlayer = true } = {}) {
    if (!cls?.label) return cls;
    const label = cls.label;
    const hard = ['Miss', 'Mistake', 'Blunder'].includes(label);
    let phrase = null;

    if (materialEvent?.kind === 'hang' && materialEvent.offered) {
        phrase = `hung the ${pieceLabel(materialEvent.offered)}`;
    } else if (materialEvent?.kind === 'missed_capture' && materialEvent.captured) {
        phrase = `missed a hanging ${pieceLabel(materialEvent.captured)}`;
    } else if (materialEvent?.kind === 'sacrifice' && materialEvent.offered) {
        phrase = `sacrificed the ${pieceLabel(materialEvent.offered)}`;
    } else if (materialEvent?.kind === 'capture' && materialEvent.captured) {
        phrase = `won the ${pieceLabel(materialEvent.captured)}`;
    }

    if (!phrase && typeof THEME_LABEL_PHRASES !== 'undefined') {
        const order = Object.keys(THEME_LABEL_PHRASES);
        for (const id of order) {
            if (themes.includes(id) && THEME_LABEL_PHRASES[id]) {
                phrase = THEME_LABEL_PHRASES[id];
                break;
            }
        }
    }

    if (hard && phrase) {
        cls.desc = isPlayer
            ? `${label} — ${phrase}.`
            : `Opponent ${label.toLowerCase()} — ${phrase}.`;
    } else if (narrative) {
        cls.desc = narrative;
    } else if (phrase && isPlayer) {
        cls.desc = `What you did here: ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
    }
    return cls;
}

function isPlayerMove(analysis, move) {
    if (!move) return false;
    // Prefer side-to-move vs analysis colour (stored flags can go stale across cache/hydrate)
    if (analysis && typeof analysis.isWhite === 'boolean' && (move.turn === 'w' || move.turn === 'b')) {
        return analysis.isWhite ? move.turn === 'w' : move.turn === 'b';
    }
    if (typeof move.isPlayerMove === 'boolean') return move.isPlayerMove;
    return false;
}

/** Convert a side-to-move UCI score (after a move) into white-centric centipawns. */
function whiteCentricEval(analysisAfterMove, sideToMoveAfter) {
    const stm = scoreForSideToMove(analysisAfterMove);
    return sideToMoveAfter === 'w' ? stm : -stm;
}


function analysisStillRunning() {
    return !!(isScanning || isDeepening);
}

async function analyzeGame(game, user, engine, onMove, opts = {}) {
    const preset = typeof getActiveAnalysisPreset === 'function' ? getActiveAnalysisPreset() : null;
    const depth = opts.depth ?? (typeof getScanEngineDepth === 'function' ? getScanEngineDepth() : ENGINE_DEPTH);
    const multiPv = opts.multiPv ?? preset?.multiPv ?? 1;
    const baseDepth = typeof getScanEngineDepth === 'function' ? getScanEngineDepth() : ENGINE_DEPTH;
    const timeoutMs = opts.timeoutMs ?? (
        depth > baseDepth
            ? REVIEW_ENGINE_TIMEOUT_MS
            : (typeof getScanEngineTimeoutMs === 'function' ? getScanEngineTimeoutMs(depth) : 2500)
    );

    const chess = new Chess();
    chess.load_pgn(game.pgn);
    const history = chess.history({verbose: true});
    const isWhite = game.white.username.toLowerCase() === user.toLowerCase();
    const userColor = isWhite ? 'w' : 'b';

    // Replay once to collect FENs for opening identification
    const fenProbe = new Chess();
    const fensAfterMoves = [];
    for (const mv of history) {
        fenProbe.move(mv);
        fensAfterMoves.push(fenProbe.fen());
    }
    const sans = history.map(h => h.san);
    const openingMatch = identifyOpening(sans, fensAfterMoves);
    const theoryMatch = identifyTheory(sans);
    
    let moveData = [];
    let counters = { blunders: 0, great: 0, book: 0 };
    const moveThemes = [];
    const moveThemeCounts = {};
    const tempChess = new Chess();
    let lastEval = { score: 0, isMate: false, bestMove: '', reliable: false, altMoves: [] };
    let prevOppLabel = null;

    for (let i = 0; i < history.length; i++) {
        if (!analysisStillRunning()) return null;
        onMove(i + 1, history.length);

        const isUserTurn = (isWhite && i % 2 === 0) || (!isWhite && i % 2 !== 0);
        const isTheory = i < theoryMatch.count;
        const isBook = !isTheory && i < openingMatch.count;
        
        const fenBefore = tempChess.fen();
        const beforeSnap = new Chess(fenBefore);
        tempChess.move(history[i]);
        const fenAfter = tempChess.fen();

        let best = { score: 0, isMate: false, bestMove: '', reliable: false, altMoves: [] };
        let actual = { ...lastEval, reliable: lastEval.reliable || false, altMoves: [] };
        let evalDelta = 0;
        let evalDeltaCp = 0;
        let winLoss = null;
        let winBefore = null;
        let playedBest = false;
        let reliable = true;
        let moveDepth = depth;
        let engineGapCp = null;

        // Classify both sides after leaving book/theory (same quality labels)
        if (!isBook && !isTheory) {
            best = await getEngineAnalysis(engine, fenBefore, { depth, multiPv, timeoutMs });
            actual = await getEngineAnalysis(engine, fenAfter, { depth, multiPv: 1, timeoutMs });
            let gap = topEngineGapCp(best);
            engineGapCp = gap;
            let rawProbe = computeEvalDelta(best, actual, { engineGapCp: gap });
            const critical = isCriticalMoment(beforeSnap, history[i], best, rawProbe.rawCpl);
            const critDepth = typeof getCriticalEngineDepth === 'function'
                ? getCriticalEngineDepth()
                : (depth + 4);
            // Deeper re-search only on sharp first-pass moments (MultiPV 1 during scans for speed)
            if (critical && depth < critDepth && analysisStillRunning()) {
                const deepTimeout = typeof CRITICAL_ENGINE_TIMEOUT_MS === 'number'
                    ? CRITICAL_ENGINE_TIMEOUT_MS
                    : Math.max(timeoutMs, 4000);
                best = await getEngineAnalysis(engine, fenBefore, {
                    depth: critDepth,
                    multiPv: Math.max(multiPv, 2),
                    timeoutMs: deepTimeout
                });
                actual = await getEngineAnalysis(engine, fenAfter, {
                    depth: critDepth,
                    multiPv: 1,
                    timeoutMs: deepTimeout
                });
                gap = topEngineGapCp(best);
                engineGapCp = gap;
                rawProbe = computeEvalDelta(best, actual, {
                    engineGapCp: gap,
                    critical: true,
                    deepened: true
                });
                moveDepth = critDepth;
            } else {
                rawProbe = computeEvalDelta(best, actual, {
                    engineGapCp: gap,
                    critical
                });
            }
            evalDeltaCp = rawProbe.evalDeltaCp;
            evalDelta = rawProbe.evalDelta;
            winLoss = rawProbe.winLoss;
            winBefore = rawProbe.winBefore;
            playedBest = isEngineTopOrTied(
                best,
                history[i],
                (typeof getActiveAnalysisPreset === 'function' ? getActiveAnalysisPreset()?.bestTieCp : 0) || 0
            );
            reliable = !!(best.reliable && actual.reliable);
            lastEval = actual;
        }

        let cls = classifyMove({
            evalDelta,
            winLoss,
            isPlayer: isUserTurn,
            isBook,
            isTheory,
            playedBest,
            reliable,
            theoryName: theoryMatch.name,
            openingName: openingMatch.name
        });

        let themes = [];
        let narrative = cls.desc || '';
        let materialEvent = null;
        // Material/themes for both colours so Miss/Great match Chess.com's full-game review
        if (!isBook && !isTheory) {
            try {
                const moverColor = history[i].color || (i % 2 === 0 ? 'w' : 'b');
                const described = describePlayerMove({
                    before: beforeSnap,
                    after: tempChess,
                    move: history[i],
                    bestMoveUci: best.bestMove,
                    userColor: moverColor,
                    clsLabel: cls.label,
                    futureMoves: history.slice(i + 1),
                    evalDelta
                });
                themes = described.themes;
                materialEvent = described.materialEvent || null;
                narrative = described.narrative || cls.desc;
            } catch (_) {}

            cls = maybeUpgradeToGreat(cls, { playedBest, engineGapCp });
            cls = maybeSoftDemoteBlunder(cls, { materialEvent, best, winLoss });
            cls = maybeUpgradeToMiss(cls, {
                prevOppLabel,
                winBefore,
                winLoss,
                playedBest,
                materialEvent
            });
            enrichClassificationDesc(cls, {
                themes,
                materialEvent,
                narrative: narrative || cls.desc,
                isPlayer: isUserTurn
            });
        }

        if (isUserTurn) {
            for (const id of themes) {
                moveThemes.push(id);
                moveThemeCounts[id] = (moveThemeCounts[id] || 0) + 1;
            }
            if (cls.label === 'Blunder') counters.blunders++;
            if (cls.label === 'Best' || cls.label === 'Excellent' || cls.label === 'Good' || cls.label === 'Great') {
                counters.great++;
            }
            if (cls.label === 'Book' || cls.label === 'Theory') counters.book++;
        }

        if (!isBook && !isTheory) {
            prevOppLabel = cls.label;
        } else {
            prevOppLabel = cls.label;
        }

        // Always white-centric: after the move, STM is the other side
        const evalWhite = whiteCentricEval(actual, tempChess.turn());

        moveData.push({ 
            san: history[i].san, from: history[i].from, to: history[i].to,
            eval: evalWhite, isMate: actual.isMate,
            fen: fenAfter, classification: cls,
            openingName: isTheory ? theoryMatch.name : (isBook ? openingMatch.name : null),
            moveNum: Math.floor(i/2) + 1, turn: i % 2 === 0 ? 'w' : 'b',
            isPlayerMove: isUserTurn,
            bestEngineMove: best.bestMove,
            altEngineMoves: (best.altMoves || []).map(a => ({
                move: a.move,
                scoreCp: a.scoreCp,
                isMate: !!a.isMate
            })),
            moveThemes: themes,
            materialEvent,
            evalDelta: !isBook && !isTheory ? evalDelta : null,
            evalDeltaCp: !isBook && !isTheory ? evalDeltaCp : null,
            winLoss: !isBook && !isTheory ? winLoss : null,
            engineDepth: !isBook && !isTheory ? moveDepth : null
        });
    }

    const maxDepth = moveData.reduce((m, x) => Math.max(m, x.engineDepth || depth), depth);
    return finalizeAnalysis(attachGameMeta(attachGamePlayers({
        moves: moveData,
        isWhite,
        username: user,
        opponent: isWhite ? game.black.username : game.white.username,
        result: normalizeResult(game, isWhite),
        resultDetail: isWhite ? game.white.result : game.black.result,
        oppResultDetail: isWhite ? game.black.result : game.white.result,
        endTime: game.end_time || 0,
        pgn: game.pgn || '',
        blunders: counters.blunders, greatMoves: counters.great, bookCount: counters.book,
        openingName: theoryMatch.name || openingMatch.name,
        moveThemes: [...new Set(moveThemes)],
        moveThemeCounts,
        engineDepth: maxDepth,
        multiPv
    }, game, user), game));
}

function pgnHeaderTag(pgn, tag) {
    if (!pgn) return null;
    const re = new RegExp('\\[' + tag + '\\s+"([^"]*)"\\]', 'i');
    const m = String(pgn).match(re);
    return m ? m[1] : null;
}

/** Infer Chess.com-style time class from a TimeControl string (seconds or base+inc). */
function inferTimeClassFromControl(tc) {
    if (!tc) return null;
    const s = String(tc).trim();
    if (!s || s === '-' || s.toLowerCase() === 'unknown') return null;
    if (s.includes('/')) return 'daily';
    const m = s.match(/^(\d+)\s*(?:\+\s*(\d+))?$/);
    if (!m) return null;
    const base = Number(m[1]);
    const inc = Number(m[2] || 0);
    // Estimated game length in seconds (Chess.com-ish): base + 40 increments
    const est = base + 40 * inc;
    if (est < 180) return 'bullet';
    if (est < 600) return 'blitz';
    if (est < 1500) return 'rapid';
    return 'classical';
}

/** Persist time class / rated flags from Chess.com API or PGN headers. */
function attachGameMeta(analysis, game) {
    if (!analysis) return analysis;
    if (game) {
        if (game.time_class) analysis.timeClass = String(game.time_class).toLowerCase();
        if (game.time_control != null && game.time_control !== '') {
            analysis.timeControl = String(game.time_control);
        }
        if (typeof game.rated === 'boolean') analysis.rated = game.rated;
    }
    const pgn = game?.pgn || analysis.pgn || '';
    if (!analysis.timeControl) {
        const tc = pgnHeaderTag(pgn, 'TimeControl');
        if (tc) analysis.timeControl = tc;
    }
    if (!analysis.timeClass) {
        analysis.timeClass = inferTimeClassFromControl(analysis.timeControl);
    }
    if (analysis.rated == null) {
        const event = pgnHeaderTag(pgn, 'Event') || '';
        if (/rated/i.test(event)) analysis.rated = true;
        else if (/unrated/i.test(event)) analysis.rated = false;
    }
    return analysis;
}

function formatTimeClassLabel(tc) {
    if (!tc) return '';
    const s = String(tc).toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Attach Chess.com white/black usernames + ratings (API first, PGN headers as fallback). */
function attachGamePlayers(analysis, game, user) {
    if (!analysis) return analysis;
    if (user) analysis.username = user;
    if (game?.white) {
        if (game.white.username) analysis.whiteUsername = game.white.username;
        if (game.white.rating != null && game.white.rating !== '') {
            analysis.whiteRating = Number(game.white.rating);
        }
    }
    if (game?.black) {
        if (game.black.username) analysis.blackUsername = game.black.username;
        if (game.black.rating != null && game.black.rating !== '') {
            analysis.blackRating = Number(game.black.rating);
        }
    }
    const pgn = game?.pgn || analysis.pgn || '';
    if (!analysis.whiteUsername) analysis.whiteUsername = pgnHeaderTag(pgn, 'White');
    if (!analysis.blackUsername) analysis.blackUsername = pgnHeaderTag(pgn, 'Black');
    if (analysis.whiteRating == null || Number.isNaN(analysis.whiteRating)) {
        const elo = pgnHeaderTag(pgn, 'WhiteElo');
        if (elo && !Number.isNaN(Number(elo))) analysis.whiteRating = Number(elo);
    }
    if (analysis.blackRating == null || Number.isNaN(analysis.blackRating)) {
        const elo = pgnHeaderTag(pgn, 'BlackElo');
        if (elo && !Number.isNaN(Number(elo))) analysis.blackRating = Number(elo);
    }

    const you = analysis.username || user || null;
    if (you && analysis.opponent) {
        if (analysis.isWhite) {
            analysis.whiteUsername = analysis.whiteUsername || you;
            analysis.blackUsername = analysis.blackUsername || analysis.opponent;
        } else {
            analysis.blackUsername = analysis.blackUsername || you;
            analysis.whiteUsername = analysis.whiteUsername || analysis.opponent;
        }
    }
    if (Number.isNaN(analysis.whiteRating)) analysis.whiteRating = null;
    if (Number.isNaN(analysis.blackRating)) analysis.blackRating = null;
    return analysis;
}

function normalizeResult(game, isWhite) {
    const mine = (isWhite ? game.white.result : game.black.result) || '';
    const theirs = (isWhite ? game.black.result : game.white.result) || '';
    if (mine === 'win') return 'WIN';
    if (mine === 'lose' || theirs === 'win') return 'LOSS';
    return 'DRAW';
}

function playerEvalAt(analysis, move) {
    return analysis.isWhite ? move.eval : -move.eval;
}

function formatMoveRef(move) {
    if (!move) return '';
    return `${move.moveNum}${move.turn === 'w' ? '.' : '...'} ${move.san}`;
}

function themeHeadline(themeId, won, materialEvent) {
    const piece = materialEvent?.offered ? pieceLabel(materialEvent.offered) : null;
    const gained = materialEvent?.captured ? pieceLabel(materialEvent.captured) : null;
    const regained = (materialEvent?.regained || []).map(pieceLabel).join('/');
    const map = {
        hung_piece: won ? null : (piece ? `You hung your ${piece} at the critical moment` : 'You hung a piece at the critical moment'),
        queen_trap: won ? null : 'Your queen got trapped or hung',
        discovered_attack: won ? null : (piece ? `A discovered attack on your ${piece} cost you the game` : 'A discovered attack cost you the game'),
        discovered_attack_given: won ? (gained ? `A discovered attack on the ${gained} decided the game` : 'A discovered attack decided the game') : null,
        forked_piece: won ? 'A fork created the decisive advantage' : null,
        fork_victim: won ? null : 'You walked into a fork',
        missed_hanging: won ? null : (gained ? `You missed a hanging ${gained}` : 'You missed a hanging piece'),
        won_material: won ? (gained ? `You won the ${gained} and converted it` : 'You won material and converted it') : null,
        great_sacrifice: won
            ? (piece
                ? (regained ? `Sacrificing the ${piece} to win ${regained} decided the game` : `Sacrificing the ${piece} opened the winning attack`)
                : 'A sacrifice opened the winning attack')
            : null,
        pinned_piece: won ? 'A pin led to a decisive gain' : null,
        pin_problem: won ? null : 'A pin left you unable to hold the position',
        back_rank: won ? null : 'Back-rank weakness decided the game',
        castle_pawn_push: won ? null : 'King-side pawn pushes left you exposed',
        king_in_center: won ? null : 'An uncastled king got punished',
        claimed_center: won ? 'Central control became a lasting edge' : null,
        fianchetto: won ? 'The fianchetto bishop became a lasting asset' : null,
        traded_fianchetto: won ? null : 'Trading the fianchetto bishop left lasting weak squares',
        doubled_pawns: won ? null : 'Doubled pawns became a lasting weakness',
        isolated_pawn: won ? null : 'An isolated pawn was successfully targeted',
        bad_bishop: won ? null : 'A hemmed bad bishop never got into the game',
        castled_safe: null,
        developed_piece: null,
        quiet_improve: null
    };
    return map[themeId] || null;
}

function explainGameOutcome(analysis) {
    const moves = analysis.moves || [];
    if (!moves.length) {
        return { headline: 'No moves to review.', detail: '', keyMoveIndex: null };
    }

    const result = analysis.result;
    const won = result === 'WIN';
    const lost = result === 'LOSS';
    const draw = result === 'DRAW';

    const userMoves = [];
    for (let idx = 0; idx < moves.length; idx++) {
        const m = moves[idx];
        if (!isPlayerMove(analysis, m) || !m.classification?.label) continue;
        const prevPe = idx > 0 ? playerEvalAt(analysis, moves[idx - 1]) : 0;
        const pe = playerEvalAt(analysis, m);
        userMoves.push({
            idx,
            move: m,
            pe,
            swing: pe - prevPe,
            evalDelta: m.evalDelta == null ? 0 : m.evalDelta,
            themes: m.moveThemes || [],
            materialEvent: m.materialEvent || null,
            label: m.classification.label,
            narrative: (m.classification.desc || '').replace(/^What you did here:\s*/i, '')
        });
    }

    if (!userMoves.length) {
        return {
            headline: draw ? 'The game fizzled into a draw.' : (won ? 'You won this game.' : 'You lost this game.'),
            detail: 'Not enough labeled player moves to pinpoint a single cause.',
            keyMoveIndex: null
        };
    }

    // Biggest favorable / unfavorable eval swings on your moves
    let bestUp = userMoves[0];
    let worstDown = userMoves[0];
    let worstDelta = userMoves[0];
    for (const u of userMoves) {
        if (u.swing > bestUp.swing) bestUp = u;
        if (u.swing < worstDown.swing) worstDown = u;
        if (u.evalDelta > worstDelta.evalDelta) worstDelta = u;
    }

    // First lasting advantage / disadvantage (±1.5 pawns for 4+ plies)
    function firstLastingCross(threshold) {
        for (let i = 0; i < moves.length; i++) {
            const pe = playerEvalAt(analysis, moves[i]);
            if (threshold > 0 ? pe < threshold : pe > threshold) continue;
            let hold = 0;
            for (let j = i; j < Math.min(moves.length, i + 8); j++) {
                const pej = playerEvalAt(analysis, moves[j]);
                if (threshold > 0 ? pej >= threshold * 0.6 : pej <= threshold * 0.6) hold++;
            }
            if (hold >= 4) {
                // Prefer the nearest preceding user move as the cause
                let cause = null;
                for (let k = userMoves.length - 1; k >= 0; k--) {
                    if (userMoves[k].idx <= i) { cause = userMoves[k]; break; }
                }
                return { idx: i, cause, pe };
            }
        }
        return null;
    }

    const firstAdv = firstLastingCross(150);
    const firstDef = firstLastingCross(-150);

    // Material conversion: early material theme + still ahead late
    const endPe = playerEvalAt(analysis, moves[moves.length - 1]);
    const mid = Math.floor(moves.length / 2);
    const latePositive = endPe > 80;
    const lateNegative = endPe < -80;
    const earlyMaterialWin = userMoves.find(u =>
        u.idx < mid && u.themes.includes('won_material') && u.swing > 40
    );
    const criticalBlunder = userMoves
        .filter(u => ['Blunder', 'Mistake'].includes(u.label) || u.evalDelta >= 2.5)
        .sort((a, b) => b.evalDelta - a.evalDelta || a.swing - b.swing)[0];

    let key = null;
    let headline = '';
    let detail = '';

    if (won) {
        // Prefer a clear tactical turning point, then lasting advantage, then conversion story
        const tacticalWin = userMoves
            .filter(u => u.themes.some(t => ['forked_piece', 'discovered_attack_given', 'won_material', 'great_sacrifice', 'pinned_piece'].includes(t)) && u.swing > 60)
            .sort((a, b) => b.swing - a.swing)[0];

        if (tacticalWin) {
            key = tacticalWin;
            const theme = tacticalWin.themes.find(t => themeHeadline(t, true, tacticalWin.materialEvent)) || tacticalWin.themes[0];
            headline = themeHeadline(theme, true, tacticalWin.materialEvent) || `A strong shot on ${formatMoveRef(tacticalWin.move)} decided the game`;
            detail = `${formatMoveRef(tacticalWin.move)}: ${tacticalWin.narrative || 'You seized a concrete advantage and never gave it back.'}`;
        } else if (earlyMaterialWin && latePositive) {
            key = earlyMaterialWin;
            const gained = earlyMaterialWin.materialEvent?.captured
                ? pieceLabel(earlyMaterialWin.materialEvent.captured)
                : 'material';
            headline = `You won the ${gained} early and converted with clean trades`;
            detail = `${formatMoveRef(earlyMaterialWin.move)} gave you the first lasting edge; you simplified while keeping the advantage into the endgame.`;
        } else if (firstAdv && firstAdv.cause) {
            key = firstAdv.cause;
            headline = 'You created a lasting advantage and converted it';
            detail = `From ${formatMoveRef(firstAdv.cause.move)} the eval stayed in your favor. ${firstAdv.cause.narrative || 'Pressure and accurate follow-up finished the job.'}`;
        } else if (bestUp.swing > 80) {
            key = bestUp;
            headline = `The game swung your way around ${formatMoveRef(bestUp.move)}`;
            detail = bestUp.narrative || 'That was the biggest positive shift in your favor.';
        } else {
            headline = 'You outplayed the position without a single obvious blow';
            detail = 'Small edges added up — practical moves and fewer serious errors than your opponent.';
            key = bestUp;
        }
    } else if (lost) {
        const tacticalLoss = userMoves
            .filter(u => u.themes.some(t => ['hung_piece', 'queen_trap', 'discovered_attack', 'fork_victim', 'missed_hanging', 'pin_problem', 'back_rank', 'king_in_center'].includes(t)))
            .sort((a, b) => b.evalDelta - a.evalDelta || a.swing - b.swing)[0];

        if (criticalBlunder && criticalBlunder.evalDelta >= 2.5) {
            key = criticalBlunder;
            const theme = (criticalBlunder.themes || []).find(t => themeHeadline(t, false, criticalBlunder.materialEvent));
            headline = themeHeadline(theme, false, criticalBlunder.materialEvent) || `A heavy slip on ${formatMoveRef(criticalBlunder.move)} decided the game`;
            detail = `${formatMoveRef(criticalBlunder.move)} (${criticalBlunder.evalDelta.toFixed(1)} pawn eval loss): ${criticalBlunder.narrative || criticalBlunder.label + '.'}`;
        } else if (tacticalLoss) {
            key = tacticalLoss;
            const theme = tacticalLoss.themes.find(t => themeHeadline(t, false, tacticalLoss.materialEvent)) || tacticalLoss.themes[0];
            headline = themeHeadline(theme, false, tacticalLoss.materialEvent) || `A tactical miss on ${formatMoveRef(tacticalLoss.move)} cost the game`;
            detail = `${formatMoveRef(tacticalLoss.move)}: ${tacticalLoss.narrative || 'The position collapsed after this idea.'}`;
        } else if (firstDef && firstDef.cause) {
            key = firstDef.cause;
            headline = 'You fell into a lasting disadvantage and never recovered';
            detail = `After ${formatMoveRef(firstDef.cause.move)} the eval stayed against you. ${firstDef.cause.narrative || 'The deficit was converted in the endgame.'}`;
        } else if (worstDown.swing < -80) {
            key = worstDown;
            headline = `The decisive downturn came on ${formatMoveRef(worstDown.move)}`;
            detail = worstDown.narrative || 'That was the biggest swing against you.';
        } else {
            headline = 'You were gradually outplayed';
            detail = 'No single collapse — small concessions accumulated until the position was lost.';
            key = worstDelta;
        }
    } else {
        // Draw
        if (criticalBlunder && criticalBlunder.evalDelta >= 2.0 && criticalBlunder.pe < -50) {
            key = criticalBlunder;
            headline = 'You saved a difficult position after a serious slip';
            detail = `${formatMoveRef(criticalBlunder.move)} hurt, but the game still ended drawn.`;
        } else if (Math.abs(endPe) < 80 && bestUp.swing > 100 && worstDown.swing < -100) {
            key = bestUp.swing > Math.abs(worstDown.swing) ? bestUp : worstDown;
            headline = 'Chances for both sides; the point was split';
            detail = 'The eval swung both ways before settling into a draw.';
        } else {
            headline = 'A balanced game that ended in a draw';
            detail = latePositive || lateNegative
                ? 'One side had chances, but neither side converted.'
                : 'Neither side created a lasting, convertible edge.';
            key = null;
        }
    }

    return {
        headline,
        detail,
        keyMoveIndex: key ? key.idx : null,
        keyMoveRef: key ? formatMoveRef(key.move) : null
    };
}

function finalizeAnalysis(analysis) {
    refineMaterialWithEval(analysis);
    // Rebuild theme aggregates after material refinement
    const themeHits = {};
    const themeSet = new Set();
    for (const m of analysis.moves || []) {
        for (const id of (m.moveThemes || [])) {
            themeSet.add(id);
            themeHits[id] = (themeHits[id] || 0) + 1;
        }
    }
    analysis.moveThemes = [...themeSet];
    analysis.moveThemeCounts = themeHits;
    analysis.gameStory = explainGameOutcome(analysis);
    return analysis;
}
