/* chess/insights.js — narrative coach notes for the Analysis tab */

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

    for (const g of games) {
        const { phases, openingEnd, endgameStart } = assignMovePhases(g);
        const phaseSeen = { opening: false, middlegame: false, endgame: false };

        bookDepths.push(openingEnd >= 0 ? openingEnd + 1 : 0);

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

        if (endgameStart != null && g.moves[endgameStart]?.fen) {
            endgameEntered += 1;
            const mat = sideMaterialFromFen(g.moves[endgameStart].fen);
            const mine = g.isWhite ? mat.white : mat.black;
            const theirs = g.isWhite ? mat.black : mat.white;
            const down = mine < theirs;
            if (down) endgameEnteredDown += 1;
            if (g.result === 'LOSS') {
                endgameLosses += 1;
                if (down) endgameLossesEnteredDown += 1;
            }
        }

        if (g.result === 'LOSS') {
            const keyIdx = g.gameStory?.keyMoveIndex;
            if (keyIdx != null && phases[keyIdx]) lossPhase[phases[keyIdx]] += 1;
            else lossPhase.unknown += 1;
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
                bucket.themes[t] = (bucket.themes[t] || 0) + 1;
            }
            if (m.materialEvent) bucket.material.push(m.materialEvent);

            const piece = movedPieceType(m);
            if (phase === 'opening' && piece === 'b' && m.moveNum <= 4) {
                const ev = m.materialEvent;
                if (ev && (ev.kind === 'sacrifice' || ev.kind === 'hang') && (ev.offered === 'b' || !ev.offered)) {
                    earlyBishopSacs.push({ m, ev, g });
                }
            }
            if (phase === 'middlegame' && piece === 'n') {
                knightDevelops.push(m);
                if (m.materialEvent?.kind === 'exchange' || (m.materialEvent?.kind === 'capture' && m.materialEvent?.offered === 'n')) {
                    knightExchanges.push(m);
                }
            }
            if (phase === 'endgame' && m.fen && onlyPawnsOrKings(m.fen)) {
                pawnEndgameMoves += 1;
                if (label === 'Blunder' || label === 'Mistake') pawnEndgameBlunders += 1;
            }
        }
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
        lossPhase
    };
}

