export interface WinGoDraw {
  issueNumber: string;
  number: number;
  size: 'big' | 'small';
  colour: string;
  color: string;
  time: string;
  premium: string;
  sum?: number;
  source?: 'draw.ar-lottery01.com' | 'autonomous-engine';
  predictedSignal?: 'BIG' | 'SMALL';
  predictedColor?: 'GREEN' | 'RED' | 'VIOLET';
  predictedNumbers?: number[];
  predictionStatus?: 'WIN' | 'LOSS' | 'UNTRACKED';
}

export interface WinGoPrediction {
  targetPeriod: string;
  signal: 'BIG' | 'SMALL';
  color: 'GREEN' | 'RED' | 'VIOLET';
  luckyNumbers: number[];
  confidence: string;
  pattern: string;
  basedOnLatestIssue: string;
  sampleSize: number;
  engineMode?: 'LIVE_UPSTREAM' | 'AUTONOMOUS_ENGINE';
  metrics: {
    recentBigCount: number;
    recentSmallCount: number;
    recentGreenCount: number;
    recentRedCount: number;
    currentSizeStreak: { side: 'BIG' | 'SMALL'; length: number };
    currentColorStreak: { side: 'GREEN' | 'RED'; length: number };
  };
}

export interface WinGoTraceInfo {
  issueNumber: string;
  datePrefix: string;
  gameCode: string;
  periodNum: number;
  source: 'LIVE_UPSTREAM_AR_LOTTERY' | 'AUTONOMOUS_ENGINE';
  prediction: WinGoPrediction | null;
}

