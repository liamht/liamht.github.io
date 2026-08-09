/* chess/constants.js — Analyze Chess */

// --- config & shared state ---

const STOCKFISH_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';
const STOCKFISH_LOCAL = 'stockfish.js?v=20260803';
const APP_BUILD = '2026-08-09c';
const CACHE_VERSION = 8;
// Relative to the page URL so this works on a server and when opened locally
const EXTERNAL_BOOK_URL = 'openings.json';
const FAMOUS_GAMES_URL = 'famous-games.json';
const ENGINE_DEPTH = 5;
const EVAL_NOISE_FLOOR_CP = 100; // ignore first 1.0 pawn of depth-5 wobble
/** Opt-in deeper analysis when reviewing a single game. */
const REVIEW_ENGINE_DEPTH = 12;
const REVIEW_MULTIPV = 2;
const REVIEW_ENGINE_TIMEOUT_MS = 8000;
/** Max NEW (uncached) games to analyze in one scan. Cached games accumulate beyond this. */
const SCAN_NEW_LIMIT = 100;
/** Newest-first archive walk stops after this many consecutive already-cached games. */
const CACHE_CATCHUP_STREAK = 10;
/** Games shown in the single-game picker. */
const SINGLE_GAME_PICK_LIMIT = 10;
const PARALLEL_GAMES = Math.min(4, navigator.hardwareConcurrency || 4);