function phaseQualitySummary(bucket) {
    const total = bucket.moves.length;
    if (!total) return null;
    const blunders = bucket.labels.Blunder || 0;
    const mistakes = bucket.labels.Mistake || 0;
    const best = bucket.labels.Best || 0;
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

function avg(nums) {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildOverviewInsights(profile, corpus) {
    const lines = [];
    const games = corpus.games;
    if (!games) return ['Analyse a handful of games and this overview will fill in with patterns from your play.'];

    const wr = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
    const whiteWr = profile.whiteGames ? Math.round((profile.whiteWins / profile.whiteGames) * 100) : null;
    const blackWr = profile.blackGames ? Math.round((profile.blackWins / profile.blackGames) * 100) : null;
    lines.push(
        `Across ${games} analyzed game${games === 1 ? '' : 's'} you’re scoring ${wr}% wins` +
        (whiteWr != null && blackWr != null
            ? ` (${whiteWr}% as White · ${blackWr}% as Black).`
            : '.')
    );

    const labels = profile.moveLabels || {};
    const moves = profile.playerMoves || 0;
    if (moves >= 20) {
        const bl = labels.Blunder || 0;
        const best = labels.Best || 0;
        const blPct = Math.round((bl / moves) * 1000) / 10;
        const bestPct = Math.round((best / moves) * 1000) / 10;
        lines.push(
            `On the move sheet: ${bestPct}% Best moves versus ${blPct}% Blunders — ` +
            (blPct >= 8
                ? 'the swings from those blunders are doing a lot of damage.'
                : bestPct >= 40
                    ? 'you’re finding plenty of engine-approved ideas when the position is calm.'
                    : 'there’s room to convert more “okay” positions into clean Best/Good moves.')
        );
    }

    const lossParts = [];
    for (const phase of ['opening', 'middlegame', 'endgame']) {
        if (corpus.lossPhase[phase]) {
            lossParts.push(`${corpus.lossPhase[phase]} decided in the ${phase}`);
        }
    }
    if (profile.losses && lossParts.length) {
        lines.push(`When you lose, the key moment is most often: ${lossParts.join(', ')}.`);
    }

    const leak = topTheme(
        Object.fromEntries(
            Object.entries(profile.themeHits || {}).filter(([id]) => !PROFILE_SKIP_THEMES.has(id))
        ),
        'bad',
        Math.max(2, Math.floor(games * 0.15))
    );
    const strength = topTheme(
        Object.fromEntries(
            Object.entries(profile.themeHits || {}).filter(([id]) => !PROFILE_SKIP_THEMES.has(id))
        ),
        'good',
        Math.max(2, Math.floor(games * 0.15))
    );
    if (strength) {
        lines.push(`A recurring strength: ${strength.cat.detail}`);
    }
    if (leak) {
        lines.push(`Your loudest leak right now: ${leak.cat.detail}`);
    }

    if (corpus.endgameEntered >= 3 && corpus.endgameEnteredDown / corpus.endgameEntered >= 0.55) {
        const pctDown = Math.round((corpus.endgameEnteredDown / corpus.endgameEntered) * 100);
        lines.push(
            `You reach an endgame in ${corpus.endgameEntered} games, but enter it down on material ${pctDown}% of the time — so many losses are already decided before the last phase starts.`
        );
    }

    return lines;
}

function buildOpeningInsights(profile, corpus) {
    const lines = [];
    const bucket = corpus.byPhase.opening;
    const fav = favouriteOpeningLine(profile);
    const avgBookPlies = avg(corpus.bookDepths);
    const avgFullMoves = Math.round((avgBookPlies / 2) * 10) / 10;

    if (fav) {
        const v = fav.entry.variations?.[0]?.name;
        const depthNote = avgFullMoves <= 3.5
            ? `but you rarely steer it deeper than about ${Math.max(2, Math.round(avgFullMoves))} moves before the game leaves your comfort book`
            : avgFullMoves <= 6
                ? `and you typically stay in known waters for around ${avgFullMoves} moves`
                : `and you’re happy to go deep — averaging about ${avgFullMoves} moves of book/theory`;
        lines.push(
            `You favour the ${fav.entry.name} as ${fav.side}` +
            (v && v !== fav.entry.name ? ` (often the ${v} flavour)` : '') +
            `, ${depthNote}.`
        );
        if (fav.entry.count >= 3) {
            lines.push(
                `In that family you’re ${fav.entry.wins}-${fav.entry.losses}-${fav.entry.draws} ` +
                `(${fav.entry.winRate}% wins across ${fav.entry.count} games).`
            );
        }
    } else {
        lines.push('Your openings are still mixed — no single family dominates yet.');
    }

    const brokeTotal = corpus.oppBrokeFirst + corpus.youBrokeFirst;
    if (brokeTotal >= 4) {
        const oppPct = Math.round((corpus.oppBrokeFirst / brokeTotal) * 100);
        if (oppPct >= 58) {
            lines.push(
                `Opponents leave book/theory before you do in about ${oppPct}% of games — they break the pattern first, and you’re often reacting rather than steering.`
            );
        } else if (oppPct <= 42) {
            lines.push(
                `You’re usually the one to leave the book first (${100 - oppPct}% of the time), so middlegame plans start on your terms more often than not.`
            );
        } else {
            lines.push('You and your opponents leave theoretical lines at a fairly even rate.');
        }
    }

    if (corpus.earlyBishopSacs.length >= 2) {
        const n = corpus.earlyBishopSacs.length;
        const badNet = corpus.earlyBishopSacs.filter(x => (x.ev.net || 0) <= 0 || x.ev.kind === 'hang').length;
        lines.push(
            `When you develop a bishop early (around move 2–4), it turns into a sacrifice or hang in ${n} spot${n === 1 ? '' : 's'}` +
            (badNet >= Math.ceil(n * 0.5)
                ? ' — often for not much concrete material back.'
                : '.')
        );
    }

    const q = phaseQualitySummary(bucket);
    if (q && q.rated >= 8) {
        if (q.blunderRate >= 0.08) {
            lines.push(`Opening blunders are showing up on ${(q.blunderRate * 100).toFixed(0)}% of your opening moves — those early slips are hard to recover from.`);
        } else if (q.bestRate >= 0.45) {
            lines.push('Your opening move quality is actually a relative strength: lots of Best/Good choices while still in the early phase.');
        }
    }

    if (!lines.length) {
        lines.push('Not enough opening samples yet for a first read — keep analysing games.');
    }
    return lines;
}

function buildMiddlegameInsights(profile, corpus) {
    const lines = [];
    const bucket = corpus.byPhase.middlegame;
    const q = phaseQualitySummary(bucket);

    if (!bucket.moves.length) {
        return ['Many of your games skim past a clear middlegame (short miniatures or early endgames). Analyse longer games to flesh this out.'];
    }

    const develop = bucket.themes.developed_piece || 0;
    const knightN = corpus.knightDevelops.length;
    const knightX = corpus.knightExchanges.length;
    if (knightN >= 6) {
        const tradePct = Math.round((knightX / knightN) * 100);
        if (tradePct >= 35) {
            lines.push(
                `You develop knights actively in the middlegame, but they often look “one and done” — about ${tradePct}% of those knight moves are tied to an immediate exchange or capture sequence, so the piece doesn’t stay to dominate a square.`
            );
        } else {
            lines.push(
                `Your knights are showing up as useful middlegame workers — only about ${tradePct}% of knight moves are immediate trades, so they often keep a longer post.`
            );
        }
    } else if (develop >= 4) {
        lines.push('Development themes keep appearing in your middlegames — you’re still trying to complete the army even after the opening label ends.');
    }

    const hung = bucket.themes.hung_piece || 0;
    const forks = bucket.themes.fork_victim || 0;
    const missed = bucket.themes.missed_hanging || 0;
    const won = bucket.themes.won_material || 0;
    if (hung >= 3) {
        lines.push(`Loose pieces are a middlegame theme: hung-piece moments showed up ${hung} times — worth a slow check for unprotected units before you commit.`);
    }
    if (forks >= 3) {
        lines.push(`You’re walking into forks (${forks}× in this sample) more than you’d like — watch knight checks and double attacks when the position opens.`);
    }
    if (missed >= 3 && missed > won) {
        lines.push(`You miss hanging enemy material (${missed}×) more often than you cash in wins of material — train a “free piece?” scan each turn.`);
    } else if (won >= 3) {
        lines.push(`When tactics land, you do convert material (${won}× won-material themes) — keep forcing those concrete wins.`);
    }

    if (q && q.rated >= 10) {
        const blPct = Math.round(q.blunderRate * 100);
        const bestPct = Math.round(q.bestRate * 100);
        if (blPct >= 10) {
            lines.push(`Middlegame is where accuracy dips hardest right now: ~${blPct}% of moves are Blunders, with Best moves only around ${bestPct}% of rated tries.`);
        } else if (bestPct >= 40) {
            lines.push(`Middlegame calculation looks healthier: about ${bestPct}% Best among rated moves and a blunder rate near ${blPct}%.`);
        } else {
            lines.push(`Middlegame play is mixed — roughly ${bestPct}% Best moves and ${blPct}% Blunders among your rated moves in this phase.`);
        }
    }

    const heat = buildPhaseColorHeatmaps(profile);
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
            lines.push(
                `As ${color === 'white' ? 'White' : 'Black'}, your middlegame pieces keep landing on ${hotSq.toUpperCase()} (${hotN}×) — a habit square worth reviewing for whether it’s a strong outpost or a trade magnet.`
            );
            break;
        }
    }

    if (!lines.length) {
        lines.push('Middlegame patterns are still forming — more games will sharpen this read.');
    }
    return lines;
}