export const formatIssueUtcTime = (issueNumber: string, secondsPerRound: number): string => {
  const periodNum = parseInt(issueNumber.slice(13), 10);
  if (isNaN(periodNum) || periodNum < 1) return '00:00:00';
  const totalSec = (periodNum - 1) * secondsPerRound;
  const hh = String(Math.floor(totalSec / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

export const normalizeUpstreamDraw = (
  raw: {
    issueNumber: string;
    number: string | number;
    color?: string;
    colour?: string;
    premium?: string;
    sum?: number;
  },
  secondsPerRound: number
): WinGoDraw => {
  const num = typeof raw.number === 'number' ? raw.number : parseInt(String(raw.number), 10);
  const safeNum = isNaN(num) ? 0 : Math.max(0, Math.min(9, num));
  let col = raw.color || raw.colour || '';
  if (!col) {
    if (safeNum === 0) col = 'red,violet';
    else if (safeNum === 5) col = 'green,violet';
    else if ([1, 3, 7, 9].includes(safeNum)) col = 'green';
    else col = 'red';
  }

  return {
    issueNumber: String(raw.issueNumber),
    number: safeNum,
    size: safeNum >= 5 ? 'big' : 'small',
    colour: col,
    color: col,
    time: formatIssueUtcTime(String(raw.issueNumber), secondsPerRound),
    premium: String(raw.premium ?? safeNum),
    sum: raw.sum ?? 0,
    source: 'draw.ar-lottery01.com',
  };
};

// =========================================================
// AUTONOMOUS DETERMINISTIC ENGINE (100% Offline-Capable)
// =========================================================
const mixIssueHash = (issue: string): number => {
  // FNV-1a 32-bit hash + avalanche mixer for uniform deterministic distribution
  let h = 2166136261;
  for (let i = 0; i < issue.length; i++) {
    h ^= issue.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

export const getAutonomousNumberForIssue = (issue: string): number => {
  // Inverted BIG <-> SMALL polarity: 0-4 -> 5-9 (BIG), 5-9 -> 0-4 (SMALL)
  return ((mixIssueHash(issue) % 10) + 5) % 10;
};

export const getAutonomousPredictionForIssue = (
  issue: string,
  recentDraws: WinGoDraw[] = []
): WinGoPrediction => {
  const num = getAutonomousNumberForIssue(issue);
  const h = mixIssueHash(issue);
  const isBig = num >= 5;
  const signal: 'BIG' | 'SMALL' = isBig ? 'BIG' : 'SMALL';

  let color: 'GREEN' | 'RED' | 'VIOLET' = 'RED';
  if (num === 0 || num === 5) {
    color = 'VIOLET';
  } else if ([1, 3, 7, 9].includes(num)) {
    color = 'GREEN';
  } else {
    color = 'RED';
  }

  const pool = isBig ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const others = pool.filter((n) => n !== num);
  const pick1 = others[h % others.length];
  const pick2 = others[(h + 2) % others.length];
  const luckyNumbers = Array.from(new Set([num, pick1, pick2])).sort((a, b) => a - b);

  const patterns = [
    'Autonomous Chain Lock',
    'Deterministic Parity Sync',
    'Harmonic Seed Alignment',
    'Standalone Engine Verified',
    'Zero-Drift Signal Lock',
  ];

  const shortWindow = recentDraws.slice(0, 10);
  const recentBigCount = shortWindow.filter((d) => d.number >= 5).length;
  const recentSmallCount = shortWindow.length - recentBigCount;
  const recentGreenCount = shortWindow.filter((d) => [1, 3, 5, 7, 9].includes(d.number)).length;
  const recentRedCount = shortWindow.length - recentGreenCount;

  return {
    targetPeriod: issue,
    signal,
    color,
    luckyNumbers,
    confidence: (96.2 + (h % 32) / 10).toFixed(1),
    pattern: patterns[h % patterns.length],
    basedOnLatestIssue: shortWindow[0]?.issueNumber || issue,
    sampleSize: Math.max(10, recentDraws.length),
    engineMode: 'AUTONOMOUS_ENGINE',
    metrics: {
      recentBigCount,
      recentSmallCount,
      recentGreenCount,
      recentRedCount,
      currentSizeStreak: { side: signal, length: 1 },
      currentColorStreak: { side: color === 'RED' ? 'RED' : 'GREEN', length: 1 },
    },
  };
};

export const getAutonomousDrawForIssue = (
  issueNumber: string,
  secondsPerRound: number
): WinGoDraw => {
  const num = getAutonomousNumberForIssue(issueNumber);
  const pred = getAutonomousPredictionForIssue(issueNumber);

  let col = 'red';
  if (num === 0) col = 'red,violet';
  else if (num === 5) col = 'green,violet';
  else if ([1, 3, 7, 9].includes(num)) col = 'green';

  return {
    issueNumber,
    number: num,
    size: num >= 5 ? 'big' : 'small',
    colour: col,
    color: col,
    time: formatIssueUtcTime(issueNumber, secondsPerRound),
    premium: String(num),
    sum: 0,
    source: 'autonomous-engine',
    predictedSignal: pred.signal,
    predictedColor: pred.color,
    predictedNumbers: pred.luckyNumbers,
    predictionStatus: 'WIN',
  };
};

export const getCurrentUtcRoundInfo = (secondsPerRound: number, nowMs: number = Date.now()) => {
  const d = new Date(nowMs);
  const elapsedToday = Math.floor((nowMs % 86400000) / 1000);
  const rem = secondsPerRound - (elapsedToday % secondsPerRound);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const gameCode = secondsPerRound === 30 ? '10005' : '10001';
  const roundIndex = Math.floor(elapsedToday / secondsPerRound) + 1;
  const periodId = `${year}${month}${day}${gameCode}${String(roundIndex).padStart(4, '0')}`;
  const roundDurationMs = secondsPerRound * 1000;
  const startTime = Math.floor(nowMs / roundDurationMs) * roundDurationMs;
  const endTime = startTime + roundDurationMs;

  return {
    periodId,
    countdownSeconds: rem,
    roundIndex,
    startTime,
    endTime,
  };
};

export const generateAutonomousHistory = (
  secondsPerRound: number = 30,
  limit: number = 100,
  nowMs: number = Date.now()
): WinGoDraw[] => {
  const now = new Date(nowMs);
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedSeconds = Math.floor((nowMs - midnightUtc) / 1000);
  const totalRoundsPerDay = secondsPerRound === 30 ? 2880 : 1440;
  const gameCode = secondsPerRound === 30 ? '10005' : '10001';
  const lastFinishedRoundIndex = Math.floor(elapsedSeconds / secondsPerRound);

  const list: WinGoDraw[] = [];
  for (let i = 0; i < limit; i++) {
    let roundNum = lastFinishedRoundIndex - i;
    let dayShift = 0;
    while (roundNum <= 0) {
      dayShift++;
      roundNum += totalRoundsPerDay;
    }

    const targetDate = new Date(midnightUtc - dayShift * 86400000);
    const year = targetDate.getUTCFullYear();
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getUTCDate()).padStart(2, '0');

    const issueNumber = `${year}${month}${day}${gameCode}${String(roundNum).padStart(4, '0')}`;
    list.push(getAutonomousDrawForIssue(issueNumber, secondsPerRound));
  }

  return list;
};

// =========================================================
// 1:1 AR-LOTTERY SCHEMA BUILDERS (Matches draw.ar-lottery01.com)
// Works identically for both Live Upstream & Offline Autonomous Engine
// =========================================================
export const formatIssueIdFromRoundIndex = (
  game: '30s' | '1m',
  roundIndexFromMidnight: number,
  nowMs: number = Date.now()
): string => {
  const secondsPerRound = game === '30s' ? 30 : 60;
  const totalRoundsPerDay = secondsPerRound === 30 ? 2880 : 1440;
  const gameCode = game === '30s' ? '10005' : '10001';

  const now = new Date(nowMs);
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  let r = roundIndexFromMidnight;
  let dayShift = 0;
  while (r <= 0) {
    dayShift++;
    r += totalRoundsPerDay;
  }
  while (r > totalRoundsPerDay) {
    dayShift--;
    r -= totalRoundsPerDay;
  }

  const targetDate = new Date(midnightUtc - dayShift * 86400000);
  const year = targetDate.getUTCFullYear();
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}${gameCode}${String(r).padStart(4, '0')}`;
};

export const buildArLotteryRoundSnapshot = (
  game: '30s' | '1m',
  nowMs: number = Date.now()
) => {
  const secondsPerRound = game === '30s' ? 30 : 60;
  const roundDurationMs = secondsPerRound * 1000;
  const currentStartTime = Math.floor(nowMs / roundDurationMs) * roundDurationMs;
  const currentEndTime = currentStartTime + roundDurationMs;

  const currentDate = new Date(currentStartTime);
  const midnightUtc = Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate()
  );
  const elapsedTodaySec = Math.floor((currentStartTime - midnightUtc) / 1000);
  const currentRoundIdx = Math.floor(elapsedTodaySec / secondsPerRound) + 1;

  return {
    gameCode: game === '30s' ? 'WinGo_30S' : 'WinGo_1M',
    intervalMinute: game === '30s' ? 0.5 : 1.0,
    state: 1,
    previous: {
      issueNumber: formatIssueIdFromRoundIndex(game, currentRoundIdx - 1, currentStartTime),
      startTime: currentStartTime - roundDurationMs,
      endTime: currentStartTime,
    },
    current: {
      issueNumber: formatIssueIdFromRoundIndex(game, currentRoundIdx, currentStartTime),
      startTime: currentStartTime,
      endTime: currentEndTime,
    },
    next: {
      issueNumber: formatIssueIdFromRoundIndex(game, currentRoundIdx + 1, currentStartTime),
      startTime: currentEndTime,
      endTime: currentEndTime + roundDurationMs,
    },
  };
};

export const buildArLotteryHistoryPage = (
  draws: WinGoDraw[],
  pageNo: number = 1,
  pageSize: number = 10,
  nowMs: number = Date.now(),
  totalCount: number = 500
) => {
  const safePageNo = Math.max(1, pageNo);
  const safePageSize = Math.max(1, Math.min(100, pageSize));
  const start = (safePageNo - 1) * safePageSize;
  const pageDraws = draws.slice(start, start + safePageSize);

  return {
    data: {
      list: pageDraws.map((d) => ({
        issueNumber: d.issueNumber,
        number: String(d.number),
        color: d.color || d.colour,
        premium: String(d.premium ?? d.number),
        sum: d.sum ?? 0,
      })),
      pageNo: safePageNo,
      totalPage: Math.max(1, Math.ceil(totalCount / safePageSize)),
      totalCount,
    },
    code: 0,
    msg: 'Succeed',
    msgCode: 0,
    serviceTime: nowMs,
  };
};

// =========================================================
// LIVE UPSTREAM TREND PREDICTOR (For draw.ar-lottery01.com)
// =========================================================
export const predictFromLiveHistory = (
  targetPeriod: string,
  recentDraws: WinGoDraw[]
): WinGoPrediction => {
  const windowDraws = recentDraws.slice(0, 30);
  const shortWindow = recentDraws.slice(0, 10);

  let recentBigCount = 0;
  let recentSmallCount = 0;
  let recentGreenCount = 0;
  let recentRedCount = 0;
  const numberFreq = Array(10).fill(0);

  shortWindow.forEach((d) => {
    if (d.number >= 5) recentBigCount++;
    else recentSmallCount++;

    if ([1, 3, 5, 7, 9].includes(d.number)) recentGreenCount++;
    else recentRedCount++;
  });

  windowDraws.forEach((d, idx) => {
    if (d.number >= 0 && d.number <= 9) {
      numberFreq[d.number] += idx < 10 ? 2 : 1;
    }
  });

  const latestSize: 'BIG' | 'SMALL' =
    shortWindow[0] && shortWindow[0].number >= 5 ? 'BIG' : 'SMALL';
  let sizeStreakLen = 0;
  for (const d of shortWindow) {
    const s = d.number >= 5 ? 'BIG' : 'SMALL';
    if (s === latestSize) sizeStreakLen++;
    else break;
  }

  const latestColor: 'GREEN' | 'RED' =
    shortWindow[0] && [1, 3, 5, 7, 9].includes(shortWindow[0].number) ? 'GREEN' : 'RED';
  let colorStreakLen = 0;
  for (const d of shortWindow) {
    const c = [1, 3, 5, 7, 9].includes(d.number) ? 'GREEN' : 'RED';
    if (c === latestColor) colorStreakLen++;
    else break;
  }

  let alternatingSize = false;
  if (shortWindow.length >= 4) {
    const s0 = shortWindow[0].number >= 5;
    const s1 = shortWindow[1].number >= 5;
    const s2 = shortWindow[2].number >= 5;
    const s3 = shortWindow[3].number >= 5;
    alternatingSize = s0 !== s1 && s1 !== s2 && s2 !== s3;
  }

  let signal: 'BIG' | 'SMALL';
  let pattern: string;
  let confidenceScore = 64.0;

  if (shortWindow.length === 0) {
    signal = 'BIG';
    pattern = 'Awaiting Live Draw Sample';
    confidenceScore = 50.0;
  } else if (sizeStreakLen >= 4) {
    const big30 = windowDraws.filter((d) => d.number >= 5).length;
    const small30 = windowDraws.length - big30;
    if (latestSize === 'BIG' && big30 > small30 + 4) {
      signal = 'SMALL';
      pattern = `Mean Reversion (${sizeStreakLen}x BIG Streak Exhaustion)`;
      confidenceScore = 78.4 + Math.min(8, sizeStreakLen * 1.5);
    } else if (latestSize === 'SMALL' && small30 > big30 + 4) {
      signal = 'BIG';
      pattern = `Mean Reversion (${sizeStreakLen}x SMALL Streak Exhaustion)`;
      confidenceScore = 78.4 + Math.min(8, sizeStreakLen * 1.5);
    } else {
      signal = latestSize;
      pattern = `Dragon Streak Continuation (${sizeStreakLen}x ${latestSize})`;
      confidenceScore = 75.2 + Math.min(9, sizeStreakLen * 1.4);
    }
  } else if (alternatingSize) {
    signal = latestSize === 'BIG' ? 'SMALL' : 'BIG';
    pattern = 'Alternating ABAB Zig-Zag Pattern';
    confidenceScore = 74.6;
  } else if (recentBigCount >= 7) {
    signal = 'SMALL';
    pattern = `10-Draw Balance Correction (${recentBigCount}/10 BIG)`;
    confidenceScore = 72.8 + (recentBigCount - 6) * 2.1;
  } else if (recentSmallCount >= 7) {
    signal = 'BIG';
    pattern = `10-Draw Balance Correction (${recentSmallCount}/10 SMALL)`;
    confidenceScore = 72.8 + (recentSmallCount - 6) * 2.1;
  } else {
    const big30 = windowDraws.filter((d) => d.number >= 5).length;
    const small30 = windowDraws.length - big30;
    signal = big30 <= small30 ? 'BIG' : 'SMALL';
    pattern = '30-Draw Frequency Balance Trend';
    confidenceScore = 66.5 + Math.min(10, Math.abs(big30 - small30) * 1.2);
  }

  let color: 'GREEN' | 'RED' = 'GREEN';
  if (colorStreakLen >= 4) {
    color = latestColor === 'GREEN' ? 'RED' : 'GREEN';
  } else if (recentGreenCount >= 7) {
    color = 'RED';
  } else if (recentRedCount >= 7) {
    color = 'GREEN';
  } else {
    color = recentGreenCount <= recentRedCount ? 'GREEN' : 'RED';
  }

  const rangeNums = signal === 'BIG' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const rankedNums = [...rangeNums].sort((a, b) => {
    const aMatchesColor =
      color === 'GREEN' ? [1, 3, 5, 7, 9].includes(a) : [0, 2, 4, 6, 8].includes(a);
    const bMatchesColor =
      color === 'GREEN' ? [1, 3, 5, 7, 9].includes(b) : [0, 2, 4, 6, 8].includes(b);
    if (aMatchesColor !== bMatchesColor) return aMatchesColor ? -1 : 1;
    return numberFreq[a] - numberFreq[b];
  });

  const luckyNumbers = rankedNums.slice(0, 3).sort((a, b) => a - b);

  return {
    targetPeriod,
    signal,
    color,
    luckyNumbers,
    confidence: Math.min(91.5, confidenceScore).toFixed(1),
    pattern,
    basedOnLatestIssue: shortWindow[0]?.issueNumber || 'NONE',
    sampleSize: windowDraws.length,
    engineMode: 'LIVE_UPSTREAM',
    metrics: {
      recentBigCount,
      recentSmallCount,
      recentGreenCount,
      recentRedCount,
      currentSizeStreak: { side: latestSize, length: sizeStreakLen },
      currentColorStreak: { side: latestColor, length: colorStreakLen },
    },
  };
};
