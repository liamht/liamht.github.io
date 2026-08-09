/* chess/ui.js — Analyze Chess */

function log(msg, isError = false) {
    const d = document.getElementById('debug-log');
    const span = document.createElement('div');
    span.style.color = isError ? '#ff5555' : '#00ff00';
    span.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    d.appendChild(span);
    d.scrollTop = d.scrollHeight;
}

function switchLearnSection(section, el) {
    learnSection = section === 'famous' ? 'famous' : 'openings';
    learnDetail = null;
    document.querySelectorAll('.learn-subtab').forEach(t => {
        t.classList.remove('active');
        t.classList.add('p-button-outlined');
    });
    const btn = el || document.querySelector(`.learn-subtab[data-learn="${learnSection}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.classList.remove('p-button-outlined');
    }
    const search = document.getElementById('learn-search');
    if (search) {
        search.placeholder = learnSection === 'famous'
            ? 'Search famous games…'
            : 'Search openings…';
        search.value = '';
    }
    renderLearningBrowse();
}

function toggleLearnGroup(groupId) {
    if (learnOpenGroups.has(groupId)) learnOpenGroups.delete(groupId);
    else learnOpenGroups.add(groupId);
    renderLearningBrowse();
}

function renderLearningBrowse() {
    const browse = document.getElementById('learn-browse');
    const detail = document.getElementById('learn-detail');
    const groupsEl = document.getElementById('learn-groups');
    if (!browse || !groupsEl) return;

    if (learnDetail) {
        browse.style.display = 'none';
        detail.style.display = 'block';
        renderLearningDetail();
        return;
    }
    browse.style.display = 'block';
    detail.style.display = 'none';

    const q = (document.getElementById('learn-search')?.value || '').trim().toLowerCase();
    let html = '';

    if (learnSection === 'famous') {
        const groups = famousByEra();
        for (const [era, games] of groups) {
            const filtered = q
                ? games.filter(g =>
                    (g.name || '').toLowerCase().includes(q)
                    || (g.white || '').toLowerCase().includes(q)
                    || (g.black || '').toLowerCase().includes(q)
                    || (g.theme || '').toLowerCase().includes(q))
                : games;
            if (!filtered.length) continue;
            const gid = `famous:${era}`;
            const open = learnOpenGroups.has(gid) || !!q;
            const gidEnc = encodeURIComponent(gid);
            html += `
                <div class="p-card p-component learn-group${open ? ' open' : ''} mb-2">
                    <button type="button" class="p-button p-button-text p-component w-full justify-content-between" onclick="toggleLearnGroup(decodeURIComponent('${gidEnc}'))">
                        <span class="font-bold">${era}</span>
                        <span class="text-color-secondary text-sm">${filtered.length} game${filtered.length === 1 ? '' : 's'}</span>
                    </button>
                    <div class="learn-group-body px-3 pb-3">
                        ${filtered.map(g => `
                            <button type="button" class="p-button p-button-text p-component w-full text-left justify-content-start mb-1" onclick="openLearningItem('theory', decodeURIComponent('${encodeURIComponent(g.name)}'))">
                                <span>
                                    <span class="font-semibold">${g.name}</span>
                                    <span class="learn-item-meta">${g.year || '—'} · ${g.white || '?'} vs ${g.black || '?'}${g.theme ? ' · ' + g.theme : ''}</span>
                                </span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        if (!html) html = '<div class="insight-empty">No famous games match that search.</div>';
    } else {
        const families = openingsByFamily();
        let shown = 0;
        for (const [family, ops] of families) {
            const filtered = q
                ? ops.filter(o => (o.name || '').toLowerCase().includes(q) || family.toLowerCase().includes(q))
                : ops;
            if (!filtered.length) continue;
            shown++;
            // When searching, auto-expand; otherwise keep accordion state
            const gid = `opening:${family}`;
            const open = learnOpenGroups.has(gid) || !!q;
            const list = q ? filtered.slice(0, 80) : filtered.slice(0, 60);
            const more = filtered.length - list.length;
            const gidEnc = encodeURIComponent(gid);
            html += `
                <div class="p-card p-component learn-group${open ? ' open' : ''} mb-2">
                    <button type="button" class="p-button p-button-text p-component w-full justify-content-between" onclick="toggleLearnGroup(decodeURIComponent('${gidEnc}'))">
                        <span class="font-bold">${family}</span>
                        <span class="text-color-secondary text-sm">${filtered.length} line${filtered.length === 1 ? '' : 's'}</span>
                    </button>
                    <div class="learn-group-body px-3 pb-3">
                        ${list.map(o => `
                            <button type="button" class="p-button p-button-text p-component w-full text-left justify-content-start mb-1" onclick="openLearningItem('opening', decodeURIComponent('${encodeURIComponent(o.name)}'))">
                                ${o.name}
                            </button>
                        `).join('')}
                        ${more > 0 ? `<div class="insight-empty">+${more} more — refine search to narrow</div>` : ''}
                    </div>
                </div>
            `;
            if (q && shown >= 40) break;
        }
        if (!html) html = '<div class="insight-empty">No openings match that search.</div>';
    }
    groupsEl.innerHTML = html;
}

function renderLearningDetail() {
    const detail = document.getElementById('learn-detail');
    if (!detail || !learnDetail) return;

    const lesson = buildLearningLesson(learnDetail.kind, learnDetail.name);
    if (!lesson) {
        detail.innerHTML = `
            <button type="button" class="p-button p-component p-button-secondary mb-3" onclick="closeLearningDetail()">
                <span class="p-button-icon-left pi pi-arrow-left"></span>
                <span class="p-button-label">Back</span>
            </button>
            <div class="insight-empty">Could not open: ${learnDetail.name}</div>
        `;
        ChessApp.learnLesson = null;
        return;
    }

    ChessApp.learnLesson = { ...lesson, ply: 0 };
    detail.innerHTML = renderLearningLessonShell(lesson);
    updateLearningLessonView();
}

function openLearningItem(kind, name) {
    learnDetail = { kind: kind === 'theory' ? 'theory' : 'opening', name };
    learnSection = kind === 'theory' ? 'famous' : 'openings';
    document.querySelectorAll('.learn-subtab').forEach(t => {
        t.classList.remove('active');
        t.classList.add('p-button-outlined');
    });
    const btn = document.querySelector(`.learn-subtab[data-learn="${learnSection === 'famous' ? 'famous' : 'openings'}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.classList.remove('p-button-outlined');
    }
    renderLearningBrowse();
}

function closeLearningDetail() {
    learnDetail = null;
    ChessApp.learnLesson = null;
    renderLearningBrowse();
}

function openLearningFromReview(name, moveLabel) {
    if (!name) return;
    document.getElementById('review-view').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    let kind = 'opening';
    if (moveLabel === 'Theory' && findFamousByName(name)) kind = 'theory';
    else if (findFamousByName(name) && !findOpeningByName(name)) kind = 'theory';
    else if (findOpeningByName(name)) kind = 'opening';
    else if (findFamousByName(name)) kind = 'theory';

    openLearningItem(kind, name);
    switchDashTab('learning');
}

function sortAnalyzedGames(profile) {
    if (!profile?.analyzedGames) return;
    profile.analyzedGames.sort((a, b) => {
        const te = (b.endTime || 0) - (a.endTime || 0);
        if (te !== 0) return te;
        // Stable fallback: keep insertion order-ish via opponent name
        return String(b.opponent || '').localeCompare(String(a.opponent || ''));
    });
}

function gamesByRecency(profile) {
    sortAnalyzedGames(profile);
    return profile.analyzedGames;
}

function createProfileState(username) {
    return {
        username,
        games: 0,
        whiteGames: 0,
        blackGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        whiteWins: 0,
        blackWins: 0,
        openingsWhite: {},
        openingsBlack: {},
        moveLabels: {},
        playerMoves: 0,
        themeHits: {},
        analyzedGames: [],
        playerInfo: null,
        finished: false,
        analysisSnapshot: null,
        analysisSnapshotDirty: false
    };
}

function trackOpeningBucket(bucket, openingName, result) {
    const family = openingFamily(openingName);
    if (!bucket[family]) {
        bucket[family] = { count: 0, wins: 0, losses: 0, draws: 0, variations: {} };
    }
    bucket[family].count++;
    if (result === 'WIN') bucket[family].wins++;
    else if (result === 'LOSS') bucket[family].losses++;
    else bucket[family].draws++;
    const full = openingName || 'Custom Game';
    bucket[family].variations[full] = (bucket[family].variations[full] || 0) + 1;
}

// Themes that appear in almost every game — keep for move review, skip profile % noise

function rebuildProfileAggregates(profile) {
    profile.games = profile.analyzedGames.length;
    profile.whiteGames = 0;
    profile.blackGames = 0;
    profile.wins = 0;
    profile.losses = 0;
    profile.draws = 0;
    profile.whiteWins = 0;
    profile.blackWins = 0;
    profile.openingsWhite = {};
    profile.openingsBlack = {};
    profile.moveLabels = {};
    profile.playerMoves = 0;
    profile.themeHits = {};

    for (const a of profile.analyzedGames) {
        if (a.isWhite) {
            profile.whiteGames++;
            trackOpeningBucket(profile.openingsWhite, a.openingName, a.result);
            if (a.result === 'WIN') profile.whiteWins++;
        } else {
            profile.blackGames++;
            trackOpeningBucket(profile.openingsBlack, a.openingName, a.result);
            if (a.result === 'WIN') profile.blackWins++;
        }
        if (a.result === 'WIN') profile.wins++;
        else if (a.result === 'LOSS') profile.losses++;
        else profile.draws++;

        for (const m of a.moves || []) {
            if (!isPlayerMove(a, m)) continue;
            const label = m.classification?.label;
            if (!label) continue;
            profile.playerMoves++;
            profile.moveLabels[label] = (profile.moveLabels[label] || 0) + 1;
            for (const id of (m.moveThemes || [])) {
                if (PROFILE_SKIP_THEMES.has(id)) continue;
                profile.themeHits[id] = (profile.themeHits[id] || 0) + 1;
            }
        }
    }
}

function ingestAnalysis(profile, analysis, gameKey) {
    analysis.gameKey = gameKey || analysis.gameKey || null;
    if (!analysis.qualityScore && analysis.qualityScore !== 0) {
        analysis.qualityScore = gameQualityScore(analysis);
    }
    const existingIdx = profile.analyzedGames.findIndex(g => g.gameKey && g.gameKey === analysis.gameKey);
    if (existingIdx >= 0) profile.analyzedGames[existingIdx] = analysis;
    else profile.analyzedGames.push(analysis);
    sortAnalyzedGames(profile);
    rebuildProfileAggregates(profile);
    profile.analysisSnapshotDirty = true;
}

function gameQualityScore(analysis) {
    const weights = {
        Best: 5, Good: 4, Okay: 3, Book: 3.5, Theory: 3.5,
        Miss: 1.5, Mistake: 0.5, Blunder: 0
    };
    const moves = (analysis.moves || []).filter(m =>
        m.classification?.label && isPlayerMove(analysis, m)
    );
    if (!moves.length) return 0;
    let sum = 0;
    for (const m of moves) sum += weights[m.classification.label] ?? 2;
    return sum / moves.length;
}

/** Per-move accuracy 0–100 from win-prob loss / CPL / classification. Book/Theory excluded upstream. */
function moveAccuracyScore(move) {
    const label = move?.classification?.label;
    if (!label || label === 'Book' || label === 'Theory') return null;
    // Prefer expected-points loss when present (aligned with new severity model)
    if (move.winLoss != null && Number.isFinite(move.winLoss)) {
        // 0→100, 0.05→~78, 0.12→~55, 0.25→~30, 0.4→~15
        return Math.max(0, Math.min(100, 100 * Math.exp(-6.2 * Math.max(0, move.winLoss))));
    }
    if (move.evalDeltaCp != null && Number.isFinite(move.evalDeltaCp)) {
        const pawns = Math.max(0, move.evalDeltaCp) / 100;
        return Math.max(0, Math.min(100, 100 * Math.exp(-0.55 * pawns)));
    }
    const byLabel = {
        Best: 100, Good: 78, Okay: 52, Miss: 22, Mistake: 8, Blunder: 0
    };
    return byLabel[label] ?? 45;
}

function sideMoveStats(analysis, forPlayer) {
    const moves = (analysis.moves || []).filter(m =>
        m.classification?.label && (forPlayer ? isPlayerMove(analysis, m) : !isPlayerMove(analysis, m))
    );
    const counts = {};
    for (const q of MOVE_QUALITY_ORDER) counts[q.label] = 0;
    let accSum = 0;
    let ratedN = 0;
    for (const m of moves) {
        const label = m.classification.label;
        if (counts[label] != null) counts[label] += 1;
        else counts[label] = (counts[label] || 0) + 1;
        const score = moveAccuracyScore(m);
        if (score == null) continue;
        accSum += score;
        ratedN += 1;
    }
    const accuracy = ratedN ? Math.round((accSum / ratedN) * 10) / 10 : null;
    let cplSum = 0;
    let cplN = 0;
    for (const m of moves) {
        if (m.evalDeltaCp == null || !Number.isFinite(m.evalDeltaCp)) continue;
        if (m.classification?.label === 'Book' || m.classification?.label === 'Theory') continue;
        cplSum += m.evalDeltaCp;
        cplN += 1;
    }
    const avgCpl = cplN ? Math.round(cplSum / cplN) : null;
    return {
        moves,
        counts,
        total: moves.length,
        ratedN,
        accuracy,
        avgCpl,
        cplN,
        gameElo: estimateGameElo(accuracy, counts, ratedN)
    };
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Largest drop (cp) from a running peak of player-centric eval within a game. */
function maxEvalSwingCp(analysis) {
    const curve = classifyEvalCurve(analysis);
    return curve ? curve.maxDrop : null;
}

function fenBeforeMove(analysis, moveIndex) {
    if (moveIndex <= 0) return START_FEN;
    return analysis?.moves?.[moveIndex - 1]?.fen || null;
}

function moveUci(m) {
    if (!m?.from || !m?.to) return null;
    const promoMatch = String(m.san || '').match(/=([NBRQ])/i);
    const promo = promoMatch ? promoMatch[1].toLowerCase() : '';
    return m.from + m.to + promo;
}

/** Whether the engine's best UCI is a capture and/or delivers check from fenBefore. */
function classifyBestEngineMove(fenBefore, bestUci) {
    if (!fenBefore || !bestUci || bestUci.length < 4 || typeof Chess === 'undefined') {
        return { capture: false, check: false, ok: false };
    }
    try {
        const c = new Chess(fenBefore);
        const from = bestUci.slice(0, 2);
        const to = bestUci.slice(2, 4);
        const promo = bestUci.length > 4 ? bestUci[4] : undefined;
        const target = c.get(to);
        const captureHint = !!(target && target.color !== c.turn());
        const moved = c.move({ from, to, promotion: promo || 'q' });
        if (!moved) return { capture: captureHint, check: false, ok: false };
        return {
            capture: !!(moved.captured || captureHint),
            check: !!(typeof c.in_check === 'function' ? c.in_check() : c.inCheck?.()),
            ok: true
        };
    } catch (_) {
        return { capture: false, check: false, ok: false };
    }
}

function classifyEvalCurve(analysis) {
    const moves = analysis?.moves || [];
    if (!moves.length || typeof playerEvalAt !== 'function') return null;
    let peak = null;
    let trough = null;
    let maxDrop = 0;
    let maxRise = 0;
    let wasWorseThan = false; // pe <= -150 at some point
    let recovered = false;
    let endPe = null;
    for (const m of moves) {
        if (m.eval == null || !Number.isFinite(m.eval)) continue;
        const pe = playerEvalAt(analysis, m);
        endPe = pe;
        if (peak == null || pe > peak) peak = pe;
        if (trough == null || pe < trough) trough = pe;
        if (peak != null) maxDrop = Math.max(maxDrop, peak - pe);
        if (trough != null) maxRise = Math.max(maxRise, pe - trough);
        if (pe <= -150) wasWorseThan = true;
        if (wasWorseThan && pe >= 50) recovered = true;
    }
    if (peak == null) return null;
    const collapse = maxDrop >= 200 && (analysis.result === 'LOSS' || (endPe != null && endPe <= -100));
    const comeback = (recovered || (wasWorseThan && analysis.result === 'WIN')) && maxRise >= 150;
    return {
        maxDrop: Math.round(maxDrop),
        maxRise: Math.round(maxRise),
        collapse,
        comeback,
        endPe: endPe != null ? Math.round(endPe) : null
    };
}

function qualityBucket(score) {
    if (score == null || !Number.isFinite(score)) return null;
    if (score >= 4.2) return 'excellent';
    if (score >= 3.5) return 'solid';
    if (score >= 2.5) return 'mixed';
    return 'rough';
}

const QUALITY_BUCKET_LABELS = {
    excellent: 'Excellent (≥4.2)',
    solid: 'Solid (3.5–4.2)',
    mixed: 'Mixed (2.5–3.5)',
    rough: 'Rough (<2.5)'
};

function ratingGapBand(delta) {
    if (delta <= -150) return 'underdog';
    if (delta >= 150) return 'favorite';
    return 'even';
}

const GAP_BAND_LABELS = {
    underdog: 'Underdog (−150+)',
    even: 'Even (±149)',
    favorite: 'Favorite (+150+)'
};

function emptyWldAcc() {
    return { games: 0, wins: 0, losses: 0, draws: 0, accSum: 0, accN: 0, cplSum: 0, cplN: 0 };
}

function bumpWldAcc(bucket, result, accuracy, avgCpl, cplMoves) {
    bucket.games += 1;
    if (result === 'WIN') bucket.wins += 1;
    else if (result === 'LOSS') bucket.losses += 1;
    else bucket.draws += 1;
    if (accuracy != null) {
        bucket.accSum += accuracy;
        bucket.accN += 1;
    }
    if (avgCpl != null && cplMoves) {
        bucket.cplSum += avgCpl * cplMoves;
        bucket.cplN += cplMoves;
    }
}

function finalizeWldAcc(bucket) {
    return {
        games: bucket.games,
        wins: bucket.wins,
        losses: bucket.losses,
        draws: bucket.draws,
        wr: bucket.games ? Math.round((bucket.wins / bucket.games) * 1000) / 10 : null,
        avgAccuracy: bucket.accN ? Math.round((bucket.accSum / bucket.accN) * 10) / 10 : null,
        avgCpl: bucket.cplN ? Math.round(bucket.cplSum / bucket.cplN) : null
    };
}

function pushExample(store, key, example, score) {
    if (!store[key] || score > (store[key]._score || 0)) {
        store[key] = { ...example, _score: score };
    }
}

/** How the game ended, from your seat (wins use opponent's terminal result). */
function finishReasonCode(analysis) {
    if (!analysis) return 'unknown';
    if (analysis.result === 'WIN') {
        const opp = analysis.oppResultDetail || '';
        if (opp && opp !== 'lose') return opp;
        return analysis.resultDetail === 'win' ? 'win' : (analysis.resultDetail || 'win');
    }
    return analysis.resultDetail || (analysis.result === 'DRAW' ? 'agreed' : 'unknown');
}

function finishReasonGroup(code) {
    const c = String(code || '').toLowerCase();
    if (c === 'checkmated') return 'mate';
    if (c === 'resigned' || c === 'abandoned') return 'resign';
    if (c === 'timeout' || c === 'timevsinsufficient') return 'timeout';
    if (c === 'stalemate' || c === 'agreed' || c === 'repetition' || c === 'insufficient' || c === '50move') {
        return 'draw';
    }
    if (c === 'win') return 'win';
    return 'other';
}

const FINISH_GROUP_LABELS = {
    mate: 'Checkmate',
    resign: 'Resignation',
    timeout: 'Timeout',
    draw: 'Drawn finish',
    win: 'Won (detail missing)',
    other: 'Other'
};

/**
 * Profile-level form stats for Overview + Insights: accuracy, CPL by phase,
 * swings/comebacks, finishes, themes, material rates, engine misses, gap bands,
 * time-class splits, opponent punish/outplay, quality distribution/streaks.
 */
function computeProfileAnalytics(profile) {
    const games = [...(profile?.analyzedGames || [])].sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
    const n = games.length;
    const accuracySeries = [];
    const gameEloSeries = [];
    let accSum = 0;
    let accN = 0;
    let cplSum = 0;
    let cplN = 0;
    let gameCplSum = 0;
    let gameCplN = 0;
    const phaseCpl = {
        opening: { sum: 0, n: 0 },
        middlegame: { sum: 0, n: 0 },
        endgame: { sum: 0, n: 0 }
    };
    let swingSum = 0;
    let swingN = 0;
    let collapses = 0;
    let comebacks = 0;
    let oppAccSum = 0;
    let oppAccN = 0;
    let ratingGapSum = 0;
    let ratingGapN = 0;
    const finishes = { WIN: {}, LOSS: {}, DRAW: {} };
    const finishGroups = { WIN: {}, LOSS: {}, DRAW: {} };
    const themeGameHits = {};
    const themeExamples = {};
    const timeClassCounts = {};
    const timeClassStats = {};
    const gapBands = {
        underdog: emptyWldAcc(),
        even: emptyWldAcc(),
        favorite: emptyWldAcc()
    };
    const qualityDist = { excellent: 0, solid: 0, mixed: 0, rough: 0 };
    const qualitySeries = [];
    let qualitySum = 0;
    let qualityN = 0;

    const material = {
        hang: 0, sacrifice: 0, missed_capture: 0, capture: 0, exchange: 0
    };
    const materialGames = {
        hang: 0, sacrifice: 0, missed_capture: 0, capture: 0, exchange: 0
    };
    const materialExamples = {};

    let engineMissChances = 0;
    let engineMissCapture = 0;
    let engineMissCheck = 0;
    const engineMissExamples = {};
    let altGames = 0;
    let altChances = 0;
    let altTop2Hits = 0;

    let oppBlunders = 0;
    let punishedOpp = 0;
    let yourBlunders = 0;
    let oppPunishedYou = 0;
    const punishExamples = {};
    const outplayExamples = {};

    let earlyResignLosses = 0;
    let matedLosses = 0;
    let resignLosses = 0;

    const KING_SAFETY_THEMES = ['king_in_center', 'castle_pawn_push', 'back_rank', 'traded_fianchetto'];

    for (const g of games) {
        if (typeof attachGameMeta === 'function') attachGameMeta(g, null);
        if (typeof assignMovePhases === 'function') assignMovePhases(g);

        const tc = g.timeClass || 'unknown';
        timeClassCounts[tc] = (timeClassCounts[tc] || 0) + 1;
        if (!timeClassStats[tc]) timeClassStats[tc] = emptyWldAcc();

        const you = sideMoveStats(g, true);
        const opp = sideMoveStats(g, false);
        const qScore = g.qualityScore ?? (typeof gameQualityScore === 'function' ? gameQualityScore(g) : null);
        const myElo = playerGameElo(g);
        const oppEloRaw = g.isWhite ? g.blackRating : g.whiteRating;
        const oppElo = oppEloRaw != null && !Number.isNaN(Number(oppEloRaw)) ? Number(oppEloRaw) : null;
        const gap = myElo != null && oppElo != null ? myElo - oppElo : null;

        if (you.accuracy != null) {
            accuracySeries.push({
                t: g.endTime || 0,
                accuracy: you.accuracy,
                gameKey: g.gameKey || null,
                result: g.result || '',
                avgCpl: you.avgCpl,
                gameElo: you.gameElo,
                chessComElo: myElo,
                qualityScore: qScore
            });
            accSum += you.accuracy;
            accN += 1;
        }
        if (you.gameElo != null && (g.endTime || myElo != null)) {
            gameEloSeries.push({
                t: g.endTime || 0,
                gameElo: you.gameElo,
                chessComElo: myElo,
                gameKey: g.gameKey || null,
                result: g.result || ''
            });
        }
        if (you.avgCpl != null && you.cplN) {
            cplSum += you.avgCpl * you.cplN;
            cplN += you.cplN;
            gameCplSum += you.avgCpl;
            gameCplN += 1;
        }
        const curve = classifyEvalCurve(g);
        if (curve) {
            swingSum += curve.maxDrop;
            swingN += 1;
            if (curve.collapse) collapses += 1;
            if (curve.comeback) comebacks += 1;
        }
        if (opp.accuracy != null) {
            oppAccSum += opp.accuracy;
            oppAccN += 1;
        }
        if (gap != null) {
            ratingGapSum += gap;
            ratingGapN += 1;
            bumpWldAcc(gapBands[ratingGapBand(gap)], g.result || 'DRAW', you.accuracy, you.avgCpl, you.cplN);
        }
        bumpWldAcc(timeClassStats[tc], g.result || 'DRAW', you.accuracy, you.avgCpl, you.cplN);

        if (qScore != null) {
            qualitySum += qScore;
            qualityN += 1;
            const qb = qualityBucket(qScore);
            if (qb) qualityDist[qb] += 1;
            qualitySeries.push({
                t: g.endTime || 0,
                score: qScore,
                bucket: qb,
                gameKey: g.gameKey || null,
                result: g.result || ''
            });
        }

        const result = g.result || 'DRAW';
        const code = finishReasonCode(g);
        const group = finishReasonGroup(code);
        if (!finishes[result]) finishes[result] = {};
        if (!finishGroups[result]) finishGroups[result] = {};
        finishes[result][code] = (finishes[result][code] || 0) + 1;
        finishGroups[result][group] = (finishGroups[result][group] || 0) + 1;

        if (result === 'LOSS') {
            if (group === 'mate') matedLosses += 1;
            if (group === 'resign') {
                resignLosses += 1;
                const endPe = curve?.endPe;
                // Resigned while not fully dead → early/soft resign signal
                if (endPe != null && endPe > -400) earlyResignLosses += 1;
            }
        }

        const phases = g.movePhases || [];
        const seenThemes = new Set();
        const seenMaterial = new Set();
        let gameHasAlts = false;

        for (let i = 0; i < (g.moves || []).length; i++) {
            const m = g.moves[i];
            const label = m.classification?.label;
            const isYou = isPlayerMove(g, m);

            if (isYou && label && label !== 'Book' && label !== 'Theory') {
                const phase = phases[i] || 'middlegame';
                if (phaseCpl[phase] && m.evalDeltaCp != null && Number.isFinite(m.evalDeltaCp)) {
                    phaseCpl[phase].sum += m.evalDeltaCp;
                    phaseCpl[phase].n += 1;
                }
            }

            // Opponent blunder → did you answer well on the next player move?
            if (!isYou && (label === 'Blunder' || label === 'Mistake')) {
                oppBlunders += 1;
                let nextYou = null;
                let nextIdx = -1;
                for (let j = i + 1; j < g.moves.length; j++) {
                    if (isPlayerMove(g, g.moves[j])) {
                        nextYou = g.moves[j];
                        nextIdx = j;
                        break;
                    }
                }
                if (nextYou && ['Best', 'Good'].includes(nextYou.classification?.label)) {
                    punishedOpp += 1;
                    pushExample(punishExamples, 'punish', {
                        gameKey: g.gameKey, moveIndex: nextIdx, san: nextYou.san,
                        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(nextYou) : nextYou.san,
                        opponent: g.opponent || 'opponent', result: g.result || '',
                        label: nextYou.classification?.label || ''
                    }, 2 + (nextYou.evalDelta || 0));
                }
            }

            if (isYou && (label === 'Blunder' || label === 'Mistake')) {
                yourBlunders += 1;
                let nextOpp = null;
                let nextIdx = -1;
                for (let j = i + 1; j < g.moves.length; j++) {
                    if (!isPlayerMove(g, g.moves[j])) {
                        nextOpp = g.moves[j];
                        nextIdx = j;
                        break;
                    }
                }
                if (nextOpp && ['Best', 'Good'].includes(nextOpp.classification?.label)) {
                    oppPunishedYou += 1;
                    pushExample(outplayExamples, 'outplay', {
                        gameKey: g.gameKey, moveIndex: i, san: m.san,
                        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : m.san,
                        opponent: g.opponent || 'opponent', result: g.result || '',
                        label: m.classification?.label || ''
                    }, 2 + (m.evalDelta || 0));
                }
            }

            if (!isYou) continue;

            const ev = m.materialEvent;
            if (ev?.kind && material[ev.kind] != null) {
                material[ev.kind] += 1;
                if (!seenMaterial.has(ev.kind)) {
                    seenMaterial.add(ev.kind);
                    materialGames[ev.kind] += 1;
                }
                pushExample(materialExamples, ev.kind, {
                    gameKey: g.gameKey, moveIndex: i, san: m.san,
                    moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : m.san,
                    opponent: g.opponent || 'opponent', result: g.result || '',
                    label: label || ''
                }, (label === 'Blunder' ? 3 : label === 'Mistake' ? 2 : 1) + (m.evalDelta || 0));
            }

            for (const id of (m.moveThemes || [])) {
                if (!THEME_CATALOG[id]) continue;
                if (!seenThemes.has(id)) {
                    seenThemes.add(id);
                    themeGameHits[id] = (themeGameHits[id] || 0) + 1;
                }
                if (!themeExamples[id] || (m.evalDelta || 0) > (themeExamples[id].evalDelta || 0)) {
                    themeExamples[id] = {
                        gameKey: g.gameKey || null,
                        moveIndex: i,
                        san: m.san || '',
                        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : m.san,
                        opponent: g.opponent || 'opponent',
                        result: g.result || '',
                        label: label || '',
                        evalDelta: m.evalDelta || 0
                    };
                }
            }

            const alts = m.altEngineMoves || [];
            if (alts.length) gameHasAlts = true;

            if (!label || label === 'Book' || label === 'Theory') continue;
            const best = m.bestEngineMove;
            if (!best || best.length < 4) continue;
            const played = moveUci(m);
            const matchedBest = played && played === best;
            if (alts.length && !matchedBest) {
                altChances += 1;
                const hitAlt = alts.some(a => a.move && played && a.move === played);
                if (hitAlt) altTop2Hits += 1;
            }
            if (matchedBest || ['Best', 'Good'].includes(label)) continue;

            const fen = fenBeforeMove(g, i);
            const kind = classifyBestEngineMove(fen, best);
            if (!kind.ok) continue;
            if (kind.capture || kind.check) {
                engineMissChances += 1;
                if (kind.capture) {
                    engineMissCapture += 1;
                    pushExample(engineMissExamples, 'capture', {
                        gameKey: g.gameKey, moveIndex: i, san: m.san,
                        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : m.san,
                        opponent: g.opponent || 'opponent', result: g.result || '',
                        label: label || '', best
                    }, (m.evalDelta || 0) + (label === 'Blunder' ? 2 : 0));
                }
                if (kind.check) {
                    engineMissCheck += 1;
                    pushExample(engineMissExamples, 'check', {
                        gameKey: g.gameKey, moveIndex: i, san: m.san,
                        moveRef: typeof formatMoveRef === 'function' ? formatMoveRef(m) : m.san,
                        opponent: g.opponent || 'opponent', result: g.result || '',
                        label: label || '', best
                    }, (m.evalDelta || 0) + 1);
                }
            }
        }
        if (gameHasAlts) altGames += 1;
    }

    // Quality form streak (chronological): consecutive games at/above solid (≥3.5)
    let formStreak = 0;
    let formStreakKind = null; // 'hot' | 'cold'
    if (qualitySeries.length) {
        const last = qualitySeries[qualitySeries.length - 1];
        const hot = (last.score || 0) >= 3.5;
        formStreakKind = hot ? 'hot' : 'cold';
        for (let i = qualitySeries.length - 1; i >= 0; i--) {
            const ok = (qualitySeries[i].score || 0) >= 3.5;
            if (ok === hot) formStreak += 1;
            else break;
        }
    }

    const themeCards = Object.keys(THEME_CATALOG)
        .map(id => {
            const hits = themeGameHits[id] || 0;
            if (!hits || !n) return null;
            const pctVal = Math.round((hits / n) * 1000) / 10;
            const cat = THEME_CATALOG[id];
            return {
                id,
                hits,
                pct: pctVal,
                polarity: cat.polarity,
                skipped: PROFILE_SKIP_THEMES.has(id),
                kingSafety: KING_SAFETY_THEMES.includes(id),
                text: typeof cat.text === 'function' ? cat.text(pctVal) : cat.detail,
                detail: cat.detail,
                evidence: themeExamples[id] || null
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.pct - a.pct || b.hits - a.hits);

    const firstAcc = accuracySeries.length ? accuracySeries[0].accuracy : null;
    const lastAcc = accuracySeries.length ? accuracySeries[accuracySeries.length - 1].accuracy : null;

    const materialCards = ['hang', 'missed_capture', 'sacrifice', 'capture']
        .filter(k => material[k] > 0)
        .map(k => {
            const labels = {
                hang: 'Hangs',
                missed_capture: 'Missed captures',
                sacrifice: 'Sacrifices',
                capture: 'Winning captures'
            };
            const polarity = (k === 'hang' || k === 'missed_capture') ? 'bad' : 'good';
            const gHits = materialGames[k] || 0;
            return {
                kind: k,
                label: labels[k],
                events: material[k],
                games: gHits,
                pctGames: n ? Math.round((gHits / n) * 1000) / 10 : 0,
                polarity,
                evidence: materialExamples[k] || null
            };
        });

    const stripScore = (ex) => {
        if (!ex) return null;
        const { _score, ...rest } = ex;
        return rest;
    };

    return {
        gameCount: n,
        avgAccuracy: accN ? Math.round((accSum / accN) * 10) / 10 : null,
        accuracySeries,
        gameEloSeries,
        accuracyDelta: firstAcc != null && lastAcc != null
            ? Math.round((lastAcc - firstAcc) * 10) / 10
            : null,
        avgGameElo: gameEloSeries.length
            ? Math.round(gameEloSeries.reduce((s, p) => s + p.gameElo, 0) / gameEloSeries.length)
            : null,
        avgCpl: cplN ? Math.round(cplSum / cplN) : null,
        avgGameCpl: gameCplN ? Math.round(gameCplSum / gameCplN) : null,
        cplMoves: cplN,
        phaseCpl: {
            opening: phaseCpl.opening.n ? Math.round(phaseCpl.opening.sum / phaseCpl.opening.n) : null,
            middlegame: phaseCpl.middlegame.n ? Math.round(phaseCpl.middlegame.sum / phaseCpl.middlegame.n) : null,
            endgame: phaseCpl.endgame.n ? Math.round(phaseCpl.endgame.sum / phaseCpl.endgame.n) : null,
            counts: {
                opening: phaseCpl.opening.n,
                middlegame: phaseCpl.middlegame.n,
                endgame: phaseCpl.endgame.n
            }
        },
        avgSwingCp: swingN ? Math.round(swingSum / swingN) : null,
        swingGames: swingN,
        collapses,
        comebacks,
        avgOppAccuracy: oppAccN ? Math.round((oppAccSum / oppAccN) * 10) / 10 : null,
        avgRatingGap: ratingGapN ? Math.round(ratingGapSum / ratingGapN) : null,
        ratingGapN,
        gapBands: {
            underdog: finalizeWldAcc(gapBands.underdog),
            even: finalizeWldAcc(gapBands.even),
            favorite: finalizeWldAcc(gapBands.favorite)
        },
        avgQuality: qualityN ? Math.round((qualitySum / qualityN) * 100) / 100 : null,
        qualityDist,
        qualitySeries,
        formStreak,
        formStreakKind,
        finishes,
        finishGroups,
        earlyResignLosses,
        matedLosses,
        resignLosses,
        themeCards,
        kingSafety: themeCards.filter(c => c.kingSafety),
        timeClassCounts,
        timeClassStats: Object.fromEntries(
            Object.entries(timeClassStats).map(([k, v]) => [k, finalizeWldAcc(v)])
        ),
        materialCards,
        engineMisses: {
            chances: engineMissChances,
            capture: engineMissCapture,
            check: engineMissCheck,
            capturePct: engineMissChances
                ? Math.round((engineMissCapture / Math.max(engineMissChances, 1)) * 1000) / 10
                : null,
            examples: {
                capture: stripScore(engineMissExamples.capture),
                check: stripScore(engineMissExamples.check)
            }
        },
        altEngine: {
            games: altGames,
            chances: altChances,
            top2Hits: altTop2Hits,
            top2Rate: altChances ? Math.round((altTop2Hits / altChances) * 1000) / 10 : null
        },
        opponentDynamics: {
            oppBlunders,
            punishedOpp,
            punishRate: oppBlunders ? Math.round((punishedOpp / oppBlunders) * 1000) / 10 : null,
            yourBlunders,
            oppPunishedYou,
            outplayRate: yourBlunders ? Math.round((oppPunishedYou / yourBlunders) * 1000) / 10 : null,
            punishEvidence: stripScore(punishExamples.punish),
            outplayEvidence: stripScore(outplayExamples.outplay)
        }
    };
}

/**
 * Rough single-game performance rating from accuracy.
 * High accuracy soft-caps at IM (2400) and hard-caps at GM (2500).
 */
function estimateGameElo(accuracy, counts, ratedN) {
    if (accuracy == null || !Number.isFinite(accuracy) || !ratedN) return null;
    const a = Math.max(0, Math.min(100, accuracy)) / 100;
    // Club → master curve; soft-caps above IM. ~70%→~550, 90%→~1550, 97%→~2200, 100%→~2450 raw
    let elo = 80 + 2380 * Math.pow(a, 4.6);

    const best = counts.Best || 0;
    const blunders = counts.Blunder || 0;
    const mistakes = counts.Mistake || 0;
    const misses = counts.Miss || 0;
    const bestRate = best / ratedN;
    const badWeight = (blunders * 1.6 + mistakes + misses * 0.45) / ratedN;

    elo += (bestRate - 0.55) * 260;
    elo -= badWeight * 850;
    // Extra hit when multiple blunders appear in a short game
    if (blunders >= 2) elo -= 60 + (blunders - 2) * 35;

    const im = typeof GAME_ELO_IM === 'number' ? GAME_ELO_IM : 2400;
    const gm = typeof GAME_ELO_GM === 'number' ? GAME_ELO_GM : 2500;
    // Compress anything above IM toward GM so near-perfect games read as titles, not 2700+
    if (elo > im) {
        const over = elo - im;
        elo = im + (gm - im) * (1 - Math.exp(-over / 140));
    }
    return Math.round(Math.max(200, Math.min(gm, elo)));
}

/** Display helper: show IM / GM when Game ELO sits in title territory. */
function formatGameEloLabel(elo, { withNumber = true } = {}) {
    if (elo == null || !Number.isFinite(elo)) return '—';
    const im = typeof GAME_ELO_IM === 'number' ? GAME_ELO_IM : 2400;
    const gm = typeof GAME_ELO_GM === 'number' ? GAME_ELO_GM : 2500;
    let title = null;
    if (elo >= gm - 20) title = 'GM';
    else if (elo >= im) title = 'IM';
    if (!title) return String(elo);
    return withNumber ? `${title} (${elo})` : title;
}

function pct(n, d) {
    if (!d) return 0;
    return Math.round((n / d) * 1000) / 10;
}

function resultColor(result) {
    return result === 'WIN' ? 'var(--success)'
        : result === 'DRAW' ? 'var(--warning)' : 'var(--accent)';
}

function chessComResultLabel(code) {
    const map = {
        win: 'Won',
        checkmated: 'Checkmated',
        timeout: 'Timeout',
        resigned: 'Resigned',
        abandoned: 'Abandoned',
        stalemate: 'Stalemate',
        agreed: 'Draw agreed',
        repetition: 'Repetition',
        insufficient: 'Insufficient material',
        '50move': '50-move rule',
        timevsinsufficient: 'Timeout vs insufficient',
        lose: 'Lost'
    };
    return map[code] || (code ? String(code) : 'Unknown');
}

function outcomeReason(analysis) {
    if (analysis.gameStory?.headline) return analysis.gameStory.headline;
    if (analysis.resultDetail) return chessComResultLabel(analysis.resultDetail);
    return analysis.result || '—';
}

function formatPlayerWithElo(name, rating) {
    const n = name || '?';
    return rating != null && rating !== '' && !Number.isNaN(Number(rating))
        ? `${n} (${Number(rating)})`
        : n;
}

/** Always white first: "liamht (1946) vs Opp (2000)". */
function gameMatchupTitle(analysis) {
    if (!analysis) return 'Unknown game';
    if (typeof attachGamePlayers === 'function') {
        attachGamePlayers(analysis, analysis.game || null, analysis.username || profileState?.username);
    }
    const white = analysis.whiteUsername
        || (analysis.isWhite ? (analysis.username || profileState?.username) : analysis.opponent)
        || 'White';
    const black = analysis.blackUsername
        || (!analysis.isWhite ? (analysis.username || profileState?.username) : analysis.opponent)
        || 'Black';
    return `${formatPlayerWithElo(white, analysis.whiteRating)} vs ${formatPlayerWithElo(black, analysis.blackRating)}`;
}

function focusUsernameInput() {
    const el = document.getElementById('username');
    if (!el) return;
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function tabEmptyHtml({ icon, title, body }) {
    return `
        <div class="tab-empty-icon"><i class="pi ${icon}"></i></div>
        <div class="tab-empty-title">${title}</div>
        <div class="tab-empty-body">${body}</div>
        <div class="tab-empty-actions flex flex-wrap gap-2">
            <button type="button" class="p-button p-component" onclick="focusUsernameInput()">
                <span class="p-button-icon-left pi pi-user"></span>
                <span class="p-button-label">Enter username</span>
            </button>
            <button type="button" class="p-button p-component p-button-outlined" onclick="switchDashTab('learning')">
                <span class="p-button-icon-left pi pi-book"></span>
                <span class="p-button-label">Browse Learn</span>
            </button>
        </div>
    `;
}

function showTabEmpty(prefix, opts) {
    const empty = document.getElementById(`${prefix}-empty`);
    const content = document.getElementById(`${prefix}-content`);
    if (empty) {
        empty.innerHTML = tabEmptyHtml(opts);
        empty.classList.add('is-visible');
    }
    if (content) content.style.display = 'none';
}

function showTabContent(prefix) {
    const empty = document.getElementById(`${prefix}-empty`);
    const content = document.getElementById(`${prefix}-content`);
    if (empty) empty.classList.remove('is-visible');
    if (content) content.style.display = '';
}

function hasAnalyzedGames(profile = profileState) {
    return !!(profile && profile.games > 0);
}

/** Top-level app views (Analyze workspace vs About). Extensible for future nav items. */
function switchAppView(view) {
    const name = (view === 'faq' || view === 'console') ? 'about' : (view || 'analyze');
    const analyze = document.getElementById('analyze-view');
    const about = document.getElementById('about-view');
    document.querySelectorAll('.app-topnav-link').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === name);
    });
    if (name === 'about') {
        if (typeof currentReviewGame !== 'undefined' && currentReviewGame && typeof exitReview === 'function') {
            exitReview();
        }
        if (analyze) analyze.style.display = 'none';
        if (about) about.style.display = 'block';
        renderFaqTab();
        return;
    }
    if (about) about.style.display = 'none';
    if (analyze) analyze.style.display = 'block';
}

function switchDashTab(name, el) {
    // Legacy: FAQ / About used to live inside dash tabs
    if (name === 'faq' || name === 'console' || name === 'about') {
        switchAppView('about');
        return;
    }
    // Legacy Insights tab → Coaching (advice) or Stats (numbers)
    if (name === 'analysis' || name === 'insights') name = 'coaching';
    switchAppView('analyze');
    document.querySelectorAll('#dash-tabs .p-tabview-nav > li').forEach(li => li.classList.remove('p-highlight'));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    const link = el?.classList?.contains('p-tabview-nav-link')
        ? el
        : document.querySelector(`#dash-tabs .p-tabview-nav-link[data-tab="${name}"]`);
    if (link) link.closest('li')?.classList.add('p-highlight');
    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');
    if (name === 'learning') renderLearningBrowse();
    if (name === 'coaching') renderCoachingTab(profileState);
    if (name === 'stats') renderStatsTab(profileState);
    if (name === 'matches') renderMatchesTab();
    if (name === 'overview') renderOverviewTab(profileState);
}

async function fetchPlayerProfile(username) {
    const base = `https://api.chess.com/pub/player/${username.toLowerCase()}`;
    const [playerRes, statsRes] = await Promise.all([
        fetch(base),
        fetch(base + '/stats')
    ]);
    if (!playerRes.ok) throw new Error('Player not found');
    const player = await playerRes.json();
    let stats = {};
    try { stats = statsRes.ok ? await statsRes.json() : {}; } catch (_) {}

    const ratings = [];
    for (const [key, label] of [
        ['chess_rapid', 'Rapid'],
        ['chess_blitz', 'Blitz'],
        ['chess_bullet', 'Bullet'],
        ['chess_daily', 'Daily']
    ]) {
        const r = stats[key]?.last?.rating;
        if (r) ratings.push({ label, rating: r });
    }
    return {
        username: player.username || username,
        name: player.name || null,
        avatar: player.avatar || '',
        url: player.url || '',
        ratings
    };
}

function renderProfileHeader(profile) {
    const info = profile.playerInfo;
    const display = info?.name
        ? `${info.name} (@${info.username || profile.username})`
        : (info?.username || profile.username);
    document.getElementById('profile-display-name').innerText = display;

    const avatar = document.getElementById('profile-avatar');
    if (info?.avatar) {
        avatar.src = info.avatar;
        avatar.style.display = 'block';
    } else {
        avatar.removeAttribute('src');
        avatar.style.display = 'none';
    }

    document.getElementById('profile-header-sub').innerText = profile.finished
        ? `Based on ${profile.games} analyzed games (${profile.whiteGames} white · ${profile.blackGames} black)`
        : `Live · ${profile.games} game${profile.games === 1 ? '' : 's'} analyzed so far`;

    const wld = profile.games
        ? `${pct(profile.wins, profile.games)}% / ${pct(profile.losses, profile.games)}% / ${pct(profile.draws, profile.games)}%`
        : '—';
    const whiteWin = profile.whiteGames ? `${pct(profile.whiteWins, profile.whiteGames)}%` : '—';
    const blackWin = profile.blackGames ? `${pct(profile.blackWins, profile.blackGames)}%` : '—';
    const eloBits = (info?.ratings || []).map(r =>
        `<span class="p-tag p-component"><span class="font-bold">${r.rating}</span>&nbsp;${r.label}</span>`
    ).join('');

    document.getElementById('profile-stat-row').innerHTML = `
        <span class="p-tag p-component p-tag-info">W/L/D ${wld}</span>
        <span class="p-tag p-component">White win ${whiteWin}</span>
        <span class="p-tag p-component">Black win ${blackWin}</span>
        ${eloBits || '<span class="p-tag p-component">ELO —</span>'}
    `;
}

function qualityRowsHtml(profile) {
    const total = profile.playerMoves || 0;
    if (!total) {
        return `<div class="insight-empty">${profile.games ? 'No player moves counted yet.' : 'Move quality will appear as games are analyzed.'}</div>`;
    }
    const rows = MOVE_QUALITY_ORDER
        .map(q => {
            const count = profile.moveLabels[q.label] || 0;
            const p = Math.round((count / total) * 1000) / 10;
            return { ...q, count, pct: p };
        })
        .filter(q => q.count > 0);
    let html = `<div class="quality-meta">${total} of your moves across ${profile.games} game${profile.games === 1 ? '' : 's'} · click a type to rank matches</div>`;
    html += rows.map(q => `
        <div class="quality-row" onclick="openMatchesSortedByLabel('${q.label}')" title="Show matches ranked by % ${q.label} moves">
            <div class="quality-label" style="color:${q.color}">${q.label}</div>
            <div class="quality-track"><div class="quality-fill" style="width:${Math.max(q.pct, q.count ? 2 : 0)}%;background:${q.color}"></div></div>
            <div class="quality-pct">${q.pct}%</div>
        </div>
    `).join('');
    return html;
}

function labelShareInGame(analysis, label) {
    const playerMoves = (analysis.moves || []).filter(m =>
        m.classification?.label && isPlayerMove(analysis, m)
    );
    if (!playerMoves.length) return { count: 0, total: 0, pct: 0 };
    const count = playerMoves.filter(m => m.classification.label === label).length;
    const pct = Math.round((count / playerMoves.length) * 1000) / 10;
    return { count, total: playerMoves.length, pct };
}

function openMatchesSortedByLabel(label) {
    matchesSortLabel = label || null;
    switchDashTab('matches');
}

function clearMatchesSort() {
    matchesSortLabel = null;
    renderMatchesTab();
}

function updateMatchSortChip() {
    const chip = document.getElementById('match-sort-chip');
    const text = document.getElementById('match-sort-label');
    if (!chip || !text) return;
    if (matchesSortLabel) {
        chip.classList.add('active');
        text.innerText = `Sorted by ${matchesSortLabel} %`;
    } else {
        chip.classList.remove('active');
    }
}

function playerGameElo(analysis) {
    if (!analysis) return null;
    const elo = analysis.isWhite ? analysis.whiteRating : analysis.blackRating;
    if (elo == null || elo === '' || Number.isNaN(Number(elo))) return null;
    return Number(elo);
}

function renderOverviewAccuracy(profile, analytics) {
    const el = document.getElementById('overview-accuracy');
    if (!el) return;
    const stats = analytics || (typeof computeProfileAnalytics === 'function' ? computeProfileAnalytics(profile) : null);
    const series = stats?.accuracySeries || [];
    if (!series.length) {
        el.innerHTML = '<div class="insight-empty">Accuracy needs rated (non-book) moves from analyzed games.</div>';
        return;
    }

    const avg = stats.avgAccuracy;
    const delta = stats.accuracyDelta;
    const deltaLabel = delta == null ? '—' : ((delta >= 0 ? '+' : '') + delta);
    const metaBits = [
        avg != null ? `<span class="accuracy-hero">${avg}<small>%</small></span>` : '',
        `<span>${series.length} game${series.length === 1 ? '' : 's'}</span>`,
        stats.avgCpl != null ? `<span>${stats.avgCpl} avg CPL</span>` : '',
        stats.avgOppAccuracy != null ? `<span>Opp ${stats.avgOppAccuracy}%</span>` : '',
        delta != null && series.length >= 2
            ? `<span class="${delta >= 0 ? 'elo-up' : 'elo-down'}">${deltaLabel} across sample</span>`
            : ''
    ].filter(Boolean).join('');

    if (series.length < 2) {
        el.innerHTML = `
            <div class="accuracy-summary">${metaBits}</div>
            <div class="insight-empty">One more analyzed game will draw your accuracy sparkline.</div>
        `;
        return;
    }

    const W = 640;
    const H = 140;
    const pad = { t: 14, b: 24, l: 36, r: 12 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const vals = series.map(p => p.accuracy);
    let minA = Math.min(...vals);
    let maxA = Math.max(...vals);
    if (minA === maxA) {
        minA = Math.max(0, minA - 5);
        maxA = Math.min(100, maxA + 5);
    } else {
        const padA = Math.max(2, (maxA - minA) * 0.12);
        minA = Math.max(0, minA - padA);
        maxA = Math.min(100, maxA + padA);
    }
    const xAt = (i) => pad.l + (i / Math.max(1, series.length - 1)) * plotW;
    const yAt = (a) => pad.t + (1 - (a - minA) / (maxA - minA)) * plotH;
    const linePts = series.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.accuracy).toFixed(2)}`).join(' ');
    const areaPts = [
        `${xAt(0).toFixed(2)},${(pad.t + plotH).toFixed(2)}`,
        ...series.map((p, i) => `${xAt(i).toFixed(2)},${yAt(p.accuracy).toFixed(2)}`),
        `${xAt(series.length - 1).toFixed(2)},${(pad.t + plotH).toFixed(2)}`
    ].join(' ');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('accuracy-spark-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Move accuracy over recent games');
    svg.innerHTML = `
        <line class="elo-grid-line" x1="${pad.l}" y1="${yAt(minA)}" x2="${W - pad.r}" y2="${yAt(minA)}"></line>
        <line class="elo-grid-line" x1="${pad.l}" y1="${yAt(maxA)}" x2="${W - pad.r}" y2="${yAt(maxA)}"></line>
        <text class="elo-axis-label" x="${pad.l - 4}" y="${yAt(maxA) + 3}" text-anchor="end">${Math.round(maxA)}</text>
        <text class="elo-axis-label" x="${pad.l - 4}" y="${yAt(minA) + 3}" text-anchor="end">${Math.round(minA)}</text>
        <polygon class="accuracy-spark-area" points="${areaPts}"></polygon>
        <polyline class="accuracy-spark-path" points="${linePts}"></polyline>
    `;

    series.forEach((p, idx) => {
        const cx = xAt(idx);
        const cy = yAt(p.accuracy);
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('cx', cx);
        hit.setAttribute('cy', cy);
        hit.setAttribute('r', Math.max(6, plotW / Math.max(series.length, 1) / 2));
        hit.classList.add('elo-line-hit');
        const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        tip.textContent = `${p.accuracy}% · ${p.result || ''}${p.avgCpl != null ? ` · ${p.avgCpl} CPL` : ''}`;
        hit.appendChild(tip);
        if (p.gameKey) {
            hit.addEventListener('click', () => openReviewFromStore(p.gameKey));
        }
        svg.appendChild(hit);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', cx);
        dot.setAttribute('cy', cy);
        dot.setAttribute('r', idx === series.length - 1 ? 4 : 2.75);
        dot.classList.add('accuracy-spark-dot');
        if (idx === series.length - 1) dot.classList.add('is-latest');
        svg.appendChild(dot);
    });

    el.innerHTML = `<div class="accuracy-summary">${metaBits}</div>`;
    el.appendChild(svg);
}

function renderOverviewEloChart(profile, analytics) {
    const el = document.getElementById('overview-elo-chart');
    if (!el) return;

    const stats = analytics || (typeof computeProfileAnalytics === 'function' ? computeProfileAnalytics(profile) : null);

    // One point per analyzed game (chronological) so Game ELO volatility is visible game-to-game
    const points = [...(profile.analyzedGames || [])]
        .map(g => {
            attachGamePlayers(g, null, g.username || profile.username);
            const you = typeof sideMoveStats === 'function' ? sideMoveStats(g, true) : null;
            return {
                g,
                t: g.endTime || 0,
                chessCom: playerGameElo(g),
                gameElo: you?.gameElo ?? null,
                gameKey: g.gameKey || null,
                result: g.result || ''
            };
        })
        .sort((a, b) => (a.t - b.t) || 0);

    const drawable = points.filter(p => p.chessCom != null || p.gameElo != null);
    if (drawable.length < 2) {
        el.innerHTML = drawable.length === 1
            ? '<div class="insight-empty">One more analyzed game will draw Chess.com vs Game ELO.</div>'
            : '<div class="insight-empty">Needs analyzed games to compare Chess.com ELO and estimated Game ELO.</div>';
        return;
    }

    const allVals = drawable.flatMap(p => [p.chessCom, p.gameElo]).filter(v => v != null);
    const gameElos = drawable.map(p => p.gameElo).filter(v => v != null);
    const W = 640;
    const H = 220;
    const pad = { t: 18, b: 28, l: 44, r: 14 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    let minE = Math.min(...allVals);
    let maxE = Math.max(...allVals);
    if (minE === maxE) {
        minE -= 50;
        maxE += 50;
    } else {
        const padE = Math.max(20, Math.round((maxE - minE) * 0.1));
        minE -= padE;
        maxE += padE;
    }

    // Index X-axis: equal spacing makes volatility readable even when timestamps bunch
    const xAt = (i) => pad.l + (i / Math.max(1, drawable.length - 1)) * plotW;
    const yAt = (elo) => pad.t + (1 - (elo - minE) / (maxE - minE)) * plotH;

    const sitePts = drawable.map((p, i) => (p.chessCom != null ? { i, ...p } : null)).filter(Boolean);
    const gamePts = drawable.map((p, i) => (p.gameElo != null ? { i, ...p } : null)).filter(Boolean);
    const siteLine = sitePts.map(p => `${xAt(p.i).toFixed(2)},${yAt(p.chessCom).toFixed(2)}`).join(' ');
    const gameLine = gamePts.map(p => `${xAt(p.i).toFixed(2)},${yAt(p.gameElo).toFixed(2)}`).join(' ');

    // Mean ± 1σ band for Game ELO (visual volatility envelope)
    let bandHtml = '';
    if (gameElos.length >= 2) {
        const mean = gameElos.reduce((s, v) => s + v, 0) / gameElos.length;
        const variance = gameElos.reduce((s, v) => s + (v - mean) ** 2, 0) / gameElos.length;
        const sd = Math.sqrt(variance);
        const yLo = yAt(Math.max(minE, mean - sd));
        const yHi = yAt(Math.min(maxE, mean + sd));
        bandHtml = `<rect class="elo-vol-band" x="${pad.l}" y="${Math.min(yHi, yLo)}" width="${plotW}" height="${Math.abs(yLo - yHi)}"></rect>`;
    }

    let stems = '';
    drawable.forEach((p, i) => {
        if (p.chessCom == null || p.gameElo == null) return;
        const x = xAt(i);
        stems += `<line class="elo-gap-stem" x1="${x}" y1="${yAt(p.chessCom)}" x2="${x}" y2="${yAt(p.gameElo)}"></line>`;
    });

    let grid = '';
    for (let i = 0; i <= 4; i++) {
        const elo = minE + ((maxE - minE) * i) / 4;
        const y = yAt(elo);
        grid += `<line class="elo-grid-line" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"></line>`;
        grid += `<text class="elo-axis-label" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${Math.round(elo)}</text>`;
    }

    const fmtDate = (ts) => ts
        ? new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '—';
    const tFirst = drawable[0].t;
    const tLast = drawable[drawable.length - 1].t;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('elo-line-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Chess.com ELO and estimated Game ELO over analyzed games');
    svg.innerHTML = `
        ${grid}
        ${bandHtml}
        ${stems}
        ${siteLine ? `<polyline class="elo-line-path" points="${siteLine}"></polyline>` : ''}
        ${gameLine ? `<polyline class="elo-line-path elo-line-perf" points="${gameLine}"></polyline>` : ''}
        <text class="elo-axis-label" x="${pad.l}" y="${H - 8}" text-anchor="start">${drawable.length} games · ${fmtDate(tFirst)}</text>
        <text class="elo-axis-label" x="${W - pad.r}" y="${H - 8}" text-anchor="end">${fmtDate(tLast)}</text>
    `;

    drawable.forEach((p, idx) => {
        const addDot = (val, cls, label) => {
            if (val == null) return;
            const cx = xAt(idx);
            const cy = yAt(val);
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hit.setAttribute('cx', cx);
            hit.setAttribute('cy', cy);
            hit.setAttribute('r', Math.max(6, plotW / Math.max(drawable.length, 1) / 2.2));
            hit.classList.add('elo-line-hit');
            const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            const gap = p.chessCom != null && p.gameElo != null
                ? ` · gap ${p.gameElo - p.chessCom >= 0 ? '+' : ''}${p.gameElo - p.chessCom}`
                : '';
            tip.textContent = `${label} ${val}${p.chessCom != null && p.gameElo != null && label === 'Game ELO' ? gap : ''} · ${fmtDate(p.t)} · ${p.result}`;
            hit.appendChild(tip);
            if (p.gameKey) hit.addEventListener('click', () => openReviewFromStore(p.gameKey));
            svg.appendChild(hit);
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', cx);
            dot.setAttribute('cy', cy);
            dot.setAttribute('r', idx === drawable.length - 1 ? 4.25 : 2.9);
            dot.classList.add(cls);
            if (idx === drawable.length - 1) dot.classList.add('is-latest');
            svg.appendChild(dot);
        };
        addDot(p.chessCom, 'elo-line-dot', 'Chess.com');
        addDot(p.gameElo, 'elo-perf-dot', 'Game ELO');
    });

    const last = drawable[drawable.length - 1];
    const avgGame = gameElos.length
        ? Math.round(gameElos.reduce((s, v) => s + v, 0) / gameElos.length)
        : (stats?.avgGameElo ?? null);
    let volatility = null;
    if (gameElos.length >= 2) {
        const mean = gameElos.reduce((s, v) => s + v, 0) / gameElos.length;
        volatility = Math.round(Math.sqrt(gameElos.reduce((s, v) => s + (v - mean) ** 2, 0) / gameElos.length));
    }
    const siteDelta = sitePts.length >= 2
        ? sitePts[sitePts.length - 1].chessCom - sitePts[0].chessCom
        : null;
    const lastGap = last.chessCom != null && last.gameElo != null
        ? last.gameElo - last.chessCom
        : null;

    el.innerHTML = `
        <div class="elo-chart-summary">
            ${last.chessCom != null ? `<span><strong>${last.chessCom}</strong> Chess.com</span>` : ''}
            ${last.gameElo != null ? `<span><strong>${formatGameEloLabel(last.gameElo)}</strong> Game ELO</span>` : ''}
            ${avgGame != null ? `<span>Avg ${formatGameEloLabel(avgGame)}</span>` : ''}
            ${volatility != null ? `<span>±${volatility} Game ELO volatility</span>` : ''}
            ${lastGap != null ? `<span class="${lastGap >= 0 ? 'elo-up' : 'elo-down'}">Latest gap ${lastGap >= 0 ? '+' : ''}${lastGap}</span>` : ''}
            ${siteDelta != null ? `<span class="${siteDelta >= 0 ? 'elo-up' : 'elo-down'}">${siteDelta >= 0 ? '+' : ''}${siteDelta} Chess.com</span>` : ''}
        </div>
        <div class="elo-legend text-color-secondary text-sm mb-2">
            <span class="elo-legend-item"><i class="elo-legend-swatch site"></i> Chess.com ELO</span>
            <span class="elo-legend-item"><i class="elo-legend-swatch perf"></i> Estimated Game ELO (caps IM/GM)</span>
            <span class="elo-legend-item"><i class="elo-legend-swatch stem"></i> Per-game gap</span>
            <span class="elo-legend-item"><i class="elo-legend-swatch band"></i> ±1σ Game ELO band</span>
        </div>
    `;
    el.appendChild(svg);
}

function renderOverviewForm(profile, analytics) {
    const el = document.getElementById('overview-form');
    if (!el) return;
    const a = analytics || (typeof computeProfileAnalytics === 'function' ? computeProfileAnalytics(profile) : null);
    const dist = a?.qualityDist;
    const total = a?.qualitySeries?.length || 0;
    if (!dist || !total) {
        el.innerHTML = '<div class="insight-empty">Quality form fills in as games get scores.</div>';
        return;
    }
    const order = ['excellent', 'solid', 'mixed', 'rough'];
    const streak = a.formStreak || 0;
    const kind = a.formStreakKind;
    const streakLabel = !streak
        ? 'No streak yet'
        : kind === 'hot'
            ? `${streak}-game solid streak`
            : `${streak}-game rough patch`;
    el.innerHTML = `
        <div class="form-streak mb-3">
            <span class="form-streak-value ${kind === 'hot' ? 'is-hot' : 'is-cold'}">${escAttr(streakLabel)}</span>
            ${a.avgQuality != null ? `<span class="text-color-secondary text-sm">Avg ${a.avgQuality.toFixed(2)}</span>` : ''}
        </div>
        <div class="quality-dist">
            ${order.map(k => {
                const n = dist[k] || 0;
                const p = Math.round((n / total) * 1000) / 10;
                return `
                    <div class="quality-dist-row">
                        <div class="quality-dist-label">${QUALITY_BUCKET_LABELS[k] || k}</div>
                        <div class="finish-track"><div class="finish-fill finish-${k === 'excellent' || k === 'solid' ? 'win' : k === 'mixed' ? 'draw' : 'loss'}" style="width:${Math.max(p, n ? 3 : 0)}%"></div></div>
                        <div class="finish-pct">${n} · ${p}%</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderOverviewTab(profile) {
    if (!hasAnalyzedGames(profile)) {
        showTabEmpty('overview', profile
            ? {
                icon: 'pi-hourglass',
                title: 'Waiting for games',
                body: 'Your overview will fill in as games finish analyzing — accuracy form, ELO trend, move quality, best and worst games, and your last five results.'
            }
            : {
                icon: 'pi-chart-bar',
                title: 'No profile loaded',
                body: 'Enter a Chess.com username above and hit Review Profile to see your stats, or review a single game. You can browse Learn anytime.'
            });
        return;
    }
    showTabContent('overview');

    const formStats = typeof computeProfileAnalytics === 'function'
        ? computeProfileAnalytics(profile)
        : null;
    renderOverviewAccuracy(profile, formStats);
    renderOverviewEloChart(profile, formStats);
    renderOverviewForm(profile, formStats);
    document.getElementById('overview-quality').innerHTML = qualityRowsHtml(profile);

    const games = gamesByRecency(profile);
    const recent = games.slice(0, 5);
    const recentEl = document.getElementById('overview-recent');
    if (!recent.length) {
        recentEl.innerHTML = '<div class="insight-empty">Games will show here after analysis.</div>';
    } else {
        recentEl.innerHTML = recent.map((g, i) => `
            <div class="p-card p-component mb-2" data-idx="${i}" onclick="openReviewFromStore('${escAttr(g.gameKey)}')" style="cursor:pointer">
                <div class="p-card-body mini-game-row py-2">
                    <div class="mini-result" style="color:${resultColor(g.result)}">${g.result}</div>
                    <div class="mini-color">${g.isWhite ? 'White' : 'Black'}</div>
                    <div class="mini-body">
                        <div class="mini-opp">${gameMatchupTitle(g)}</div>
                        <div class="mini-reason">${outcomeReason(g)}${g.resultDetail ? ' · ' + chessComResultLabel(g.resultDetail) : ''}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    const bw = document.getElementById('overview-best-worst');
    if (games.length < 1) {
        bw.innerHTML = '<div class="insight-empty">Need analyzed games for best / worst.</div>';
        return;
    }
    const scored = games.map(g => ({ g, score: g.qualityScore ?? gameQualityScore(g) }));
    const best = scored.reduce((a, b) => b.score > a.score ? b : a);
    const worst = scored.reduce((a, b) => b.score < a.score ? b : a);
    bw.innerHTML = `
        <div class="p-card p-component bw-card best" onclick="openReviewFromStore('${escAttr(best.g.gameKey)}')">
            <div class="p-card-body">
                <div class="bw-kicker">Best game · score ${best.score.toFixed(2)}</div>
                <div class="bw-title">${gameMatchupTitle(best.g)} · ${best.g.result}</div>
                <div class="bw-meta">${best.g.isWhite ? 'White' : 'Black'} · ${best.g.openingName || 'Unknown opening'}<br>${outcomeReason(best.g)}</div>
            </div>
        </div>
        <div class="p-card p-component bw-card worst" onclick="openReviewFromStore('${escAttr(worst.g.gameKey)}')">
            <div class="p-card-body">
                <div class="bw-kicker">Worst game · score ${worst.score.toFixed(2)}</div>
                <div class="bw-title">${gameMatchupTitle(worst.g)} · ${worst.g.result}</div>
                <div class="bw-meta">${worst.g.isWhite ? 'White' : 'Black'} · ${worst.g.openingName || 'Unknown opening'}<br>${outcomeReason(worst.g)}</div>
            </div>
        </div>
    `;
}

function escAttr(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function openReviewFromStore(gameKey) {
    if (!profileState) return;
    const g = profileState.analyzedGames.find(x => x.gameKey === gameKey);
    if (g) openReview(g);
}

function renderMatchesTab() {
    if (!hasAnalyzedGames()) {
        showTabEmpty('matches', profileState
            ? {
                icon: 'pi-hourglass',
                title: 'No matches yet',
                body: 'Analyzed games will land here as they finish. You can filter by colour, result, and time control once you have some.'
            }
            : {
                icon: 'pi-list',
                title: 'No matches yet',
                body: 'Load a Chess.com profile or review a single game and your analyzed games will appear here.'
            });
        return;
    }
    showTabContent('matches');

    const list = document.getElementById('game-list-view');
    list.innerHTML = '';
    updateMatchSortChip();
    const color = document.getElementById('filter-color')?.value || 'all';
    const result = document.getElementById('filter-result')?.value || 'all';
    const timeClass = document.getElementById('filter-time')?.value || 'all';
    let games = gamesByRecency(profileState)
        .filter(g => {
            if (typeof attachGameMeta === 'function') attachGameMeta(g, null);
            if (color === 'white' && !g.isWhite) return false;
            if (color === 'black' && g.isWhite) return false;
            if (result !== 'all' && g.result !== result) return false;
            if (timeClass !== 'all' && (g.timeClass || '') !== timeClass) return false;
            return true;
        });
    if (matchesSortLabel) {
        games = [...games].sort((a, b) => {
            const pa = labelShareInGame(a, matchesSortLabel).pct;
            const pb = labelShareInGame(b, matchesSortLabel).pct;
            if (pb !== pa) return pb - pa;
            return (b.endTime || 0) - (a.endTime || 0);
        });
    }
    if (!games.length) {
        list.innerHTML = '<div class="insight-empty">No matches for these filters.</div>';
        return;
    }
    for (const analysis of games) renderGameItem(null, analysis);
}

function lossReasonKey(analysis) {
    if (analysis.result !== 'LOSS') return null;
    const idx = analysis.gameStory?.keyMoveIndex;
    if (idx != null && analysis.moves?.[idx]) {
        const themes = analysis.moves[idx].moveThemes || [];
        const bad = themes.find(t => THEME_CATALOG[t]?.polarity === 'bad');
        if (bad) return bad;
    }
    for (const m of analysis.moves || []) {
        if (!isPlayerMove(analysis, m)) continue;
        const bad = (m.moveThemes || []).find(t => THEME_CATALOG[t]?.polarity === 'bad');
        if (bad && ['Blunder', 'Mistake', 'Miss'].includes(m.classification?.label)) return bad;
    }
    return 'unclassified';
}


function analysisSnapshotIsFresh(profile) {
    return !!(
        profile?.analysisSnapshot &&
        !profile.analysisSnapshotDirty &&
        profile.analysisSnapshot.gameCount === (profile.analyzedGames || []).length
    );
}

function profileInsightEmptyCopy(profile, kind) {
    if (kind === 'coaching') {
        return profile
            ? {
                icon: 'pi-comments',
                title: 'No coaching yet',
                body: 'Once a few games are analyzed, coach notes and theme frequency land here.'
            }
            : {
                icon: 'pi-comments',
                title: 'Coaching needs a profile',
                body: 'Load a Chess.com profile and analyze games to get phase-by-phase coaching.'
            };
    }
    return profile
        ? {
            icon: 'pi-chart-bar',
            title: 'No game stats yet',
            body: 'Form, openings, heatmaps, and piece patterns show up after games are analyzed.'
        }
        : {
            icon: 'pi-chart-bar',
            title: 'Game stats need a profile',
            body: 'Load a Chess.com profile and analyze games to see form, tactics rates, and tendencies.'
        };
}

/** Paint Coaching tab panels from snapshot (or placeholders while building). */
function paintCoachingTab(profile) {
    if (!hasAnalyzedGames(profile)) return;
    showTabContent('coaching');
    const snap = profile.analysisSnapshot;
    if (!snap) {
        const themes = document.getElementById('analysis-themes');
        if (themes) themes.innerHTML = '<div class="insight-empty">Building theme frequency…</div>';
        const coach = document.getElementById('analysis-coach');
        if (coach) coach.innerHTML = '<div class="insight-empty">Building coach notes…</div>';
        return;
    }
    if (typeof renderThemeFrequencyPanel === 'function') {
        renderThemeFrequencyPanel(profile, snap.analytics);
    }
    renderCoachInsights(profile, snap.insights);
}

/** Paint Game stats tab panels from snapshot (or placeholders while building). */
function paintStatsTab(profile) {
    if (!hasAnalyzedGames(profile)) return;
    showTabContent('stats');

    renderOpeningRankList(
        'profile-white-openings',
        topOpeningEntries(profile.openingsWhite, profile.whiteGames, 8),
        profile.whiteGames ? 'No white openings yet.' : 'Gathering white games…',
        true
    );
    renderOpeningRankList(
        'profile-black-defences',
        topOpeningEntries(profile.openingsBlack, profile.blackGames, 8),
        profile.blackGames ? 'No black defences yet.' : 'Gathering black games…',
        true
    );

    const snap = profile.analysisSnapshot;
    if (!snap) {
        const form = document.getElementById('analysis-form');
        if (form) form.innerHTML = '<div class="insight-empty">Building form stats…</div>';
        const tactics = document.getElementById('analysis-tactics');
        if (tactics) tactics.innerHTML = '<div class="insight-empty">Building tactics stats…</div>';
        const heat = document.getElementById('player-move-heatmap');
        if (heat) heat.innerHTML = '<div class="insight-empty">Building heatmaps…</div>';
        const surv = document.getElementById('analysis-piece-survival');
        if (surv) surv.innerHTML = '<div class="insight-empty">Building piece survival…</div>';
        const mates = document.getElementById('analysis-checkmates');
        if (mates) mates.innerHTML = '<div class="insight-empty">Building checkmate stats…</div>';
        return;
    }

    if (typeof renderProfileFormPanel === 'function') {
        renderProfileFormPanel(profile, snap.analytics);
    }
    if (typeof renderTacticsEnginePanel === 'function') {
        renderTacticsEnginePanel(profile, snap.analytics);
    }
    renderPlayerMoveHeatmap(profile, snap.heat);
    renderPieceSurvivalPanel(profile, snap.survival);
    renderCheckmateWithPanel(profile, snap.mates);
}

/** @deprecated alias — paints whichever coaching/stats panels exist */
function paintAnalysisTab(profile) {
    paintCoachingTab(profile);
    paintStatsTab(profile);
}

function renderCoachingTab(profile) {
    if (!hasAnalyzedGames(profile)) {
        showTabEmpty('coaching', profileInsightEmptyCopy(profile, 'coaching'));
        return;
    }
    showTabContent('coaching');
    if (!analysisSnapshotIsFresh(profile)) {
        paintCoachingTab(profile);
        scheduleAnalysisSnapshot(profile, { immediate: true });
        return;
    }
    paintCoachingTab(profile);
}

function renderStatsTab(profile) {
    if (!hasAnalyzedGames(profile)) {
        showTabEmpty('stats', profileInsightEmptyCopy(profile, 'stats'));
        return;
    }
    showTabContent('stats');
    if (!analysisSnapshotIsFresh(profile)) {
        paintStatsTab(profile);
        scheduleAnalysisSnapshot(profile, { immediate: true });
        return;
    }
    paintStatsTab(profile);
}

function renderAnalysisTab(profile) {
    renderCoachingTab(profile);
}

/** Map a board square into the player's view (their first rank at the bottom). */
function orientSquareToPlayer(sq, isWhite) {
    if (!sq || isWhite) return sq;
    const file = sq.charCodeAt(0) - 97;
    const rank = Number(sq[1]);
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return sq;
    return String.fromCharCode(97 + (7 - file)) + (9 - rank);
}

function emptyHeatBucket() {
    return { counts: {}, max: 0, total: 0 };
}

/** Build 2×3 heatmaps: white/black × opening/middlegame/endgame. */
function buildPhaseColorHeatmaps(profile) {
    const phases = ['opening', 'middlegame', 'endgame'];
    const buckets = {
        white: { opening: emptyHeatBucket(), middlegame: emptyHeatBucket(), endgame: emptyHeatBucket() },
        black: { opening: emptyHeatBucket(), middlegame: emptyHeatBucket(), endgame: emptyHeatBucket() }
    };
    let grandTotal = 0;

    const addCount = (bucket, sq, n) => {
        bucket.counts[sq] = (bucket.counts[sq] || 0) + n;
        bucket.total += n;
        grandTotal += n;
        if (bucket.counts[sq] > bucket.max) bucket.max = bucket.counts[sq];
    };

    for (const a of profile.analyzedGames || []) {
        const colorKey = a.isWhite ? 'white' : 'black';
        if (a.heatTargets) {
            for (const phase of phases) {
                const counts = a.heatTargets[phase] || {};
                const bucket = buckets[colorKey][phase];
                for (const [sq, n] of Object.entries(counts)) addCount(bucket, sq, n);
            }
            continue;
        }
        const { phases: movePhases } = assignMovePhases(a);
        for (let i = 0; i < (a.moves || []).length; i++) {
            const m = a.moves[i];
            if (!isPlayerMove(a, m) || !m.to) continue;
            const phase = movePhases[i] || 'middlegame';
            if (!phases.includes(phase)) continue;
            const sq = orientSquareToPlayer(m.to, !!a.isWhite);
            addCount(buckets[colorKey][phase], sq, 1);
        }
    }
    return { buckets, grandTotal };
}

function heatmapBoardHtml(bucket, ariaLabel) {
    const { counts, max, total } = bucket;
    if (!total) {
        return `
            <div class="move-heatmap is-empty" aria-label="${ariaLabel}">
                <div class="heatmap-grid heatmap-grid-empty"></div>
                <div class="heatmap-mini-meta">No moves</div>
            </div>
        `;
    }

    let hotSq = null;
    let hotCount = 0;
    for (const [sq, n] of Object.entries(counts)) {
        if (n > hotCount) {
            hotCount = n;
            hotSq = sq;
        }
    }

    let cells = '';
    for (let r = 0; r < 8; r++) {
        const rankLabel = 8 - r;
        for (let c = 0; c < 8; c++) {
            const file = String.fromCharCode(97 + c);
            const sq = file + rankLabel;
            const n = counts[sq] || 0;
            const intensity = max ? n / max : 0;
            const light = (r + c) % 2 === 0;
            cells += `<div class="heatmap-sq ${light ? 'light' : 'dark'}" style="--heat:${intensity.toFixed(3)}" title="${sq.toUpperCase()}: ${n} move${n === 1 ? '' : 's'}">${n ? `<span class="heatmap-count">${n}</span>` : ''}</div>`;
        }
    }

    return `
        <div class="move-heatmap" aria-label="${ariaLabel}">
            <div class="heatmap-grid">${cells}</div>
            <div class="heatmap-mini-meta">
                ${total.toLocaleString()} · hot ${hotSq ? hotSq.toUpperCase() : '—'}
            </div>
        </div>
    `;
}

function renderPlayerMoveHeatmap(profile, heatData) {
    const el = document.getElementById('player-move-heatmap');
    if (!el) return;
    const { buckets, grandTotal } = heatData || buildPhaseColorHeatmaps(profile);
    if (!grandTotal) {
        el.innerHTML = '<div class="insight-empty">Heatmaps will appear once moves are analyzed.</div>';
        return;
    }

    const phaseLabels = [
        ['opening', 'Opening'],
        ['middlegame', 'Middlegame'],
        ['endgame', 'Endgame']
    ];

    const header = `
        <div class="heatmap-matrix-corner"></div>
        ${phaseLabels.map(([, label]) => `<div class="heatmap-matrix-colhead">${label}</div>`).join('')}
    `;

    const row = (colorKey, label) => `
        <div class="heatmap-matrix-rowhead">${label}</div>
        ${phaseLabels.map(([phase, phaseLabel]) => `
            <div class="heatmap-matrix-cell">
                ${heatmapBoardHtml(buckets[colorKey][phase], `${label} ${phaseLabel} move heatmap`)}
            </div>
        `).join('')}
    `;

    el.innerHTML = `
        <div class="heatmap-matrix" role="group" aria-label="Move heatmaps by colour and phase">
            ${header}
            ${row('white', 'As White')}
            ${row('black', 'As Black')}
        </div>
        <div class="heatmap-legend">${grandTotal.toLocaleString()} of your destination squares across all games</div>
    `;
}

function switchAboutTab(name, el) {
    const tab = name === 'features' ? 'features' : 'how';
    document.querySelectorAll('#about-view .about-tabs .p-tabview-nav > li').forEach(li => li.classList.remove('p-highlight'));
    const link = el?.classList?.contains('p-tabview-nav-link')
        ? el
        : document.querySelector(`#about-view .p-tabview-nav-link[data-about="${tab}"]`);
    if (link) link.closest('li')?.classList.add('p-highlight');
    const how = document.getElementById('about-panel-how');
    const features = document.getElementById('about-panel-features');
    if (how) {
        how.style.display = tab === 'how' ? 'block' : 'none';
        how.classList.toggle('active', tab === 'how');
    }
    if (features) {
        features.style.display = tab === 'features' ? 'block' : 'none';
        features.classList.toggle('active', tab === 'features');
    }
}

function aboutFeatureItem(term, def) {
    return `
        <div class="faq-item">
            <div class="faq-term">${term}</div>
            <div class="faq-def">${def}</div>
        </div>
    `;
}

function renderAboutHowItWorks() {
    const el = document.getElementById('faq-content');
    if (!el) return;
    const openingCount = (ACTIVE_OPENING_BOOK || []).length;
    const famousCount = (ACTIVE_FAMOUS_GAMES || []).length || (INTERNAL_FAMOUS_GAMES || []).length;
    const bookSrc = openingBookSource === 'external' ? 'openings.json' : 'internal fallback';
    const famSrc = famousGamesSource === 'external' ? 'famous-games.json' : 'internal fallback';
    el.innerHTML = `
        <div class="about-coverage mb-3">
            <div class="about-coverage-line"><strong>${openingCount.toLocaleString()}</strong> openings loaded (${bookSrc})</div>
            <div class="about-coverage-line"><strong>${famousCount.toLocaleString()}</strong> famous games loaded (${famSrc})</div>
            <div class="about-coverage-note">Book = continuous prefix from move one in our catalog (FEN and/or move-list). Leaving the line ends Book even if a later position exists elsewhere. Theory is a separate famous-game match (≥12 plies), not the same as Book.</div>
        </div>
        <h3 class="about-section-title">How we classify your moves</h3>
        <p class="faq-def mb-3">Profile scans use Stockfish at depth ${ENGINE_DEPTH}. Checks, captures, mates, and large first-pass losses re-search at depth ${typeof CRITICAL_ENGINE_DEPTH === 'number' ? CRITICAL_ENGINE_DEPTH : 9} with MultiPV for sharper labels. Open a game and use <strong>Deepen analysis</strong> for depth ${REVIEW_ENGINE_DEPTH} with MultiPV ${REVIEW_MULTIPV} on every move.</p>
        <p class="faq-def mb-3">Severity is based mainly on <strong>expected-points loss</strong> (change in win probability from the eval before → after your move), not raw centipawns alone. Swings from equal positions count more than swings in already-decided games. A base ${EVAL_NOISE_FLOOR_CP}cp noise floor applies on quiet samples; mates, clear PV gaps, and critical re-searches trust the engine more (lower floor).</p>
        ${[
            ['Theory', 'Your move matches a famous game line (at least 12 plies of SAN continuity from move one).'],
            ['Book', 'Still inside our opening book (continuous FEN / move-list prefix), and not already tagged Theory.'],
            ['Best', 'Engine top move, or tiny expected-points loss (roughly ≤2%).'],
            ['Good', 'Small expected-points dip — still a healthy practical choice.'],
            ['Okay', 'Visible concession, not serious. Also the cap when the engine sample is marked unreliable (never Mistake/Blunder then).'],
            ['Miss', 'Clear expected-points drop — something better was available without a full collapse.'],
            ['Mistake', 'Real damage to winning chances (larger expected-points loss).'],
            ['Blunder', 'Heavy expected-points collapse. Descriptions prefer the concrete theme when we have one (e.g. “Blunder — hung the knight”).']
        ].map(([term, def]) => aboutFeatureItem(term, def)).join('')}
        <h3 class="about-section-title">Material &amp; structure themes</h3>
        <p class="faq-def mb-3">Besides tactics, we tag fianchetto completion/trades, doubled pawns, isolated pawns, and hemmed “bad bishops”. These feed coach cards and Miss/Mistake/Blunder headlines.</p>
        <h3 class="about-section-title">Material events</h3>
        <p class="faq-def mb-3"><strong>Limits:</strong> material events use a 6-ply continuation from the actual game (not a full engine search). Hang/sac can miss quiet compensation. Labels refresh on new analysis or when you deepen a review.</p>
        ${[
            ['Take / capture', 'You captured a piece and, after a short lookahead, the material balance is still in your favour (sequence net &gt; 0).'],
            ['Exchange', 'You captured, but the immediate material swing is roughly even (|immediateNet| ≤ 1).'],
            ['Hang', 'A newly hanging piece (knight or heavier, or any piece the opponent actually takes in the lookahead) after your move.'],
            ['Sacrifice', 'You offer a knight-or-heavier piece and the short sequence recovers the material (or better), with a healthy/eval-supported label.'],
            ['Missed capture', 'The engine’s best move would take a hanging opponent piece on a different square than what you played.']
        ].map(([term, def]) => aboutFeatureItem(term, def)).join('')}
    `;
}

function renderAboutFeatureSet() {
    const el = document.getElementById('about-features-content');
    if (!el) return;

    const themeRows = Object.entries(THEME_CATALOG || {}).map(([id, cat]) => {
        const habit = typeof PROFILE_SKIP_THEMES !== 'undefined' && PROFILE_SKIP_THEMES.has(id)
            ? ' <span class="about-tag">healthy habit</span>'
            : '';
        const pol = cat.polarity === 'bad' ? 'bad' : 'good';
        return aboutFeatureItem(
            `${id.replace(/_/g, ' ')}${habit}`,
            `<span class="about-polarity about-polarity-${pol}">${pol}</span> — ${cat.detail}`
        );
    }).join('');

    const im = typeof GAME_ELO_IM === 'number' ? GAME_ELO_IM : 2400;
    const gm = typeof GAME_ELO_GM === 'number' ? GAME_ELO_GM : 2500;

    el.innerHTML = `
        <p class="faq-def mb-3">What each dashboard area and coach surface measures. Numbers come from your locally analyzed games only.</p>

        <h3 class="about-section-title">Dashboard · Overview</h3>
        ${[
            ['Accuracy form', 'Average move accuracy across analyzed games, with a sparkline over time. Click a point to open that game.'],
            ['Chess.com ELO & Game ELO', 'Your Chess.com rating after each game vs estimated Game ELO from accuracy. Stems show the gap; the band is ±1σ Game ELO volatility. Game ELO soft-caps at IM (~${im}) and hard-caps at GM (~${gm}).'],
            ['Move quality', 'Share of your moves in each quality band (Best → Blunder). Click a band to rank Matches by that share.'],
            ['Quality form', 'Distribution of per-game quality scores (excellent / solid / mixed / rough) and your current hot or cold streak.'],
            ['Best & worst', 'Highest and lowest qualityScore games in the sample, with opening and outcome context.'],
            ['Last 5 games', 'Most recent analyzed results with finish reason.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Dashboard · Matches</h3>
        ${[
            ['Game list', 'Analyzed games with matchup, colour, time class, accuracy, result, and finish reason.'],
            ['Filters', 'Colour (white/black), result (W/L/D), and time control (bullet / blitz / rapid / classical / daily).'],
            ['Sort chip', 'When you click a move-quality row on Overview, Matches ranks by that label’s % share.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Dashboard · Coaching</h3>
        ${[
            ['Coach notes', 'Evidence-backed cards for overview, opening, middlegame, and endgame, plus a weekly focus. Cards include confidence, advice, and clickable evidence moves.'],
            ['By piece', 'Pros and cons for how you handle each piece type across the sample.'],
            ['Theme frequency', 'How often each tagged theme appears across games (% of games), with healthy-habits called out separately and evidence links.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Dashboard · Game stats</h3>
        ${[
            ['Form & finishes', 'Avg accuracy, Game ELO, CPL (overall and per game), max eval swing, collapses vs comebacks, opponent accuracy, rating gap. Finish breakdown by mate / resign / timeout / draw. Early-resign note when you resign before the position is fully dead.'],
            ['CPL by phase', 'Average centipawn loss in opening, middlegame, and endgame.'],
            ['Performance vs rating gap', 'Win rate and accuracy when underdog (−150+), even, or favorite (+150+).'],
            ['By time control', 'Per time-class games, W/L/D, accuracy, and CPL.'],
            ['Tactics, engine & opponents', 'Material-event rates (hang / missed capture / sac / winning capture); missed engine capture/check shots; MultiPV top-2 hits after deepen; punish-opp vs get-punished rates; dedicated king-safety themes.'],
            ['Player tendencies', 'Favourite opening families as White and Black; destination-square heatmaps by colour × phase.'],
            ['Piece survival', 'Average life (in moves) of each starting piece as White and as Black.'],
            ['Checkmate with', 'Which piece delivered your checkmate wins, by percentage.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Dashboard · Learn</h3>
        ${[
            ['Openings', 'Browse and study opening lines from the loaded catalog.'],
            ['Famous games', 'Browse theory lines used for the Theory move label.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Single-game review</h3>
        ${[
            ['Coaching', 'Per-game coach notes: overview, opening / middlegame / endgame, and by-piece pros/cons from that game’s themes and material events.'],
            ['Game stats', 'Estimated Game ELO for you and opponent, accuracy, phase star ratings, and move-quality group breakdowns.'],
            ['Moves', 'Move list with quality labels; key moment highlighted from the game story.'],
            ['Graph', 'Eval curve for the game; click points to jump to a move.'],
            ['Deepen analysis', `Re-run the current game at depth ${REVIEW_ENGINE_DEPTH} with MultiPV ${REVIEW_MULTIPV} for sharper labels and alternate engine lines.`]
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">What the coach analyses</h3>
        <p class="faq-def mb-3">Coach cards are built from openings, phase move quality, tactics + structure themes (fianchetto, doubled/isolated pawns, bad bishop), material events, expected-points severity, eval swings, heatmaps, and piece patterns — not generic tips.</p>
        ${[
            ['Opening reads', 'Book depth, who left theory first, favourite / weak opening families, early bishop sacs, knight development vs early exchanges.'],
            ['Middlegame reads', 'Blunder rates by phase, hang / fork / missed-hanging themes, knight activity, heatmap hotspots.'],
            ['Endgame reads', 'How often you enter the endgame up or down material, pawn endgames, back-rank issues.'],
            ['Weekly focus', 'Highest-priority card from the corpus (confidence-weighted) as a single practice target.'],
            ['Evidence', 'Up to three concrete moves you can open in review at the exact ply.']
        ].map(([t, d]) => aboutFeatureItem(t, d)).join('')}

        <h3 class="about-section-title">Tagged themes</h3>
        <p class="faq-def mb-3">Themes are attached to moves during analysis. Frequency cards use % of games where the theme appears at least once. Healthy-habit themes are muted in the main list but shown as positives.</p>
        ${themeRows}
    `;
}

/** Entry point when opening About — fills How it works + Feature set. */
function renderFaqTab() {
    renderAboutHowItWorks();
    renderAboutFeatureSet();
    switchAboutTab('how');
}

function refreshDashboard() {
    document.getElementById('dashboard').style.display = 'block';
    if (profileState) renderProfileHeader(profileState);
    const active = document.querySelector('#dash-tabs .p-tabview-nav > li.p-highlight .p-tabview-nav-link')?.dataset?.tab || 'overview';
    renderOverviewTab(profileState);
    if (active === 'matches') renderMatchesTab();
    if (active === 'coaching' || active === 'stats' || active === 'analysis') {
        // Never rebuild heavy analysis work on every game tick — paint snapshot / schedule
        const paint = () => {
            if (active === 'stats') paintStatsTab(profileState);
            else paintCoachingTab(profileState);
            // Keep the other tab warm when snapshot is ready
            if (analysisSnapshotIsFresh(profileState)) {
                if (active === 'stats') paintCoachingTab(profileState);
                else paintStatsTab(profileState);
            }
        };
        if (analysisSnapshotIsFresh(profileState)) paint();
        else {
            paint();
            scheduleAnalysisSnapshot(profileState);
        }
    }
    if (active === 'learning') renderLearningBrowse();
}

function topOpeningEntries(bucket, totalForColor, limit = 3) {
    return Object.entries(bucket)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([name, data]) => {
            const vars = Object.entries(data.variations || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([vName, vCount]) => ({ name: vName, count: vCount }));
            const topVar = vars[0];
            const winRate = data.count ? Math.round((data.wins || 0) / data.count * 1000) / 10 : 0;
            return {
                name,
                count: data.count,
                wins: data.wins || 0,
                losses: data.losses || 0,
                draws: data.draws || 0,
                winRate,
                pct: totalForColor ? Math.round((data.count / totalForColor) * 100) : 0,
                variation: topVar && topVar.name !== name ? topVar.name : null,
                variations: vars
            };
        });
}

function renderOpeningRankList(elId, entries, emptyText, expanded = false) {
    const el = document.getElementById(elId);
    if (!entries.length) {
        el.innerHTML = `<div class="insight-empty">${emptyText}</div>`;
        return;
    }
    el.innerHTML = entries.map((entry, idx) => {
        const wld = `${entry.wins}-${entry.losses}-${entry.draws}`;
        const varLine = expanded && entry.variations?.length
            ? `<div class="opening-rank-vars">${entry.variations.map(v =>
                `<span>${v.name}${v.count > 1 ? ` ×${v.count}` : ''}</span>`
            ).join('')}</div>`
            : (entry.variation ? `<div class="opening-rank-meta">Often: ${entry.variation}</div>` : '');
        return `
            <div class="opening-rank-item${expanded ? ' expanded' : ''}">
                <div class="opening-rank-num">${idx + 1}.</div>
                <div>
                    <div class="opening-rank-name">${entry.name}</div>
                    <div class="opening-rank-meta">
                        ${entry.count} game${entry.count === 1 ? '' : 's'}
                        · ${entry.pct}% of colour
                        · W/L/D ${wld}
                        · ${entry.winRate}% win
                    </div>
                    ${varLine}
                </div>
                <div class="opening-rank-pct">${entry.pct}%</div>
            </div>
        `;
    }).join('');
}


function renderProfileOverview(profile) {
    refreshDashboard();
}

function renderGameItem(game, analysis) {
    if (!analysis.gameStory) finalizeAnalysis(analysis);
    const list = document.getElementById('game-list-view');
    const card = document.createElement('div');
    card.className = "p-card p-component stat-card";
    card.onclick = () => openReview(analysis);
    const resultColor = analysis.result === 'WIN' ? 'var(--success)'
        : analysis.result === 'DRAW' ? 'var(--warning)' : 'var(--accent)';
    const story = analysis.gameStory?.headline
        ? `<div class="game-card-story">${analysis.gameStory.headline}</div>`
        : '';
    let sortLine = '';
    if (matchesSortLabel) {
        const share = labelShareInGame(analysis, matchesSortLabel);
        sortLine = `<div class="game-card-sort">${share.pct}% ${matchesSortLabel} · ${share.count}/${share.total} moves</div>`;
    }
    if (typeof attachGameMeta === 'function') attachGameMeta(analysis, null);
    const tcLabel = typeof formatTimeClassLabel === 'function'
        ? formatTimeClassLabel(analysis.timeClass)
        : (analysis.timeClass || '');
    const finish = analysis.resultDetail || analysis.oppResultDetail
        ? chessComResultLabel(
            analysis.result === 'WIN'
                ? (analysis.oppResultDetail || analysis.resultDetail)
                : analysis.resultDetail
        )
        : '';
    const youAcc = sideMoveStats(analysis, true).accuracy;
    card.innerHTML = `
        <div class="p-card-body" style="text-align:left">
            <div class="font-bold text-lg game-matchup-title">${gameMatchupTitle(analysis)}</div>
            <div class="text-primary text-sm mb-2">${analysis.openingName || ''}</div>
            <div class="flex justify-content-between align-items-center">
                <span class="text-color-secondary text-sm">${analysis.isWhite ? 'White' : 'Black'}${tcLabel ? ` · ${tcLabel}` : ''} · ${analysis.moves.length} moves${youAcc != null ? ` · ${youAcc}%` : ''}</span>
                <span class="p-tag p-component" style="background:${resultColor}">${analysis.result}</span>
            </div>
            ${finish ? `<div class="game-card-finish text-color-secondary text-sm">${finish}</div>` : ''}
            ${sortLine}
            ${story}
        </div>
    `;
    list.appendChild(card);
}

function updateReviewDepthBadge(analysis) {
    const badge = document.getElementById('review-depth-badge');
    const btn = document.getElementById('btn-deepen');
    if (!badge) return;
    const depth = analysis?.engineDepth || ENGINE_DEPTH;
    const deepened = depth >= REVIEW_ENGINE_DEPTH;
    badge.textContent = deepened
        ? `Deepened to depth ${depth}`
        : `Analyzed at depth ${depth}`;
    badge.classList.toggle('is-deep', deepened);
    if (btn && !isDeepening) {
        btn.disabled = deepened || !enginesReady;
        btn.title = deepened
            ? `Already analyzed at depth ${depth}`
            : `Re-analyze this game at depth ${REVIEW_ENGINE_DEPTH}`;
    }
}

function openReview(analysis) {
    if (!analysis.gameStory) finalizeAnalysis(analysis);
    attachGamePlayers(analysis, null, analysis.username || profileState?.username);
    currentReviewGame = analysis;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('review-view').style.display = 'grid';
    const listUi = document.getElementById('moves-tab');
    listUi.innerHTML = '';

    const matchupEl = document.getElementById('review-matchup');
    if (matchupEl) matchupEl.innerText = gameMatchupTitle(analysis);
    updateReviewDepthBadge(analysis);
    const deepenStatus = document.getElementById('review-deepen-status');
    if (deepenStatus && !isDeepening) deepenStatus.textContent = '';

    const evalBar = document.getElementById('eval-bar');
    evalBar.classList.toggle('player-white', !!analysis.isWhite);
    evalBar.classList.toggle('player-black', !analysis.isWhite);

    const storyBox = document.getElementById('game-story-box');
    const story = analysis.gameStory;
    const keyBtn = document.getElementById('btn-key-move');
    if (story && story.headline) {
        storyBox.style.display = 'block';
        storyBox.className = 'p-card game-story mb-3 ' + (analysis.result === 'WIN' ? 'win' : analysis.result === 'DRAW' ? 'draw' : 'loss');
        document.getElementById('game-story-kicker').innerText =
            analysis.result === 'WIN' ? 'Why you won'
            : analysis.result === 'DRAW' ? 'Why it was drawn'
            : 'Why you lost';
        document.getElementById('game-story-headline').innerText = story.headline;
        document.getElementById('game-story-detail').innerText = story.detail || '';
        const link = document.getElementById('game-story-link');
        if (story.keyMoveIndex != null) {
            link.style.display = 'block';
            link.innerText = `Jump to key moment${story.keyMoveRef ? ` (${story.keyMoveRef})` : ''} →`;
            link.onclick = () => goToKeyMove();
            keyBtn.disabled = false;
            keyBtn.title = `Jump to key moment${story.keyMoveRef ? ` (${story.keyMoveRef})` : ''}`;
        } else {
            link.style.display = 'none';
            link.onclick = null;
            keyBtn.disabled = true;
            keyBtn.title = 'No key moment for this game';
        }
    } else {
        storyBox.style.display = 'none';
        keyBtn.disabled = true;
        keyBtn.title = 'No key moment for this game';
    }

    analysis.moves.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = 'move-row';
        row.id = `move-${idx}`;
        row.onclick = () => goToMove(idx);
        const isKey = story && story.keyMoveIndex === idx;
        const label = m.classification?.label
            ? `<span class="move-label ${m.classification.class}">${m.classification.label}</span>`
            : '';
        const turnMark = m.turn === 'w' ? '.' : '...';
        row.innerHTML = `<span style="color:#666; width:36px">${m.moveNum}${turnMark}</span><b style="width:50px">${m.san}</b>${isKey ? '<span style="color:var(--primary);font-size:10px;margin-right:6px;">KEY</span>' : ''}${label}`;
        listUi.appendChild(row);
    });

    renderEvalLineGraph(analysis);
    renderReviewCoachTab(analysis);
    renderReviewStatsTab(analysis);

    // Default to Coaching tab
    const reviewNav = document.querySelector('#review-view .p-tabview-nav');
    if (reviewNav) {
        reviewNav.querySelectorAll('li').forEach((li, i) => li.classList.toggle('p-highlight', i === 0));
    }
    const coachEl = document.getElementById('coach-tab');
    const statsEl = document.getElementById('stats-tab');
    if (coachEl) coachEl.style.display = 'block';
    if (statsEl) statsEl.style.display = 'none';
    document.getElementById('moves-tab').style.display = 'none';
    document.getElementById('graph-tab').style.display = 'none';

    goToMove(0);
}

function renderEvalLineGraph(analysis) {
    const graphUi = document.getElementById('eval-graph');
    graphUi.innerHTML = '';
    const moves = analysis.moves || [];
    if (!moves.length) {
        graphUi.innerHTML = '<div class="insight-empty">No eval data for this game.</div>';
        return;
    }

    const W = 320;
    const H = 220;
    const pad = { t: 14, b: 18, l: 10, r: 10 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const CAP = 1000; // ±10 pawns on the scale
    const keyIdx = analysis.gameStory?.keyMoveIndex;

    const vals = moves.map(m => {
        const v = playerEvalAt(analysis, m);
        return Math.max(-CAP, Math.min(CAP, v));
    });

    const xAt = (i) => pad.l + (moves.length === 1 ? plotW / 2 : (i / (moves.length - 1)) * plotW);
    const yAt = (v) => pad.t + (1 - (v + CAP) / (2 * CAP)) * plotH;

    const linePts = vals.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
    const areaPts = [
        `${xAt(0).toFixed(2)},${yAt(0).toFixed(2)}`,
        ...vals.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`),
        `${xAt(moves.length - 1).toFixed(2)},${yAt(0).toFixed(2)}`
    ].join(' ');

    const zeroY = yAt(0);
    const side = analysis.isWhite ? 'White' : 'Black';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('eval-line-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Evaluation graph from ${side}'s perspective`);

    svg.innerHTML = `
        <line class="eval-line-zero" x1="${pad.l}" y1="${zeroY}" x2="${W - pad.r}" y2="${zeroY}"></line>
        <polygon class="eval-line-area" points="${areaPts}"></polygon>
        <polyline class="eval-line-path" points="${linePts}"></polyline>
    `;

    vals.forEach((v, idx) => {
        const cx = xAt(idx);
        const cy = yAt(v);
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('cx', cx);
        hit.setAttribute('cy', cy);
        hit.setAttribute('r', Math.max(6, plotW / Math.max(moves.length, 1) / 2));
        hit.classList.add('eval-line-hit');
        hit.addEventListener('click', () => goToMove(idx));
        svg.appendChild(hit);

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', cx);
        dot.setAttribute('cy', cy);
        dot.setAttribute('r', 3.5);
        dot.classList.add('eval-line-dot');
        if (keyIdx === idx) dot.classList.add('is-key');
        dot.dataset.moveIdx = String(idx);
        svg.appendChild(dot);
    });

    graphUi.appendChild(svg);
    graphUi.title = `${side} perspective · + is better for ${side.toLowerCase()} · click a point to jump`;
}

function moveGroupRowsHtml(stats) {
    if (!stats.total) return '<div class="insight-empty">No classified moves.</div>';
    const rows = MOVE_QUALITY_ORDER.map(q => {
        const count = stats.counts[q.label] || 0;
        if (!count) return '';
        const p = Math.round((count / stats.total) * 1000) / 10;
        return `
            <div class="quality-row compact" title="${q.label}: ${count}">
                <div class="quality-label" style="color:${q.color}">${q.label}</div>
                <div class="quality-track"><div class="quality-fill" style="width:${Math.max(p, 2)}%;background:${q.color}"></div></div>
                <div class="quality-pct">${count}<span class="quality-pct-sub">${p}%</span></div>
            </div>
        `;
    }).join('');
    return rows || '<div class="insight-empty">No classified moves.</div>';
}

function fenPhaseSignals(fen) {
    const board = String(fen || '').split(' ')[0] || '';
    let queens = 0;
    let nonPawnPieces = 0;
    let material = 0;
    const values = { q: 9, r: 5, b: 3, n: 3 };
    for (const ch of board) {
        const t = ch.toLowerCase();
        if (!values[t] && t !== 'q') continue;
        if (t === 'q') {
            queens += 1;
            nonPawnPieces += 1;
            material += 9;
        } else if (values[t]) {
            nonPawnPieces += 1;
            material += values[t];
        }
    }
    return { queens, nonPawnPieces, material };
}

function isEndgamePosition(signals) {
    // Queens off, or sparse remaining pieces / low non-pawn material
    return signals.queens === 0 || signals.nonPawnPieces <= 6 || signals.material <= 13;
}

/** Tag each ply as opening | middlegame | endgame. Endgame may never appear. */
function computeMovePhases(analysis) {
    const moves = analysis.moves || [];
    const phases = new Array(moves.length).fill('middlegame');
    if (!moves.length) return { phases, openingEnd: -1, endgameStart: null };

    let bookEnd = -1;
    for (let i = 0; i < moves.length; i++) {
        const label = moves[i].classification?.label;
        if (label === 'Book' || label === 'Theory') bookEnd = i;
        else break;
    }
    // Prefer book/theory span; otherwise treat first ~10 moves as opening
    let openingEnd = bookEnd >= 3 ? bookEnd : Math.min(moves.length - 1, 19);

    let endgameStart = null;
    for (let i = 0; i < moves.length; i++) {
        if (!moves[i].fen) continue;
        if (!isEndgamePosition(fenPhaseSignals(moves[i].fen))) continue;
        // Don't call it endgame during the early opening scramble
        if (i > Math.min(openingEnd, 15) || i >= 24) {
            endgameStart = i;
            break;
        }
    }
    if (endgameStart != null && openingEnd >= endgameStart) {
        openingEnd = endgameStart - 1;
    }

    for (let i = 0; i < moves.length; i++) {
        if (endgameStart != null && i >= endgameStart) phases[i] = 'endgame';
        else if (i <= openingEnd) phases[i] = 'opening';
        else phases[i] = 'middlegame';
    }
    return { phases, openingEnd, endgameStart };
}

function assignMovePhases(analysis) {
    const moves = analysis.moves || [];
    if (
        analysis?.movePhases?.length === moves.length &&
        analysis.openingEnd !== undefined
    ) {
        return {
            phases: analysis.movePhases,
            openingEnd: analysis.openingEnd,
            endgameStart: analysis.endgameStart ?? null
        };
    }
    const result = computeMovePhases(analysis);
    analysis.movePhases = result.phases;
    analysis.openingEnd = result.openingEnd;
    analysis.endgameStart = result.endgameStart;
    return result;
}

/**
 * Precompute Insights-tab inputs (phases, heat targets, piece survival, mate piece)
 * so opening the tab does not replay PGNs or walk every game cold.
 */
function enrichAnalysisMeta(analysis) {
    if (!analysis || analysis.metaEnriched) return analysis;

    assignMovePhases(analysis);

    if (!analysis.heatTargets) {
        const phaseKeys = ['opening', 'middlegame', 'endgame'];
        const buckets = { opening: {}, middlegame: {}, endgame: {} };
        const movePhases = analysis.movePhases || [];
        for (let i = 0; i < (analysis.moves || []).length; i++) {
            const m = analysis.moves[i];
            if (!isPlayerMove(analysis, m) || !m.to) continue;
            const phase = movePhases[i] || 'middlegame';
            if (!phaseKeys.includes(phase)) continue;
            const sq = orientSquareToPlayer(m.to, !!analysis.isWhite);
            buckets[phase][sq] = (buckets[phase][sq] || 0) + 1;
        }
        analysis.heatTargets = buckets;
    }

    if (!analysis.pieceSurvival && analysis.pgn && typeof trackPieceLifetimes === 'function') {
        const life = trackPieceLifetimes(analysis.pgn);
        analysis.pieceSurvival = analysis.isWhite ? life.white : life.black;
    }

    if (analysis.matePiece === undefined) {
        if (!wonByCheckmate(analysis)) {
            analysis.matePiece = null;
        } else {
            const last = analysis.moves?.[analysis.moves.length - 1];
            if (last && isPlayerMove(analysis, last)) {
                const san = String(last.san || '');
                if (san.includes('#')) {
                    if (san === 'O-O' || san === 'O-O-O') analysis.matePiece = 'k';
                    else if (/^[NBRQK]/.test(san)) analysis.matePiece = san[0].toLowerCase();
                    else analysis.matePiece = 'p';
                } else if (typeof matingPieceFromPgn === 'function') {
                    analysis.matePiece = matingPieceFromPgn(analysis.pgn);
                } else {
                    analysis.matePiece = null;
                }
            } else {
                analysis.matePiece = null;
            }
        }
    }

    analysis.metaEnriched = true;
    return analysis;
}

async function enrichAllAnalysesYielding(profile, yieldEvery = 6) {
    const games = profile?.analyzedGames || [];
    for (let i = 0; i < games.length; i++) {
        enrichAnalysisMeta(games[i]);
        if (yieldEvery > 0 && i % yieldEvery === yieldEvery - 1) {
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

let _analysisSnapshotTimer = null;

function scheduleAnalysisSnapshot(profile, opts = {}) {
    if (!profile) return;
    profile.analysisSnapshotDirty = true;
    const delay = opts.immediate ? 0 : (opts.delay ?? 280);
    if (_analysisSnapshotTimer) {
        if (!opts.immediate) return;
        clearTimeout(_analysisSnapshotTimer);
        _analysisSnapshotTimer = null;
    }
    _analysisSnapshotTimer = setTimeout(() => {
        _analysisSnapshotTimer = null;
        if (typeof rebuildAnalysisSnapshot === 'function') {
            rebuildAnalysisSnapshot(profile);
        }
        const active = document.querySelector('#dash-tabs .p-tabview-nav > li.p-highlight .p-tabview-nav-link')?.dataset?.tab;
        // Keep both panels warm so switching Coaching ↔ Game stats is instant
        if (active === 'coaching' || active === 'stats' || active === 'analysis') {
            paintCoachingTab(profile);
            paintStatsTab(profile);
        }
    }, delay);
}

function phaseMoveAccuracyScore(move, phase) {
    const label = move?.classification?.label;
    if (!label) return null;
    // In the opening, book/theory count as solid play for the star rating
    if (label === 'Book' || label === 'Theory') {
        return phase === 'opening' ? 92 : null;
    }
    return moveAccuracyScore(move);
}

function starsFromPhaseQuality(accuracy, ratedN, blunders) {
    if (!ratedN || accuracy == null) return null;
    let stars;
    if (accuracy >= 94) stars = 5;
    else if (accuracy >= 87) stars = 4;
    else if (accuracy >= 78) stars = 3;
    else if (accuracy >= 65) stars = 2;
    else stars = 1;
    if (blunders >= 3) stars = Math.min(stars, 1);
    else if (blunders >= 2) stars = Math.min(stars, 2);
    else if (blunders >= 1) stars = Math.min(stars, 4);
    return stars;
}

function sidePhaseBreakdown(analysis, forPlayer) {
    const { phases, endgameStart } = assignMovePhases(analysis);
    const keys = ['opening', 'middlegame', 'endgame'];
    const out = {};
    for (const key of keys) {
        const idxs = [];
        for (let i = 0; i < phases.length; i++) {
            if (phases[i] !== key) continue;
            const m = analysis.moves[i];
            if (!m?.classification?.label) continue;
            if (forPlayer ? !isPlayerMove(analysis, m) : isPlayerMove(analysis, m)) continue;
            idxs.push(i);
        }
        const moves = idxs.map(i => analysis.moves[i]);
        const counts = {};
        for (const q of MOVE_QUALITY_ORDER) counts[q.label] = 0;
        let accSum = 0;
        let ratedN = 0;
        let blunders = 0;
        for (const m of moves) {
            const label = m.classification.label;
            counts[label] = (counts[label] || 0) + 1;
            if (label === 'Blunder') blunders += 1;
            const score = phaseMoveAccuracyScore(m, key);
            if (score == null) continue;
            accSum += score;
            ratedN += 1;
        }
        const accuracy = ratedN ? Math.round((accSum / ratedN) * 10) / 10 : null;
        const reached = key === 'endgame'
            ? endgameStart != null
            : moves.length > 0;
        out[key] = {
            key,
            reached,
            moves,
            total: moves.length,
            ratedN,
            counts,
            blunders,
            accuracy,
            stars: reached ? starsFromPhaseQuality(accuracy, ratedN, blunders) : null
        };
    }
    // Opening with only book and no rated scores still gets stars from book accuracy
    if (out.opening.reached && out.opening.stars == null && out.opening.total) {
        out.opening.stars = starsFromPhaseQuality(out.opening.accuracy, out.opening.ratedN || out.opening.total, out.opening.blunders);
    }
    return { phases, endgameStart, segments: out };
}

function starsHtml(stars) {
    if (stars == null) {
        return `<span class="phase-stars na" title="Not applicable">N/A</span>`;
    }
    const full = Math.max(0, Math.min(5, stars));
    let html = '<span class="phase-stars" aria-label="' + full + ' out of 5 stars">';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="pi ${i <= full ? 'pi-star-fill' : 'pi-star'}"></i>`;
    }
    html += `<span class="phase-stars-num">${full}/5</span></span>`;
    return html;
}

function phaseRowsHtml(breakdown) {
    const labels = {
        opening: 'Opening',
        middlegame: 'Middlegame',
        endgame: 'Endgame'
    };
    return ['opening', 'middlegame', 'endgame'].map(key => {
        const seg = breakdown.segments[key];
        let meta;
        if (!seg.reached) {
            meta = key === 'endgame' ? 'Did not reach an endgame' : 'No moves in this phase';
        } else if (!seg.total) {
            meta = 'Phase reached · no moves for this side';
        } else {
            meta = `${seg.total} move${seg.total === 1 ? '' : 's'}${seg.accuracy != null ? ` · ${seg.accuracy}%` : ''}${seg.blunders ? ` · ${seg.blunders} blunder${seg.blunders === 1 ? '' : 's'}` : ''}`;
        }
        return `
            <div class="phase-row${!seg.reached ? ' is-na' : ''}">
                <div class="phase-row-label">${labels[key]}</div>
                <div class="phase-row-stars">${starsHtml(seg.reached ? seg.stars : null)}</div>
                <div class="phase-row-meta">${meta}</div>
            </div>
        `;
    }).join('');
}

function renderReviewCoachTab(analysis) {
    const el = document.getElementById('coach-tab');
    if (!el) return;
    el.innerHTML = typeof renderGameCoachNotes === 'function'
        ? `<div class="review-stats">${renderGameCoachNotes(analysis)}</div>`
        : '<div class="insight-empty">Coach notes unavailable for this game.</div>';
}

function renderReviewStatsTab(analysis) {
    const el = document.getElementById('stats-tab');
    if (!el) return;

    const you = sideMoveStats(analysis, true);
    const opp = sideMoveStats(analysis, false);
    const youName = analysis.isWhite ? 'You (White)' : 'You (Black)';
    const oppName = `Opponent (${analysis.isWhite ? 'Black' : 'White'})`;

    const chessComYou = analysis.isWhite ? analysis.whiteRating : analysis.blackRating;
    const chessComOpp = analysis.isWhite ? analysis.blackRating : analysis.whiteRating;

    const youPhases = sidePhaseBreakdown(analysis, true);
    const oppPhases = sidePhaseBreakdown(analysis, false);

    const eloCard = (label, stats, chessComElo, phaseBreakdown) => `
        <div class="game-elo-card">
            <div class="game-elo-kicker">${label}</div>
            <div class="game-elo-value">${formatGameEloLabel(stats.gameElo)}</div>
            <div class="game-elo-meta">
                ${chessComElo != null ? `Chess.com ${chessComElo} · ` : ''}
                ${stats.accuracy != null ? `${stats.accuracy}% accuracy` : 'No rated moves'}
                · ${stats.ratedN}/${stats.total} rated moves
                ${stats.gameElo >= (typeof GAME_ELO_IM === 'number' ? GAME_ELO_IM : 2400) ? ' · capped at title level' : ''}
            </div>
            <div class="game-elo-groups">
                <div class="game-elo-groups-title">Phase ratings</div>
                <div class="phase-list">${phaseRowsHtml(phaseBreakdown)}</div>
            </div>
            <div class="game-elo-groups">
                <div class="game-elo-groups-title">Moves by group</div>
                ${moveGroupRowsHtml(stats)}
            </div>
        </div>
    `;

    el.innerHTML = `
        <div class="review-stats">
            <div class="review-stats-title">Game ELO &amp; phases</div>
            <div class="game-elo-row">
                ${eloCard(youName, you, chessComYou, youPhases)}
                ${eloCard(oppName, opp, chessComOpp, oppPhases)}
            </div>
            <div class="review-stats-note">Phase stars rate your play in opening, middlegame, and endgame (N/A if that phase never happened). Game ELO is a rough guess from rated non-book moves — not your Chess.com rating. High accuracy caps at IM (~${typeof GAME_ELO_IM === 'number' ? GAME_ELO_IM : 2400}) / GM (~${typeof GAME_ELO_GM === 'number' ? GAME_ELO_GM : 2500}).</div>
        </div>
    `;
}

/** @deprecated — use renderReviewCoachTab + renderReviewStatsTab */
function renderReviewOverview(analysis) {
    renderReviewCoachTab(analysis);
    renderReviewStatsTab(analysis);
}

function goToMove(idx) {
    currentMoveIndex = idx;
    const m = currentReviewGame.moves[idx];
    renderBoard(m.fen, m);
    updateMoveCard(m);
    document.querySelectorAll('.move-row').forEach(r => r.classList.remove('active'));
    document.getElementById(`move-${idx}`)?.classList.add('active');
    document.querySelectorAll('.eval-line-dot').forEach(dot => {
        const isActive = Number(dot.dataset.moveIdx) === idx;
        const isKey = currentReviewGame.gameStory?.keyMoveIndex === Number(dot.dataset.moveIdx);
        dot.classList.toggle('is-active', isActive);
        if (!isKey) dot.setAttribute('r', isActive ? 4.5 : 3.5);
    });
}

/** Best-effort UCI → SAN using the position before the reviewed move. */
function uciToSanNearMove(move, uci) {
    if (!uci || uci.length < 4) return null;
    try {
        const afterFen = move?.fen;
        if (!afterFen) return null;
        // Rebuild prior FEN by undoing is awkward; probe from game PGN up to this move
        const g = currentReviewGame;
        if (!g?.pgn || g.moves?.indexOf(move) < 0) {
            // Fall back: apply UCI on a board one ply earlier via reverse from afterFen isn't reliable
            return null;
        }
        const idx = g.moves.indexOf(move);
        const chess = new Chess();
        if (!chess.load_pgn(g.pgn)) return null;
        const hist = chess.history({ verbose: true });
        const probe = new Chess();
        for (let i = 0; i < idx; i++) probe.move(hist[i]);
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : undefined;
        const mv = probe.move({ from, to, promotion });
        return mv?.san || null;
    } catch (_) {
        return null;
    }
}

function updateMoveCard(m) {
    const openingEl = document.getElementById('move-opening');
    const name = m.openingName || '';
    if (name) {
        openingEl.innerText = name;
        openingEl.classList.add('clickable');
        openingEl.title = m.classification?.label === 'Theory'
            ? 'Open this famous game in Learn'
            : 'Open this opening in Learn';
        openingEl.onclick = () => openLearningFromReview(name, m.classification?.label || '');
    } else {
        openingEl.innerText = '';
        openingEl.classList.remove('clickable');
        openingEl.title = '';
        openingEl.onclick = null;
    }
    document.getElementById('move-title').innerText = `${m.moveNum}${m.turn==='w'?'.':''} ${m.san}`;
    let desc = m.classification?.desc || '';
    if (m.evalDelta != null && m.classification?.label && !['Book', 'Theory'].includes(m.classification.label)) {
        const who = isPlayerMove(currentReviewGame, m) ? 'your' : 'opponent';
        desc += ` (${m.evalDelta.toFixed(1)} pawn ${who} eval loss)`;
    }
    document.getElementById('move-desc').innerText = desc;
    document.getElementById('move-badge').innerHTML = m.classification?.label
        ? `<span class="move-label ${m.classification.class}">${m.classification.label}</span>`
        : '';

    const altEl = document.getElementById('move-alt');
    if (altEl) {
        const playedUci = (m.from && m.to) ? (m.from + m.to).toLowerCase() : '';
        const candidate = (m.altEngineMoves || []).find(a =>
            a?.move && a.move.toLowerCase() !== playedUci
        );
        if (candidate?.move) {
            const san = uciToSanNearMove(m, candidate.move) || candidate.move;
            const scoreTxt = candidate.isMate
                ? `mate ${candidate.scoreCp}`
                : `${candidate.scoreCp >= 0 ? '+' : ''}${(candidate.scoreCp / 100).toFixed(1)}`;
            altEl.style.display = '';
            altEl.textContent = `Engine also liked ${san} (${scoreTxt} STM)`;
        } else {
            altEl.style.display = 'none';
            altEl.textContent = '';
        }
    }

    // Fixed reviewed-player perspective for the whole game (left = that colour)
    const playerRelativeEval = playerEvalAt(currentReviewGame, m);
    const fillPercent = Math.min(100, Math.max(0, 50 + (playerRelativeEval / 20)));
    document.getElementById('eval-fill').style.width = `${fillPercent}%`;

    const side = currentReviewGame.isWhite ? 'White' : 'Black';
    if (m.isMate) {
        const matePlies = Math.max(1, Math.abs(Math.round(playerRelativeEval / 1000)) || 1);
        document.getElementById('eval-label').innerText =
            (playerRelativeEval >= 0 ? 'M+' : 'M-') + matePlies;
    } else {
        const displayScore = (playerRelativeEval / 100).toFixed(1);
        document.getElementById('eval-label').innerText =
            (playerRelativeEval > 0 ? '+' : '') + displayScore;
    }
    document.getElementById('eval-bar').title =
        `${side} perspective · + is better for ${side.toLowerCase()}`;
}

function renderBoard(fen, move) {
    const board = document.getElementById('active-board');
    board.innerHTML = '';
    const chess = new Chess(fen);
    const pos = chess.board();
    const flip = !currentReviewGame.isWhite;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const ar = flip ? 7-r : r, ac = flip ? 7-c : c;
            const sq = document.createElement('div');
            const sqId = String.fromCharCode(97+ac) + (8-ar);
            sq.className = `square ${(ar+ac)%2===0?'white':'black'}`;
            if (sqId === move.from || sqId === move.to) sq.classList.add('highlight');
            const p = pos[ar][ac];
            if (p) {
                const img = document.createElement('img');
                img.className = 'piece';
                img.src = `https://lichess1.org/assets/piece/cburnett/${p.color}${p.type.toUpperCase()}.svg`;
                sq.appendChild(img);
            }
            board.appendChild(sq);
        }
    }

    const arrow = document.getElementById('best-move-arrow');
    if (move.bestEngineMove && !['Best', 'Book', 'Theory', 'Good'].includes(move.classification?.label)) {
        const fromSq = move.bestEngineMove.substring(0, 2);
        const toSq = move.bestEngineMove.substring(2, 4);
        
        const getCoords = (sq) => {
            const col = sq.charCodeAt(0) - 97;
            const row = 8 - parseInt(sq[1]);
            const fx = flip ? 7 - col : col;
            const fy = flip ? 7 - row : row;
            return { x: fx * 12.5 + 6.25, y: fy * 12.5 + 6.25 };
        };

        const start = getCoords(fromSq);
        const end = getCoords(toSq);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const angle = Math.atan2(dy, dx);
        const offset = 2.5; 
        
        arrow.setAttribute('x1', start.x);
        arrow.setAttribute('y1', start.y);
        arrow.setAttribute('x2', end.x - Math.cos(angle) * offset);
        arrow.setAttribute('y2', end.y - Math.sin(angle) * offset);
        arrow.setAttribute('display', 'block');
    } else {
        arrow.setAttribute('display', 'none');
    }
}

function stepMove(d) {
    if (!currentReviewGame?.moves?.length) return;
    const next = currentMoveIndex + d;
    if (next >= 0 && next < currentReviewGame.moves.length) goToMove(next);
}

function goToStart() {
    if (!currentReviewGame?.moves?.length) return;
    goToMove(0);
}

function goToEnd() {
    if (!currentReviewGame?.moves?.length) return;
    goToMove(currentReviewGame.moves.length - 1);
}

function goToKeyMove() {
    const idx = currentReviewGame?.gameStory?.keyMoveIndex;
    if (idx == null || !currentReviewGame?.moves?.length) return;
    goToMove(idx);
}

function switchTab(t, el) {
    // Legacy review "overview" mixed coaching + stats
    if (t === 'overview') t = 'coaching';
    const nav = el?.closest('.p-tabview-nav');
    if (nav) nav.querySelectorAll('li').forEach(li => li.classList.remove('p-highlight'));
    el?.closest('li')?.classList.add('p-highlight');
    const coachEl = document.getElementById('coach-tab');
    const statsEl = document.getElementById('stats-tab');
    if (coachEl) coachEl.style.display = t === 'coaching' ? 'block' : 'none';
    if (statsEl) statsEl.style.display = t === 'stats' ? 'block' : 'none';
    document.getElementById('moves-tab').style.display = t === 'moves' ? 'block' : 'none';
    document.getElementById('graph-tab').style.display = t === 'graph' ? 'block' : 'none';
}

function exitReview() {
    if (isDeepening) {
        isDeepening = false;
        for (const engine of engines) {
            try { engine.postMessage('stop'); } catch (_) {}
        }
    }
    currentReviewGame = null;
    document.getElementById('review-view').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    refreshDashboard();
}