function buildEndgameInsights(profile, corpus) {
    const lines = [];
    const bucket = corpus.byPhase.endgame;
    const q = phaseQualitySummary(bucket);

    if (!corpus.endgameEntered) {
        return ['Few of these games reach a true endgame (queens off / sparse material). When they do, we’ll rate how you convert or defend.'];
    }

    const enterPct = Math.round((corpus.endgameEntered / corpus.games) * 100);
    lines.push(
        `You reach endgame conditions in ${corpus.endgameEntered}/${corpus.games} games (${enterPct}%).`
    );

    if (corpus.endgameEntered >= 3) {
        const downPct = Math.round((corpus.endgameEnteredDown / corpus.endgameEntered) * 100);
        if (downPct >= 50) {
            lines.push(
                `However, you often enter the endgame already down on material (${downPct}% of those games)` +
                (corpus.endgameLossesEnteredDown >= 2
                    ? ' — and that deficit shows up again and again in your losses.'
                    : '.')
            );
        } else if (downPct <= 30) {
            lines.push(`You usually arrive in the endgame level or ahead on material (only ${downPct}% start down) — a good platform to convert.`);
        }
    }

    if (q && q.total >= 8) {
        const blPct = Math.round(q.blunderRate * 100);
        if (blPct <= 4) {
            lines.push(`Once you’re there, you’re relatively clean: only ~${blPct}% of endgame moves are Blunders.`);
        } else if (blPct >= 12) {
            lines.push(`Endgame technique is shaky in this sample — about ${blPct}% of endgame moves are Blunders, so won/drawn endings are slipping away.`);
        } else {
            lines.push(`Endgame move quality is middling (~${blPct}% blunders) — not a disaster, but conversion practice would pay off.`);
        }
    }

    if (corpus.pawnEndgameMoves >= 10) {
        const bad = corpus.pawnEndgameBlunders;
        const badPct = Math.round((bad / corpus.pawnEndgameMoves) * 100);
        if (badPct <= 5) {
            lines.push('With just pawns (and kings) left you’re at your best — serious errors almost disappear in those endings.');
        } else {
            lines.push(`Even in pawn endings you’re not fully safe yet — ${badPct}% of those moves are still Mistakes/Blunders.`);
        }
    }

    const backRank = bucket.themes.back_rank || 0;
    if (backRank >= 2) {
        lines.push(`Back-rank themes still bite in the ending (${backRank}×) — make luft before the heavy pieces come in.`);
    }

    if (lines.length === 1) {
        lines.push('Keep collecting longer games to say more about your technical phase.');
    }
    return lines;
}

function generateProfileInsights(profile) {
    const corpus = collectInsightCorpus(profile);
    return {
        overview: buildOverviewInsights(profile, corpus),
        opening: buildOpeningInsights(profile, corpus),
        middlegame: buildMiddlegameInsights(profile, corpus),
        endgame: buildEndgameInsights(profile, corpus),
        corpus
    };
}

function insightParagraphsHtml(lines) {
    if (!lines?.length) return '<div class="insight-empty">No notes yet.</div>';
    return lines.map(t => `<p class="coach-line">${escInsightHtml(t)}</p>`).join('');
}

function renderCoachInsights(profile) {
    const root = document.getElementById('analysis-coach');
    if (!root) return;
    const insights = generateProfileInsights(profile);
    root.innerHTML = `
        <div class="coach-block">
            <div class="coach-kicker">Overview</div>
            ${insightParagraphsHtml(insights.overview)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Opening</div>
            ${insightParagraphsHtml(insights.opening)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Middlegame</div>
            ${insightParagraphsHtml(insights.middlegame)}
        </div>
        <div class="coach-block">
            <div class="coach-kicker">Endgame</div>
            ${insightParagraphsHtml(insights.endgame)}
        </div>
    `;
}