const INTERNAL_BOOK = [
    { name: "Ruy Lopez", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
    { name: "Ruy Lopez: Morphy Defense", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"] },
    { name: "Italian Game", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
    { name: "Italian Game: Giuoco Piano", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"] },
    { name: "Scotch Game", moves: ["e4", "e5", "Nf3", "Nc6", "d4"] },
    { name: "Four Knights Game", moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Nf6"] },
    { name: "Sicilian Defense", moves: ["e4", "c5"] },
    { name: "Sicilian Defense: Najdorf Variation", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"] },
    { name: "Sicilian Defense: Dragon Variation", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "g6"] },
    { name: "French Defense", moves: ["e4", "e6"] },
    { name: "French Defense: Advance Variation", moves: ["e4", "e6", "d4", "d5", "e5"] },
    { name: "Caro-Kann Defense", moves: ["e4", "c6"] },
    { name: "Caro-Kann Defense: Classical Variation", moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"] },
    { name: "Pirc Defense", moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"] },
    { name: "Modern Defense", moves: ["e4", "g6"] },
    { name: "Queen's Gambit", moves: ["d4", "d5", "c4"] },
    { name: "Queen's Gambit Declined", moves: ["d4", "d5", "c4", "e6"] },
    { name: "Queen's Gambit Accepted", moves: ["d4", "d5", "c4", "dxc4"] },
    { name: "Indian Defense", moves: ["d4", "Nf6"] },
    { name: "King's Indian Defense", moves: ["d4", "Nf6", "c4", "g6"] },
    { name: "Nimzo-Indian Defense", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
    { name: "English Opening", moves: ["c4"] },
    { name: "Reti Opening", moves: ["Nf3", "d5"] },
    { name: "London System", moves: ["d4", "d5", "Nf3", "Nf6", "Bf4"] }
];

const ChessApp = {
    openingBook: INTERNAL_BOOK,
    openingFenMap: null,
    openingBookSource: 'internal',
    famousGames: [],
    famousGamesSource: 'internal',
    engines: [],
    enginesReady: false,
    isScanning: false,
    isDeepening: false,
    currentReviewGame: null,
    currentMoveIndex: -1,
    profileState: null,
    matchesSortLabel: null,
    learnSection: 'openings',
    learnOpenGroups: new Set(),
    learnDetail: null,
    singleGameChoices: [],
    singleGameBusy: false,
    singleGamePickerReq: 0,
    learnLesson: null
};

// Compatibility accessors used across modules (classic script globals)
Object.defineProperties(window, {
    ACTIVE_OPENING_BOOK: {
        get() { return ChessApp.openingBook; },
        set(v) { ChessApp.openingBook = v; }
    },
    OPENING_FEN_MAP: {
        get() { return ChessApp.openingFenMap; },
        set(v) { ChessApp.openingFenMap = v; }
    },
    ACTIVE_FAMOUS_GAMES: {
        get() { return ChessApp.famousGames; },
        set(v) { ChessApp.famousGames = v; }
    },
    engines: {
        get() { return ChessApp.engines; },
        set(v) { ChessApp.engines = v; }
    },
    enginesReady: {
        get() { return ChessApp.enginesReady; },
        set(v) { ChessApp.enginesReady = v; }
    },
    isScanning: {
        get() { return ChessApp.isScanning; },
        set(v) { ChessApp.isScanning = v; }
    },
    isDeepening: {
        get() { return ChessApp.isDeepening; },
        set(v) { ChessApp.isDeepening = v; }
    },
    openingBookSource: {
        get() { return ChessApp.openingBookSource; },
        set(v) { ChessApp.openingBookSource = v; }
    },
    famousGamesSource: {
        get() { return ChessApp.famousGamesSource; },
        set(v) { ChessApp.famousGamesSource = v; }
    },
    currentReviewGame: {
        get() { return ChessApp.currentReviewGame; },
        set(v) { ChessApp.currentReviewGame = v; }
    },
    currentMoveIndex: {
        get() { return ChessApp.currentMoveIndex; },
        set(v) { ChessApp.currentMoveIndex = v; }
    },
    profileState: {
        get() { return ChessApp.profileState; },
        set(v) { ChessApp.profileState = v; }
    },
    matchesSortLabel: {
        get() { return ChessApp.matchesSortLabel; },
        set(v) { ChessApp.matchesSortLabel = v; }
    },
    learnSection: {
        get() { return ChessApp.learnSection; },
        set(v) { ChessApp.learnSection = v; }
    },
    learnOpenGroups: {
        get() { return ChessApp.learnOpenGroups; },
        set(v) { ChessApp.learnOpenGroups = v; }
    },
    learnDetail: {
        get() { return ChessApp.learnDetail; },
        set(v) { ChessApp.learnDetail = v; }
    },
    singleGameChoices: {
        get() { return ChessApp.singleGameChoices; },
        set(v) { ChessApp.singleGameChoices = v; }
    },
    singleGameBusy: {
        get() { return ChessApp.singleGameBusy; },
        set(v) { ChessApp.singleGameBusy = v; }
    },
    singleGamePickerReq: {
        get() { return ChessApp.singleGamePickerReq; },
        set(v) { ChessApp.singleGamePickerReq = v; }
    },
    learnLesson: {
        get() { return ChessApp.learnLesson; },
        set(v) { ChessApp.learnLesson = v; }
    }
});

const INTERNAL_FAMOUS_GAMES = [
    { name: "Opera Game", moves: ["e4","e5","Nf3","d6","d4","Bg4","dxe5","Bxf3","Qxf3","dxe5","Bc4","Nf6","Qb3","Qe7","Nc3","c6","Bg5","b5","Nxb5","cxb5","Bxb5","Nbd7","O-O-O","Rd8","Rxd7","Rxd7","Rd1","Qe6","Bxd7","Nxd7","Qb8+","Nxb8","Rd8#"] },
    { name: "Game of the Century", moves: ["Nf3","Nf6","c4","g6","Nc3","Bg7","d4","O-O","Bf4","d5","Qb3","dxc4","Qxc4","c6","e4","Nbd7","Rd1","Nb6","Qc5","Bg4","Bg5","Na4","Qa3","Nxc3","bxc3","Nxe4","Bxe7","Qb6","Bc4","Nxc3","Bc5","Rfe8+","Kf1","Be6","Bxb6","Bxc4+","Kg1","Ne2+","Kf1","Nxd4+","Kg1","Ne2+","Kf1","Nc3+","Kg1","axb6","Qb4","Ra4","Qxb6","Nxd1","h3","Rxa2","Kh2","Nxf2","Re1","Rxe1","Qd8+","Bf8","Nxe1","Bd5","Nf3","Ne4","Qb8","b5","h4","h5","Ne5","Kg7","Kg1","Bc5+","Kf1","Ng3+","Ke1","Bb4+","Kd1","Bb3+","Kc1","Ne2+","Kb1","Nc3+","Kc1","Rc2#"] },
    { name: "Immortal Game", moves: ["e4","e5","f4","exf4","Bc4","Qh4+","Kf1","b5","Bxb5","Nf6","Nf3","Qh6","d3","Nh5","Nh4","Qg5","Nf5","c6","g4","Nf6","Rg1","cxb5","h4","Qg6","h5","Qg5","Qf3","Ng8","Bxf4","Qf6","Nc3","Bc5","Nd5","Qxb2","Bd6","Bxg1","e5","Qxa1+","Ke2","Na6","Nxg7+","Kd8","Qf6+","Nxf6","Be7#"] },
    { name: "Evergreen Game", moves: ["e4","e5","Nf3","Nc6","Bc4","Bc5","b4","Bxb4","c3","Ba5","d4","exd4","O-O","d3","Qb3","Qf6","e5","Qg6","Re1","Nge7","Ba3","b5","Qxb5","Rb8","Qa4","Bb6","Nbd2","Bb7","Ne4","Qf5","Bxd3","Qh5","Nf6+","gxf6","exf6","Rg8","Rad1","Qxf3","Rxe7+","Nxe7","Qxd7+","Kxd7","Bf5+","Ke8","Bd7+","Kf8","Bxe7#"] },
    { name: "Kasparov's Immortal (vs Topalov 1999)", moves: ["e4","d6","d4","Nf6","Nc3","g6","Be3","Bg7","Qd2","c6","f3","b5","Nge2","Nbd7","Bh6","Bxh6","Qxh6","Bb7","a3","e5","O-O-O","Qe7","Kb1","a6","Nc1","O-O-O","Nb3","exd4","Rxd4","c5","Rd1","Nb6","g3","Kb8","Na5","Ba8","Bh3","d5","Qf4+","Ka7","Rhe1","d4","Nd5","Nbxd5","exd5","Qd6","Rxd4","cxd4","Re7+","Kb6","Qxd4+","Kxa5","b4+","Ka4","Qc3","Qxd5","Ra7","Bb7","Rxb7","Qc4","Qxf6","Kxa3","Qxa6+","Kxb4","c3+","Kxc3","Qa1+","Kd2","Qb2+","Kd1","Bf1","Rd2","Rd7","Rxd7","Bxc4","bxc4","Qxh8","Rd3","Qa8","c3","Qa4+","Ke1","f4","f5","Kc1","Rd2","Qa7"] }
];
const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const THEME_CATALOG = {
    claimed_center: {
        polarity: 'good',
        text: (pct) => `You fight for / claim the center in ${pct}% of your games`,
        detail: 'Central pawn breaks and piece pressure on d4/d5/e4/e5 show up often in your play.'
    },
    developed_piece: {
        polarity: 'good',
        text: (pct) => `Clean development themes appear in ${pct}% of your games`,
        detail: 'Getting knights and bishops out to active squares is a recurring strength.'
    },
    castled_safe: {
        polarity: 'good',
        text: (pct) => `You castle to safety as a key idea in ${pct}% of your games`,
        detail: 'King safety via castling is part of how you stabilize positions.'
    },
    great_sacrifice: {
        polarity: 'good',
        text: (pct) => `You play material sacrifices in ${pct}% of your games`,
        detail: 'Giving a specific piece for initiative, attack, or a forced regain of material.'
    },
    forked_piece: {
        polarity: 'good',
        text: (pct) => `You land forks in ${pct}% of your games`,
        detail: 'Double attacks (especially knight forks) are a weapon in your games.'
    },
    discovered_attack_given: {
        polarity: 'good',
        text: (pct) => `You create discovered attacks in ${pct}% of your games`,
        detail: 'Moving a piece to unveil a battery or long-range attacker.'
    },
    pinned_piece: {
        polarity: 'good',
        text: (pct) => `You use pins effectively in ${pct}% of your games`,
        detail: 'Pinning enemy pieces to king or queen to freeze or win material.'
    },
    won_material: {
        polarity: 'good',
        text: (pct) => `You win concrete material in ${pct}% of your games`,
        detail: 'Captures of a named piece that leave you ahead after the sequence.'
    },
    hung_piece: {
        polarity: 'bad',
        text: (pct) => `You hang specific pieces in ${pct}% of your games`,
        detail: 'Leaving a named piece en prise without getting it back.'
    },
    discovered_attack: {
        polarity: 'bad',
        text: (pct) => `You lose material to discovered attacks in ${pct}% of your games`,
        detail: 'A piece moves and suddenly reveals an attack on your queen, rook, or minor piece.'
    },
    missed_hanging: {
        polarity: 'bad',
        text: (pct) => `You miss hanging opponent pieces in ${pct}% of your games`,
        detail: 'Free or loose captures were available and not taken.'
    },
    castle_pawn_push: {
        polarity: 'bad',
        text: (pct) => `You push pawns in front of your castled king in ${pct}% of your games`,
        detail: 'Those pawn moves create hooks and lasting king-side weaknesses.'
    },
    fork_victim: {
        polarity: 'bad',
        text: (pct) => `You walk into forks in ${pct}% of your games`,
        detail: 'Your move left two valuable units forkable by a knight, pawn, or other piece.'
    },
    pin_problem: {
        polarity: 'bad',
        text: (pct) => `Pins cost you material in ${pct}% of your games`,
        detail: 'Ignoring a pin, or leaving a piece pinned to your king or queen.'
    },
    back_rank: {
        polarity: 'bad',
        text: (pct) => `Back-rank issues appear in ${pct}% of your games`,
        detail: 'King stuck on the back rank with no luft when heavy pieces invade.'
    },
    queen_trap: {
        polarity: 'bad',
        text: (pct) => `Your queen gets trapped or hung in ${pct}% of your games`,
        detail: 'Queen raids that leave her short of squares.'
    },
    king_in_center: {
        polarity: 'bad',
        text: (pct) => `An uncastled king gets punished in ${pct}% of your games`,
        detail: 'The center opens or tactics land while the king is still on e1/e8.'
    },
    quiet_improve: {
        polarity: 'good',
        text: (pct) => `Quiet improving moves feature in ${pct}% of your games`,
        detail: 'Prophylaxis, better piece placement, or consolidating without forcing fireworks.'
    }
};
const PROFILE_SKIP_THEMES = new Set([
    'developed_piece', 'claimed_center', 'castled_safe', 'quiet_improve'
]);
const LOSS_REASON_LABELS = {
    hung_piece: 'Hung a piece',
    queen_trap: 'Queen hung / trapped',
    discovered_attack: 'Discovered attack suffered',
    missed_hanging: 'Missed hanging piece',
    fork_victim: 'Walked into a fork',
    pin_problem: 'Pin problems',
    back_rank: 'Back-rank issues',
    castle_pawn_push: 'King-side pawn pushes',
    king_in_center: 'King stuck in center',
    unclassified: 'Other / unclear'
};
const MOVE_QUALITY_ORDER = [
    { label: 'Best', className: 'cls-best', color: 'var(--success)' },
    { label: 'Good', className: 'cls-good', color: 'var(--excellent)' },
    { label: 'Okay', className: 'cls-okay', color: 'var(--primary)' },
    { label: 'Book', className: 'cls-book', color: '#a29bfe' },
    { label: 'Theory', className: 'cls-theory', color: '#6c5ce7' },
    { label: 'Miss', className: 'cls-miss', color: 'var(--warning)' },
    { label: 'Mistake', className: 'cls-mistake', color: '#e67e22' },
    { label: 'Blunder', className: 'cls-blunder', color: 'var(--accent)' }
];
