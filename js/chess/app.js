/* chess/app.js — Analyze Chess */

function setScanButtonsReady() {
    const btn = document.getElementById('btnScan');
    const single = document.getElementById('btnSingle');
    btn.disabled = false;
    btn.innerHTML = '<span class="p-button-icon-left pi pi-search"></span><span class="p-button-label">Review Profile</span>';
    if (single) {
        single.disabled = false;
        single.style.display = '';
    }
}

function setScanButtonsBusy(busy) {
    const btn = document.getElementById('btnScan');
    const single = document.getElementById('btnSingle');
    if (busy) {
        btn.style.display = 'none';
        if (single) single.style.display = 'none';
        document.getElementById('btnStop').style.display = 'inline-flex';
    } else {
        btn.style.display = '';
        if (single) single.style.display = '';
        document.getElementById('btnStop').style.display = 'none';
    }
}

async function initApp() {
    const btn = document.getElementById('btnScan');
    const single = document.getElementById('btnSingle');
    log(`Build ${APP_BUILD}`);
    
    log("Fetching opening book...");
    try {
        const bookRes = await fetch(EXTERNAL_BOOK_URL);
        if(bookRes.ok) {
            const data = await bookRes.json();
            setOpeningBook(data);
            log(`Opening book loaded (${ACTIVE_OPENING_BOOK.length} openings).`);
        } else {
            throw new Error("Source returned error " + bookRes.status);
        }
    } catch (e) {
        log(`Opening book failed (${e.message}). Using internal fallback.`, true);
        setOpeningBook(INTERNAL_BOOK);
    }

    log("Fetching famous games...");
    try {
        const famRes = await fetch(FAMOUS_GAMES_URL);
        if (!famRes.ok) throw new Error("Source returned error " + famRes.status);
        const famData = await famRes.json();
        setFamousGames(famData);
        log(`Famous games loaded (${ACTIVE_FAMOUS_GAMES.length} theory lines).`);
    } catch (e) {
        log(`Famous games failed (${e.message}). Using internal fallback.`, true);
        setFamousGames(INTERNAL_FAMOUS_GAMES);
    }

    // Learning + empty tab states are usable before a profile is loaded
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('profile-display-name').innerText = 'Analyze Chess';
    document.getElementById('profile-header-sub').innerText =
        "Load your chess.com profile or game to get a customised engine, with all processing done client side within the browser! Shows match analysis over the last 100 games played, as well as theory and opening analysis and deeper learning. Read the FAQ's for more info.";
    refreshDashboard();

    log(`Initializing up to ${PARALLEL_GAMES} engines (depth ${ENGINE_DEPTH})...`);
    try {
        const workerUrl = await resolveStockfishWorkerUrl();
        log(`Worker URL: ${workerUrl}`);

        engines = [];
        for (let i = 0; i < PARALLEL_GAMES; i++) {
            try {
                log(`Booting engine ${i + 1}/${PARALLEL_GAMES}...`);
                const eng = await createEngine(workerUrl, 60000);
                engines.push(eng);
                log(`Engine ${i + 1} ready.`);
            } catch (bootErr) {
                log(`Engine ${i + 1} failed: ${bootErr.message || bootErr}`, true);
                if (engines.length === 0) throw bootErr;
                log(`Continuing with ${engines.length} worker(s).`);
                break;
            }
        }

        enginesReady = true;
        setScanButtonsReady();
        log(`System Online (${engines.length} workers).`);
    } catch (err) { 
        log(`Engine Error: ${err.message}`, true);
        btn.innerHTML = '<span class="p-button-icon-left pi pi-exclamation-triangle"></span><span class="p-button-label">Engine Error</span>';
        if (single) {
            single.disabled = true;
            single.innerHTML = '<span class="p-button-icon-left pi pi-exclamation-triangle"></span><span class="p-button-label">Engine Error</span>';
        }
    }
}

function applyAnalysisToUi(game, analysis, gameKey, stats, opts = {}) {
    if (stats) {
        stats.blunders += analysis.blunders;
        stats.great += analysis.greatMoves;
        stats.book += analysis.bookCount;
    }
    if (game) {
        analysis.endTime = game.end_time || analysis.endTime || 0;
        analysis.pgn = game.pgn || analysis.pgn || '';
        analysis.resultDetail = (analysis.isWhite ? game.white.result : game.black.result) || analysis.resultDetail || '';
        analysis.oppResultDetail = (analysis.isWhite ? game.black.result : game.white.result) || analysis.oppResultDetail || '';
    }
    analysis.qualityScore = gameQualityScore(analysis);
    hydrateCachedAnalysis(analysis, analysis.pgn);
    ingestAnalysis(profileState, analysis, gameKey);
    if (!opts.deferRefresh) refreshDashboard();
}

