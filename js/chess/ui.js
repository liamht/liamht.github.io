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

/** Per-move accuracy 0–100 from eval loss / classification. Book/Theory excluded upstream. */
function moveAccuracyScore(move) {
    const label = move?.classification?.label;
    if (!label || label === 'Book' || label === 'Theory') return null;
    if (move.evalDeltaCp != null && Number.isFinite(move.evalDeltaCp)) {
        const pawns = Math.max(0, move.evalDeltaCp) / 100;
        // Harsh decay: 0→100, 0.5→~76, 1→~58, 2→~33, 4→~11
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
    return {
        moves,
        counts,
        total: moves.length,
        ratedN,
        accuracy,
        gameElo: estimateGameElo(accuracy, counts, ratedN)
    };
}

/**
 * Rough single-game performance rating.
 * Tuned so ~82% accuracy with blunders lands near club-novice, not mid-1500s.
 */
function estimateGameElo(accuracy, counts, ratedN) {
    if (accuracy == null || !Number.isFinite(accuracy) || !ratedN) return null;
    const a = Math.max(0, Math.min(100, accuracy)) / 100;
    // ~70%→~550, 80%→~920, 85%→~1150, 90%→~1450, 95%→~1900, 98%→~2250
    let elo = 80 + 2150 * Math.pow(a, 4.5);

    const best = counts.Best || 0;
    const blunders = counts.Blunder || 0;
    const mistakes = counts.Mistake || 0;
    const misses = counts.Miss || 0;
    const bestRate = best / ratedN;
    const badWeight = (blunders * 1.6 + mistakes + misses * 0.45) / ratedN;

    elo += (bestRate - 0.55) * 280;
    elo -= badWeight * 850;
    // Extra hit when multiple blunders appear in a short game
    if (blunders >= 2) elo -= 60 + (blunders - 2) * 35;

    return Math.round(Math.max(200, Math.min(2700, elo)));
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
                <span class="p-button-label">Browse Learning</span>
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

function switchDashTab(name, el) {
    document.querySelectorAll('#dash-tabs .p-tabview-nav > li').forEach(li => li.classList.remove('p-highlight'));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    const link = el?.classList?.contains('p-tabview-nav-link')
        ? el
        : document.querySelector(`#dash-tabs .p-tabview-nav-link[data-tab="${name}"]`);
    if (link) link.closest('li')?.classList.add('p-highlight');
    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');
    if (name === 'faq') renderFaqTab();
    if (name === 'learning') renderLearningBrowse();
    if (name === 'analysis') renderAnalysisTab(profileState);
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

function renderOverviewEloChart(profile) {
    const el = document.getElementById('overview-elo-chart');
    if (!el) return;

    const points = (profile.analyzedGames || [])
        .map(g => {
            attachGamePlayers(g, null, g.username || profile.username);
            return {
                g,
                elo: playerGameElo(g),
                t: g.endTime || 0
            };
        })
        .filter(p => p.elo != null && p.t > 0)
        .sort((a, b) => a.t - b.t);

    if (points.length < 2) {
        el.innerHTML = points.length === 1
            ? `<div class="insight-empty">Only one rated game so far (${points[0].elo}). More games will draw your ELO trend.</div>`
            : '<div class="insight-empty">ELO history needs rated games with timestamps. Keep analysing to fill this chart.</div>';
        return;
    }

    const W = 640;
    const H = 200;
    const pad = { t: 18, b: 28, l: 44, r: 14 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const elos = points.map(p => p.elo);
    let minE = Math.min(...elos);
    let maxE = Math.max(...elos);
    if (minE === maxE) {
        minE -= 50;
        maxE += 50;
    } else {
        const padE = Math.max(20, Math.round((maxE - minE) * 0.08));
        minE -= padE;
        maxE += padE;
    }
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const tSpan = Math.max(1, t1 - t0);

    const xAt = (t) => pad.l + ((t - t0) / tSpan) * plotW;
    const yAt = (elo) => pad.t + (1 - (elo - minE) / (maxE - minE)) * plotH;

    const linePts = points.map(p => `${xAt(p.t).toFixed(2)},${yAt(p.elo).toFixed(2)}`).join(' ');
    const areaPts = [
        `${xAt(points[0].t).toFixed(2)},${(pad.t + plotH).toFixed(2)}`,
        ...points.map(p => `${xAt(p.t).toFixed(2)},${yAt(p.elo).toFixed(2)}`),
        `${xAt(points[points.length - 1].t).toFixed(2)},${(pad.t + plotH).toFixed(2)}`
    ].join(' ');

    const first = points[0].elo;
    const last = points[points.length - 1].elo;
    const delta = last - first;
    const deltaLabel = (delta >= 0 ? '+' : '') + delta;

    const yTicks = 4;
    let grid = '';
    for (let i = 0; i <= yTicks; i++) {
        const elo = minE + ((maxE - minE) * i) / yTicks;
        const y = yAt(elo);
        grid += `<line class="elo-grid-line" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"></line>`;
        grid += `<text class="elo-axis-label" x="${pad.l - 6}" y="${y + 3}" text-anchor="end">${Math.round(elo)}</text>`;
    }

    const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const xLabels = `
        <text class="elo-axis-label" x="${pad.l}" y="${H - 8}" text-anchor="start">${fmtDate(t0)}</text>
        <text class="elo-axis-label" x="${W - pad.r}" y="${H - 8}" text-anchor="end">${fmtDate(t1)}</text>
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('elo-line-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Chess.com ELO over time');
    svg.innerHTML = `
        ${grid}
        <polygon class="elo-line-area" points="${areaPts}"></polygon>
        <polyline class="elo-line-path" points="${linePts}"></polyline>
        ${xLabels}
    `;

    points.forEach((p, idx) => {
        const cx = xAt(p.t);
        const cy = yAt(p.elo);
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('cx', cx);
        hit.setAttribute('cy', cy);
        hit.setAttribute('r', Math.max(7, plotW / Math.max(points.length, 1) / 2));
        hit.classList.add('elo-line-hit');
        const when = fmtDate(p.t);
        const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        tip.textContent = `${p.elo} · ${when} · ${p.g.result || ''}`;
        hit.appendChild(tip);
        hit.addEventListener('click', () => {
            if (p.g.gameKey) openReviewFromStore(p.g.gameKey);
        });
        svg.appendChild(hit);

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', cx);
        dot.setAttribute('cy', cy);
        dot.setAttribute('r', idx === points.length - 1 ? 4.5 : 3);
        dot.classList.add('elo-line-dot');
        if (idx === points.length - 1) dot.classList.add('is-latest');
        svg.appendChild(dot);
    });

    el.innerHTML = `
        <div class="elo-chart-summary">
            <span><strong>${last}</strong> latest</span>
            <span>${points.length} rated games</span>
            <span class="${delta >= 0 ? 'elo-up' : 'elo-down'}">${deltaLabel} across sample</span>
        </div>
    `;
    el.appendChild(svg);
}

function renderOverviewTab(profile) {
    if (!hasAnalyzedGames(profile)) {
        showTabEmpty('overview', profile
            ? {
                icon: 'pi-hourglass',
                title: 'Waiting for games',
                body: 'Your overview will fill in as games finish analyzing — ELO trend, move quality, best and worst games, and your last five results.'
            }
            : {
                icon: 'pi-chart-bar',
                title: 'No profile loaded',
                body: 'Enter a Chess.com username above and hit Review Profile to see your stats, or review a single game. You can browse Learning anytime.'
            });
        return;
    }
    showTabContent('overview');

    renderOverviewEloChart(profile);
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
                body: 'Analyzed games will land here as they finish. You can filter by colour and result once you have some.'
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
    let games = gamesByRecency(profileState)
        .filter(g => {
            if (color === 'white' && !g.isWhite) return false;
            if (color === 'black' && g.isWhite) return false;
            if (result !== 'all' && g.result !== result) return false;
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

/** Cheap paint from a prebuilt snapshot (openings always live from profile buckets). */
function paintAnalysisTab(profile) {
    if (!hasAnalyzedGames(profile)) return;
    showTabContent('analysis');

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
        const coach = document.getElementById('analysis-coach');
        if (coach) coach.innerHTML = '<div class="insight-empty">Building coach notes…</div>';
        const heat = document.getElementById('player-move-heatmap');
        if (heat) heat.innerHTML = '<div class="insight-empty">Building heatmaps…</div>';
        const surv = document.getElementById('analysis-piece-survival');
        if (surv) surv.innerHTML = '<div class="insight-empty">Building piece survival…</div>';
        const mates = document.getElementById('analysis-checkmates');
        if (mates) mates.innerHTML = '<div class="insight-empty">Building checkmate stats…</div>';
        document.getElementById('analysis-move-stats').innerHTML = qualityRowsHtml(profile);
        return;
    }

    renderPlayerMoveHeatmap(profile, snap.heat);
    renderCoachInsights(profile, snap.insights);
    renderPieceSurvivalPanel(profile, snap.survival);
    renderCheckmateWithPanel(profile, snap.mates);
    document.getElementById('analysis-move-stats').innerHTML = snap.moveStatsHtml || qualityRowsHtml(profile);
}

function renderAnalysisTab(profile) {
    if (!hasAnalyzedGames(profile)) {
        showTabEmpty('analysis', profile
            ? {
                icon: 'pi-hourglass',
                title: 'Nothing to dig into yet',
                body: "Once a few games are analyzed, you'll see player tendencies, coach notes by phase, and move stats."
            }
            : {
                icon: 'pi-chart-line',
                title: 'Analysis needs a profile',
                body: "Player tendencies, coach notes, opening trends, and deeper move stats show up after you've analyzed some Chess.com games."
            });
        return;
    }
    showTabContent('analysis');

    if (!analysisSnapshotIsFresh(profile)) {
        paintAnalysisTab(profile);
        scheduleAnalysisSnapshot(profile, { immediate: true });
        return;
    }
    paintAnalysisTab(profile);
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

function renderFaqTab() {
    const el = document.getElementById('faq-content');
    if (el.dataset.ready === '1') return;
    el.innerHTML = `
        <h3 style="margin:0 0 8px">How we classify your moves</h3>
        <p class="faq-def" style="margin-bottom:12px">Labels use Stockfish at depth ${ENGINE_DEPTH}. Centipawn loss is measured from your side, then we ignore the first ${EVAL_NOISE_FLOOR_CP}cp of noise before banding.</p>
        ${[
            ['Theory', 'Your move matches a famous game line from famous-games.json (at least 12 plies of SAN continuity from move one).'],
            ['Book', 'Still inside our opening book (FEN / move-list), and not already tagged Theory.'],
            ['Best', 'You played the engine top move, OR post-noise eval loss ≤ 0.50 pawns.'],
            ['Good', 'Post-noise eval loss ≤ 1.20 pawns (slight pull, still healthy).'],
            ['Okay', 'Post-noise eval loss ≤ 2.00 pawns. Also the cap when the engine sample is marked unreliable (never Mistake/Blunder then).'],
            ['Miss', 'Post-noise eval loss ≤ 3.00 pawns — something clearly better was available.'],
            ['Mistake', 'Post-noise eval loss ≤ 4.50 pawns — real damage to the position.'],
            ['Blunder', 'Post-noise eval loss > 4.50 pawns — catastrophic eval collapse.']
        ].map(([term, def]) => `
            <div class="faq-item">
                <div class="faq-term">${term}</div>
                <div class="faq-def">${def}</div>
            </div>
        `).join('')}
        <h3 style="margin:18px 0 8px">Material events (from our code)</h3>
        <div class="faq-item">
            <div class="faq-term">Take / capture</div>
            <div class="faq-def">You captured a piece and, after a short lookahead of the next few moves, the material balance is still in your favour (sequence net &gt; 0). We may phrase it as “Took the …” or “Won the …”.</div>
            <div class="faq-code">capturedPiece && sequenceNet &gt; 0 → kind: 'capture'</div>
        </div>
        <div class="faq-item">
            <div class="faq-term">Exchange</div>
            <div class="faq-def">You captured, but the immediate material swing is roughly even (|immediateNet| ≤ 1). Tracked as an exchange, not a win of material.</div>
            <div class="faq-code">capturedPiece && |immediateNet| ≤ 1 → kind: 'exchange'</div>
        </div>
        <div class="faq-item">
            <div class="faq-term">Hang</div>
            <div class="faq-def">After your move, one of your pieces (usually the highest-value newly hanging piece) is en prise and was not hanging before. We treat it as a hang if the opponent takes it in the lookahead, or the move is already Miss/Mistake/Blunder, or the offer is not compensated.</div>
            <div class="faq-code">primaryHang && (hangTaken || isNegative || !compensated) → kind: 'hang'</div>
        </div>
        <div class="faq-item">
            <div class="faq-term">Sacrifice</div>
            <div class="faq-def">You appear to offer material (hanging a piece, or moving onto a square that gets taken, or capturing down in value while leaving your piece hanging), but the sequence is compensated (lookahead net recovers) or the eval still supports it, and the move is not labelled Miss/Mistake/Blunder.</div>
            <div class="faq-code">looksLikeOffer && (compensated || evalSupportsSac) && !isNegative → kind: 'sacrifice'</div>
        </div>
        <div class="faq-item">
            <div class="faq-term">Missed capture</div>
            <div class="faq-def">The engine’s best move would take a hanging opponent piece on a different square than what you played.</div>
            <div class="faq-code">best move captures hanging opponent piece you ignored → kind: 'missed_capture'</div>
        </div>
    `;
    el.dataset.ready = '1';
}

function refreshDashboard() {
    document.getElementById('dashboard').style.display = 'block';
    if (profileState) renderProfileHeader(profileState);
    const active = document.querySelector('#dash-tabs .p-tabview-nav > li.p-highlight .p-tabview-nav-link')?.dataset?.tab || 'overview';
    renderOverviewTab(profileState);
    if (active === 'matches') renderMatchesTab();
    if (active === 'analysis') {
        // Never rebuild heavy analysis work on every game tick — paint snapshot / schedule
        if (analysisSnapshotIsFresh(profileState)) paintAnalysisTab(profileState);
        else {
            paintAnalysisTab(profileState);
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
    card.innerHTML = `
        <div class="p-card-body" style="text-align:left">
            <div class="font-bold text-lg game-matchup-title">${gameMatchupTitle(analysis)}</div>
            <div class="text-primary text-sm mb-2">${analysis.openingName || ''}</div>
            <div class="flex justify-content-between align-items-center">
                <span class="text-color-secondary text-sm">${analysis.isWhite ? 'White' : 'Black'} · ${analysis.moves.length} moves</span>
                <span class="p-tag p-component" style="background:${resultColor}">${analysis.result}</span>
            </div>
            ${sortLine}
            ${story}
        </div>
    `;
    list.appendChild(card);
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
    renderReviewOverview(analysis);

    // Default to Overview tab
    const reviewNav = document.querySelector('#review-view .p-tabview-nav');
    if (reviewNav) {
        reviewNav.querySelectorAll('li').forEach((li, i) => li.classList.toggle('p-highlight', i === 0));
    }
    document.getElementById('overview-tab').style.display = 'block';
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
 * Precompute Analysis-tab inputs (phases, heat targets, piece survival, mate piece)
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
        if (active === 'analysis') paintAnalysisTab(profile);
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

function renderReviewOverview(analysis) {
    const el = document.getElementById('overview-tab');
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
            <div class="game-elo-value">${stats.gameElo != null ? stats.gameElo : '—'}</div>
            <div class="game-elo-meta">
                ${chessComElo != null ? `Chess.com ${chessComElo} · ` : ''}
                ${stats.accuracy != null ? `${stats.accuracy}% accuracy` : 'No rated moves'}
                · ${stats.ratedN}/${stats.total} rated moves
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
            ${typeof renderGameCoachNotes === 'function' ? renderGameCoachNotes(analysis) : ''}
            <div class="review-stats-title">Game ELO &amp; phases</div>
            <div class="game-elo-row">
                ${eloCard(youName, you, chessComYou, youPhases)}
                ${eloCard(oppName, opp, chessComOpp, oppPhases)}
            </div>
            <div class="review-stats-note">Phase stars rate your play in opening, middlegame, and endgame (N/A if that phase never happened). Game ELO is a rough guess from rated non-book moves — not your Chess.com rating.</div>
        </div>
    `;
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

function updateMoveCard(m) {
    const openingEl = document.getElementById('move-opening');
    const name = m.openingName || '';
    if (name) {
        openingEl.innerText = name;
        openingEl.classList.add('clickable');
        openingEl.title = m.classification?.label === 'Theory'
            ? 'Open this famous game in Learning'
            : 'Open this opening in Learning';
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
    const nav = el?.closest('.p-tabview-nav');
    if (nav) nav.querySelectorAll('li').forEach(li => li.classList.remove('p-highlight'));
    el?.closest('li')?.classList.add('p-highlight');
    document.getElementById('overview-tab').style.display = t === 'overview' ? 'block' : 'none';
    document.getElementById('moves-tab').style.display = t === 'moves' ? 'block' : 'none';
    document.getElementById('graph-tab').style.display = t === 'graph' ? 'block' : 'none';
}

function exitReview() {
    document.getElementById('review-view').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    refreshDashboard();
}