async function fetchRecentGames(username, limit = SINGLE_GAME_PICK_LIMIT) {
    const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`);
    const data = await res.json();
    if (!data.archives || data.archives.length === 0) throw new Error('No games found');

    const archives = [...data.archives].reverse(); // newest month first
    const games = [];
    for (const archiveUrl of archives) {
        if (games.length >= limit) break;
        log(`Fetching archive ${archiveUrl.split('/').slice(-2).join('/')}...`);
        const gRes = await fetch(archiveUrl);
        const gData = await gRes.json();
        const monthGames = [...(gData.games || [])].reverse();
        for (const g of monthGames) {
            games.push(g);
            if (games.length >= limit) break;
        }
    }
    return games;
}

async function openSingleGamePicker() {
    const user = document.getElementById('username').value.trim();
    if (!user) {
        log('Enter a Chess.com username first.', true);
        document.getElementById('username').focus();
        return;
    }
    if (!enginesReady || isScanning || singleGameBusy) return;

    const overlay = document.getElementById('single-game-overlay');
    const status = document.getElementById('single-game-status');
    const list = document.getElementById('single-game-list');
    overlay.style.display = 'flex';
    status.innerText = `Loading last ${SINGLE_GAME_PICK_LIMIT} games for ${user}…`;
    list.innerHTML = '';
    singleGameChoices = [];
    const req = ++singleGamePickerReq;

    try {
        const games = await fetchRecentGames(user, SINGLE_GAME_PICK_LIMIT);
        if (req !== singleGamePickerReq) return;
        if (!games.length) throw new Error('No games found');

        singleGameChoices = games.map(game => {
            const isWhite = game.white.username.toLowerCase() === user.toLowerCase();
            return {
                game,
                gameKey: getGameKey(game),
                isWhite,
                result: normalizeResult(game, isWhite),
                opponent: isWhite ? game.black.username : game.white.username,
                endTime: game.end_time || 0
            };
        });

        status.innerText = `${singleGameChoices.length} recent game${singleGameChoices.length === 1 ? '' : 's'} · tap one to analyse`;
        list.innerHTML = singleGameChoices.map((item, i) => {
            const when = item.endTime
                ? new Date(item.endTime * 1000).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })
                : '';
            const cached = hasCachedAnalysis(user, item.gameKey);
            return `
                <button type="button" class="single-game-row" onclick="selectSingleGame(${i})">
                    <span class="single-game-result" style="color:${resultColor(item.result)}">${item.result}</span>
                    <span>
                        <span class="single-game-opp">vs ${item.opponent}</span>
                        <div class="single-game-meta">${when}${cached ? ' · cached' : ''}</div>
                    </span>
                    <span class="single-game-color">${item.isWhite ? 'White' : 'Black'}</span>
                </button>
            `;
        }).join('');
        log(`Single-game picker: ${singleGameChoices.length} games for ${user}.`);
    } catch (e) {
        status.innerText = `Could not load games: ${e.message}`;
        log(`Single-game picker failed: ${e.message}`, true);
    }
}

function closeSingleGamePicker() {
    if (singleGameBusy) return;
    singleGamePickerReq++;
    document.getElementById('single-game-overlay').style.display = 'none';
    singleGameChoices = [];
    document.getElementById('single-game-list').innerHTML = '';
}

async function selectSingleGame(index) {
    const user = document.getElementById('username').value.trim();
    const item = singleGameChoices[index];
    if (!item || !user || !enginesReady || singleGameBusy || isScanning) return;

    singleGameBusy = true;
    const status = document.getElementById('single-game-status');
    const list = document.getElementById('single-game-list');
    status.innerText = 'Analysing game…';
    list.querySelectorAll('.single-game-row').forEach(btn => { btn.disabled = true; });

    document.getElementById('progress-box').style.display = 'block';
    document.getElementById('progress-text').innerText = `Analysing vs ${item.opponent}…`;
    document.getElementById('prog-val-games').innerText = '1 / 1';
    document.getElementById('prog-val-moves').innerText = '0 / 0';
    document.getElementById('progress-fill').style.width = '0%';
    setScanButtonsBusy(true);

    try {
        let analysis = loadCachedAnalysis(user, item.gameKey);
        if (analysis) {
            log(`Single game loaded from cache: vs ${item.opponent}`);
            document.getElementById('progress-fill').style.width = '100%';
            hydrateCachedAnalysis(analysis, item.game.pgn || analysis.pgn);
            analysis.endTime = item.endTime || analysis.endTime || 0;
            analysis.pgn = item.game.pgn || analysis.pgn || '';
            analysis.resultDetail = (analysis.isWhite ? item.game.white.result : item.game.black.result) || analysis.resultDetail || '';
            analysis.oppResultDetail = (analysis.isWhite ? item.game.black.result : item.game.white.result) || analysis.oppResultDetail || '';
            analysis.qualityScore = analysis.qualityScore ?? gameQualityScore(analysis);
        } else {
            isScanning = true;
            const engine = engines[0];
            analysis = await analyzeGame(item.game, user, engine, (curr, total) => {
                document.getElementById('prog-val-moves').innerText = `${curr}/${total}`;
                document.getElementById('progress-fill').style.width = `${Math.round((curr / Math.max(total, 1)) * 100)}%`;
            });
            isScanning = false;
            if (!analysis) throw new Error('Analysis stopped or failed');
            saveCachedAnalysis(user, item.gameKey, analysis);
            log(`Single game analysed: vs ${item.opponent}`);
        }

        if (!profileState || profileState.username?.toLowerCase() !== user.toLowerCase()) {
            profileState = createProfileState(user);
        }
        ingestAnalysis(profileState, analysis, item.gameKey);
        refreshDashboard();

        singleGameBusy = false;
        closeSingleGamePicker();
        openReview(analysis);
    } catch (e) {
        isScanning = false;
        status.innerText = `Analysis failed: ${e.message}`;
        log(`Single-game analysis failed: ${e.message}`, true);
        list.querySelectorAll('.single-game-row').forEach(btn => { btn.disabled = false; });
    } finally {
        singleGameBusy = false;
        setScanButtonsBusy(false);
        document.getElementById('progress-box').style.display = 'none';
        if (!document.getElementById('btnScan').querySelector('.p-button-label')) {
            setScanButtonsReady();
        }
    }
}

async function fetchNewGamesToAnalyze(username, cachedKeys, limit = SCAN_NEW_LIMIT) {
    const res = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`);
    const data = await res.json();
    if (!data.archives || data.archives.length === 0) throw new Error("No games found");

    const archives = [...data.archives].reverse(); // newest month first
    const newGames = [];
    let cachedStreak = 0;
    let scanned = 0;
    let skippedCached = 0;

    for (const archiveUrl of archives) {
        if (!isScanning) break;
        if (newGames.length >= limit) break;
        if (cachedKeys.size && cachedStreak >= CACHE_CATCHUP_STREAK) break;

        log(`Fetching archive ${archiveUrl.split('/').slice(-2).join('/')}...`);
        const gRes = await fetch(archiveUrl);
        const gData = await gRes.json();
        const monthGames = [...(gData.games || [])].reverse();

        for (const g of monthGames) {
            if (!isScanning) break;
            if (newGames.length >= limit) break;
            scanned++;
            const gameKey = getGameKey(g);
            if (cachedKeys.has(gameKey) || hasCachedAnalysis(username, gameKey)) {
                skippedCached++;
                cachedStreak++;
                cachedKeys.add(gameKey);
                // Newest-first: once we've hit a run of known games, older months are already covered
                if (cachedKeys.size && cachedStreak >= CACHE_CATCHUP_STREAK) break;
                continue;
            }
            cachedStreak = 0;
            newGames.push({ game: g, gameKey });
        }
    }

    return { newGames, scanned, skippedCached };
}

async function startAnalysis() {
    const user = document.getElementById('username').value.trim();
    if (!user || !enginesReady || singleGameBusy) return;
    closeSingleGamePicker();
    isScanning = true;
    setScanButtonsBusy(true);
    document.getElementById('progress-box').style.display = 'block';
    document.getElementById('game-list-view').innerHTML = '';
    document.getElementById('filter-color').value = 'all';
    document.getElementById('filter-result').value = 'all';
    matchesSortLabel = null;

    profileState = createProfileState(user);
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('review-view').style.display = 'none';
    switchDashTab('overview');
    refreshDashboard();

    log(`Connecting to Chess.com for ${user}...`);
    try {
        try {
            profileState.playerInfo = await fetchPlayerProfile(user);
            refreshDashboard();
        } catch (pe) {
            log(`Profile header fetch failed: ${pe.message}`, true);
        }

        // Restore every game already processed at this CACHE_VERSION
        const cachedAnalyses = loadAllCachedAnalyses(user);
        const cachedKeys = new Set(cachedAnalyses.map(a => a.gameKey).filter(Boolean));
        profileState.analyzedGames = cachedAnalyses;
        sortAnalyzedGames(profileState);
        rebuildProfileAggregates(profileState);
        refreshDashboard();
        log(`Restored ${cachedAnalyses.length} cached game${cachedAnalyses.length === 1 ? '' : 's'} (v${CACHE_VERSION}).`);

        const { newGames, scanned, skippedCached } = await fetchNewGamesToAnalyze(user, cachedKeys, SCAN_NEW_LIMIT);
        const pending = newGames.map((item, i) => ({ ...item, index: i }));
        const stats = { blunders: 0, great: 0, book: 0 };
        let cacheSaves = 0;
        let completed = 0;
        const totalNew = pending.length;

        document.getElementById('prog-val-games').innerText = `0 / ${totalNew}`;
        document.getElementById('progress-fill').style.width = totalNew ? '0%' : '100%';
        log(`Archive scan: ${scanned} looked at · ${skippedCached} already cached · ${totalNew} new to analyze · profile has ${profileState.games} game${profileState.games === 1 ? '' : 's'}.`);

        if (!pending.length) {
            if (!profileState.games) throw new Error("No games found");
            profileState.finished = true;
            sortAnalyzedGames(profileState);
            renderProfileOverview(profileState);
            log('Nothing new to analyze — using cached games only.');
            stopAnalysis();
            return;
        }

        document.getElementById('prog-val-moves').innerText = `${Math.min(PARALLEL_GAMES, pending.length)} in parallel`;
        let nextIndex = 0;

        async function worker(engine) {
            while (isScanning) {
                const jobIdx = nextIndex++;
                if (jobIdx >= pending.length) break;
                const { index, game, gameKey } = pending[jobIdx];

                // Extra guard: never re-engine a game already at this cache version
                if (hasCachedAnalysis(user, gameKey)) {
                    const cached = loadCachedAnalysis(user, gameKey);
                    completed++;
                    document.getElementById('prog-val-games').innerText = `${completed} / ${totalNew}`;
                    document.getElementById('progress-fill').style.width = ((completed / totalNew) * 100) + '%';
                    if (cached) applyAnalysisToUi(game, cached, gameKey, stats);
                    continue;
                }

                const analysis = await analyzeGame(game, user, engine, (curr, moveTotal) => {
                    document.getElementById('prog-val-moves').innerText = `new ${index + 1}/${totalNew}: ${curr}/${moveTotal}`;
                });

                completed++;
                document.getElementById('prog-val-games').innerText = `${completed} / ${totalNew}`;
                document.getElementById('progress-fill').style.width = ((completed / totalNew) * 100) + '%';

                if (analysis) {
                    if (saveCachedAnalysis(user, gameKey, analysis)) cacheSaves++;
                    applyAnalysisToUi(game, analysis, gameKey, stats);
                }
            }
        }

        await Promise.all(engines.map(engine => worker(engine)));
        if (profileState) {
            profileState.finished = true;
            sortAnalyzedGames(profileState);
            renderProfileOverview(profileState);
        }
        log(isScanning
            ? `Done. Analyzed ${completed} new game${completed === 1 ? '' : 's'} · ${cacheSaves} saved · profile now ${profileState.games} total.`
            : `Stopped after ${completed} / ${totalNew} new games · profile has ${profileState.games} total.`);
    } catch (e) { log(`Analysis Error: ${e.message}`, true); }
    stopAnalysis();
}

function stopAnalysis() {
    isScanning = false;
    for (const engine of engines) {
        try { engine.postMessage('stop'); } catch (_) {}
    }
    if (profileState && profileState.games > 0) {
        profileState.finished = true;
        renderProfileOverview(profileState);
    }
    setScanButtonsBusy(false);
    if (enginesReady) setScanButtonsReady();
    document.getElementById('progress-box').style.display = 'none';
}

// HTML onclick / onload bridge
window.ChessApp = ChessApp;
window.startAnalysis = startAnalysis;
window.stopAnalysis = stopAnalysis;
window.openSingleGamePicker = openSingleGamePicker;
window.closeSingleGamePicker = closeSingleGamePicker;
window.selectSingleGame = selectSingleGame;
window.switchDashTab = switchDashTab;
window.focusUsernameInput = focusUsernameInput;
window.renderMatchesTab = renderMatchesTab;
window.switchTab = switchTab;
window.switchLearnSection = switchLearnSection;
window.toggleLearnGroup = toggleLearnGroup;
window.openLearningItem = openLearningItem;
window.closeLearningDetail = closeLearningDetail;
window.learningStep = learningStep;
window.learningGoStart = learningGoStart;
window.learningGoEnd = learningGoEnd;
window.openMatchesSortedByLabel = openMatchesSortedByLabel;
window.clearMatchesSort = clearMatchesSort;
window.openReviewFromStore = openReviewFromStore;
window.exitReview = exitReview;
window.goToStart = goToStart;
window.goToEnd = goToEnd;
window.goToKeyMove = goToKeyMove;
window.stepMove = stepMove;
window.onload = initApp;
