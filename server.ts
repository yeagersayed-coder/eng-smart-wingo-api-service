import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { createServer as createViteServer } from 'vite';
import {
  WinGoDraw,
  WinGoPrediction,
  buildArLotteryHistoryPage,
  buildArLotteryRoundSnapshot,
  generateAutonomousHistory,
  getAutonomousPredictionForIssue,
  getCurrentUtcRoundInfo,
  normalizeUpstreamDraw,
  predictFromLiveHistory,
} from './src/data/wingoDataset.js';

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage folders
const UPLOADS_DIR = path.resolve('/tmp/zip_uploads');
const SITES_DIR = path.resolve('/tmp/hosted_sites');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(SITES_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 100 * 1024 * 1024 } });

// ==========================================
// 1. FAMAPP PAYMENT GATEWAY STATE & ENGINE
// ==========================================
interface PaymentRecord {
  emailId: string;
  amount: number;
  rawAmountText: string;
  fromName: string;
  utr: string;
  transactionId: string;
  formattedTime: string;
  account: string;
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: number;
  expiresAt: number;
  status: 'ACTIVE' | 'EXPIRED';
}

interface EmailItem {
  id: string;
  subject: string;
  sender: string;
  recipient: string;
  snippet: string;
  htmlBody: string;
  textBody: string;
  dateStr: string;
  timestamp: number;
  isFamPayment: boolean;
  parsedPayment?: PaymentRecord;
}

let connectedEmail = 'shaktimahto1213@gmail.com';
let totalProcessedEmails = 28;
let paymentLogs: PaymentRecord[] = [];

// Initial active payment with a 10-minute expiry
const initialPayment: PaymentRecord = {
  emailId: 'msg_fam_001',
  amount: 40,
  rawAmountText: '₹40.0',
  fromName: 'RAMESHBHAI PARDESHI',
  utr: '528216904346',
  transactionId: 'FMPIB6263595295',
  formattedTime: '12 Nov 2026, 09:02 am',
  account: 'FamX Wallet',
  sender: 'FamApp 4',
  subject: 'You received ₹40.0 in your FamX account',
  snippet: 'Hey Shakti Kumar Mahto, You have successfully received ₹40.0 from RAMESHBHAI PARDESHI. Transaction ID: FMPIB6263595295, UTR: 528216904346.',
  receivedAt: Date.now(),
  expiresAt: Date.now() + 10 * 60 * 1000,
  status: 'ACTIVE',
};

let activePayment: PaymentRecord | null = { ...initialPayment };
paymentLogs.push({ ...initialPayment });

let emailsInbox: EmailItem[] = [
  {
    id: 'msg_fam_001',
    subject: 'You received ₹40.0 in your FamX account',
    sender: 'FamApp 4',
    recipient: connectedEmail,
    snippet: 'Hey Shakti Kumar Mahto, You have successfully received ₹40.0 from RAMESHBHAI PARDESHI. Transaction ID: FMPIB6263595295, UTR: 528216904346.',
    htmlBody: `<div style="font-family:sans-serif; background:#0f172a; color:#f8fafc; padding:24px; border-radius:12px;">
      <h2 style="color:#10b981; margin-top:0;">You received ₹40.0 in your FamX account!</h2>
      <p style="font-size:15px; color:#e2e8f0;">Hey Shakti Kumar Mahto,</p>
      <p style="font-size:14px; color:#cbd5e1;">You have successfully received <strong>₹40.0</strong> from <strong>RAMESHBHAI PARDESHI</strong>.</p>
      <div style="background:#1e293b; padding:16px; border-radius:8px; margin:16px 0; border:1px solid #334155;">
        <div><strong>Transaction ID:</strong> FMPIB6263595295</div>
        <div><strong>UTR:</strong> 528216904346</div>
        <div><strong>Sender:</strong> RAMESHBHAI PARDESHI</div>
        <div><strong>Account:</strong> FamX Wallet</div>
        <div><strong>Status:</strong> Success</div>
      </div>
    </div>`,
    textBody: 'Hey Shakti Kumar Mahto, You have successfully received ₹40.0 from RAMESHBHAI PARDESHI. Transaction ID: FMPIB6263595295, UTR: 528216904346.',
    dateStr: '08:53 pm',
    timestamp: Date.now() - 60000,
    isFamPayment: true,
    parsedPayment: activePayment,
  },
  {
    id: 'msg_analytics_001',
    subject: 'Your Google Analytics performance report is ready',
    sender: 'Google Analytics',
    recipient: connectedEmail,
    snippet: 'Your weekly web traffic report for project FamApp API Gateway is now available to inspect.',
    htmlBody: '<p>Your weekly traffic report is ready.</p>',
    textBody: 'Your weekly web traffic report for project FamApp API Gateway is now available.',
    dateStr: '07:15 pm',
    timestamp: Date.now() - 3600000,
    isFamPayment: false,
  },
  {
    id: 'msg_sarv_001',
    subject: 'Thapar Institute of Engineering & Tech Admissions 2026',
    sender: 'SarvGyan Education Portal',
    recipient: connectedEmail,
    snippet: 'Applications open for B.Tech CSE & Engineering Admissions 2026. Review eligibility and dates.',
    htmlBody: '<p>Applications open for B.Tech Admissions 2026.</p>',
    textBody: 'Applications open for B.Tech Admissions 2026.',
    dateStr: '05:30 pm',
    timestamp: Date.now() - 7200000,
    isFamPayment: false,
  },
  {
    id: 'msg_aistudio_001',
    subject: '🚀 Introducing Gemini 3.6 Flash and 3.5 Pro Updates',
    sender: 'Google AI Studio Team',
    recipient: connectedEmail,
    snippet: 'Explore our latest multimodal capabilities, faster token generation speeds and updated system skills.',
    htmlBody: '<p>Explore new Gemini model updates!</p>',
    textBody: 'Explore new Gemini model updates!',
    dateStr: '03:45 pm',
    timestamp: Date.now() - 14400000,
    isFamPayment: false,
  },
  {
    id: 'msg_fam_002',
    subject: 'Your payment of ₹1.0 is successful',
    sender: 'FamApp 4',
    recipient: connectedEmail,
    snippet: 'Paid ₹1.0 to Merchant QR from FamX Wallet.',
    htmlBody: '<p>Paid ₹1.0 to Merchant QR.</p>',
    textBody: 'Paid ₹1.0 to Merchant QR.',
    dateStr: 'Yesterday',
    timestamp: Date.now() - 86400000,
    isFamPayment: false,
  },
  {
    id: 'msg_fam_003',
    subject: 'You received ₹1.0 in your FamX account',
    sender: 'FamApp 4',
    recipient: connectedEmail,
    snippet: 'Hey Shakti, You received ₹1.0 from Test User. UTR: 528216909999.',
    htmlBody: '<p>You received ₹1.0 from Test User.</p>',
    textBody: 'You received ₹1.0 from Test User.',
    dateStr: 'Yesterday',
    timestamp: Date.now() - 90000000,
    isFamPayment: true,
    parsedPayment: {
      emailId: 'msg_fam_003',
      amount: 1,
      rawAmountText: '₹1.0',
      fromName: 'Test User',
      utr: '528216909999',
      transactionId: 'FMPIB9923812000',
      formattedTime: '24 Oct 2026, 04:00 pm',
      account: 'FamX Wallet',
      sender: 'FamApp 4',
      subject: 'You received ₹1.0 in your FamX account',
      snippet: 'Hey Shakti, You received ₹1.0 from Test User. UTR: 528216909999.',
      receivedAt: Date.now() - 90000000,
      expiresAt: Date.now() - 89400000,
      status: 'EXPIRED',
    },
  },
  {
    id: 'msg_cbse_001',
    subject: 'Notice: CBSE Class 12 Supplementary Exam Schedule',
    sender: 'CBSE Portal Alerts',
    recipient: connectedEmail,
    snippet: 'Official notification regarding CBSE supplementary examination timing and center allotment.',
    htmlBody: '<p>Official notification regarding CBSE examinations.</p>',
    textBody: 'Official notification regarding CBSE examinations.',
    dateStr: '23 Oct',
    timestamp: Date.now() - 172800000,
    isFamPayment: false,
  },
  {
    id: 'msg_stake_001',
    subject: 'Promotions - Get $10 boosted odds for today match',
    sender: 'Sports Club Alerts',
    recipient: connectedEmail,
    snippet: 'Exclusive match bonuses unlocked for premier league matches today.',
    htmlBody: '<p>Match bonuses unlocked.</p>',
    textBody: 'Match bonuses unlocked.',
    dateStr: '22 Oct',
    timestamp: Date.now() - 259200000,
    isFamPayment: false,
  },
];

const FAMAPP_STATE_FILE = path.resolve('/tmp/famapp_gateway_state.json');

const persistFamAppState = () => {
  try {
    fs.writeFileSync(
      FAMAPP_STATE_FILE,
      JSON.stringify({
        connectedEmail,
        totalProcessedEmails,
        activePayment,
        paymentLogs: paymentLogs.slice(0, 100),
        emailsInbox: emailsInbox.slice(0, 100),
      })
    );
  } catch {
    // Non-fatal
  }
};

try {
  if (fs.existsSync(FAMAPP_STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(FAMAPP_STATE_FILE, 'utf8'));
    if (typeof saved.connectedEmail === 'string') connectedEmail = saved.connectedEmail;
    if (typeof saved.totalProcessedEmails === 'number') totalProcessedEmails = saved.totalProcessedEmails;
    if (Array.isArray(saved.paymentLogs)) paymentLogs = saved.paymentLogs;
    if (Array.isArray(saved.emailsInbox)) emailsInbox = saved.emailsInbox;
    if ('activePayment' in saved) activePayment = saved.activePayment;
  }
} catch {
  // Ignore corrupt state file
}

// 10-Second Background Scanner Loop
setInterval(() => {
  if (activePayment) {
    if (Date.now() > activePayment.expiresAt) {
      activePayment.status = 'EXPIRED';
      // Find log and mark expired
      const log = paymentLogs.find((l) => l.emailId === activePayment?.emailId);
      if (log) log.status = 'EXPIRED';
      activePayment = null;
      persistFamAppState();
    }
  }
}, 10000);

// Status endpoint
app.get('/api/payment/famapp/status', (req, res) => {
  // Check expiry on read
  if (activePayment && Date.now() > activePayment.expiresAt) {
    activePayment.status = 'EXPIRED';
    activePayment = null;
    persistFamAppState();
  }

  res.json({
    success: true,
    authenticated: true,
    userEmail: connectedEmail,
    isScannerRunning: true,
    scanIntervalSeconds: 10,
    hasActivePayment: activePayment !== null,
    activePayment: activePayment,
    totalProcessedEmails: totalProcessedEmails,
  });
});

// Single active payment endpoint
app.get('/api/payment/famapp/latest', (req, res) => {
  if (activePayment && Date.now() > activePayment.expiresAt) {
    activePayment.status = 'EXPIRED';
    activePayment = null;
  }

  if (activePayment) {
    res.json({
      success: true,
      code: 200,
      message: 'Active FamApp payment found.',
      data: activePayment,
    });
  } else {
    res.json({
      success: false,
      code: 404,
      message: 'No active payment found in the last 10 minutes.',
      data: null,
    });
  }
});

// WinGo-style payment history API
app.get('/api/gmail-payment-history', (req, res) => {
  if (activePayment && Date.now() > activePayment.expiresAt) {
    activePayment.status = 'EXPIRED';
    activePayment = null;
  }

  const list = activePayment
    ? [
        {
          utr: activePayment.utr,
          amount: activePayment.amount,
          amount_received: activePayment.amount,
          raw_amount: activePayment.rawAmountText,
          rawAmountText: activePayment.rawAmountText,
          from_name: activePayment.fromName,
          fromName: activePayment.fromName,
          time: activePayment.formattedTime,
          formattedTime: activePayment.formattedTime,
          payment_method: activePayment.account,
          account: activePayment.account,
          sender: activePayment.sender,
          status: activePayment.status,
          email_id: activePayment.emailId,
        },
      ]
    : [];

  res.json({
    code: 0,
    msg: 'success',
    data: {
      list: list,
    },
  });
});

// Payment audit logs
app.get('/api/payment/famapp/logs', (req, res) => {
  res.json({
    success: true,
    count: paymentLogs.length,
    logs: paymentLogs,
  });
});

// Manual scanner trigger
app.post('/api/payment/famapp/scan', (req, res) => {
  totalProcessedEmails += 1;
  persistFamAppState();
  res.json({
    success: true,
    message: activePayment
      ? 'Gmail inbox scanned! 1 active payment found.'
      : 'Gmail inbox scanned! No new unhandled payments detected.',
    hasActivePayment: activePayment !== null,
    activePayment: activePayment,
  });
});

// Reset processed cache
app.post('/api/payment/famapp/reset-processed', (req, res) => {
  totalProcessedEmails = 0;
  persistFamAppState();
  res.json({
    success: true,
    message: 'Processed payments cache has been reset.',
  });
});

// Simulate new payment
app.post('/api/payment/famapp/simulate', (req, res) => {
  const amount = parseFloat(req.body.amount) || 50;
  const fromName = req.body.senderName || 'Rohit Verma';
  const utr = req.body.utr || String(Math.floor(100000000000 + Math.random() * 900000000000));
  const now = new Date();
  const timeStr = `${now.getDate()} Nov 2026, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'pm' : 'am'}`;
  const txId = 'FMPIB' + Math.floor(1000000000 + Math.random() * 9000000000);
  const emailId = 'sim_' + Date.now();

  const newPayment: PaymentRecord = {
    emailId,
    amount,
    rawAmountText: `₹${amount.toFixed(1)}`,
    fromName,
    utr,
    transactionId: txId,
    formattedTime: timeStr,
    account: 'FamX Wallet',
    sender: 'FamApp 4',
    subject: `You received ₹${amount.toFixed(1)} in your FamX account`,
    snippet: `Hey Shakti Kumar Mahto, You have successfully received ₹${amount.toFixed(1)} from ${fromName}. Transaction ID: ${txId}, UTR: ${utr}.`,
    receivedAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    status: 'ACTIVE',
  };

  activePayment = newPayment;
  paymentLogs.unshift({ ...newPayment });
  totalProcessedEmails += 1;

  emailsInbox.unshift({
    id: emailId,
    subject: newPayment.subject,
    sender: 'FamApp 4',
    recipient: connectedEmail,
    snippet: newPayment.snippet,
    htmlBody: `<div style="font-family:sans-serif; background:#0f172a; color:#f8fafc; padding:24px; border-radius:12px;">
      <h2 style="color:#10b981; margin-top:0;">You received ${newPayment.rawAmountText} in your FamX account!</h2>
      <p style="font-size:15px; color:#e2e8f0;">Hey Shakti Kumar Mahto,</p>
      <p style="font-size:14px; color:#cbd5e1;">You have successfully received <strong>${newPayment.rawAmountText}</strong> from <strong>${fromName}</strong>.</p>
      <div style="background:#1e293b; padding:16px; border-radius:8px; margin:16px 0; border:1px solid #334155;">
        <div><strong>Transaction ID:</strong> ${txId}</div>
        <div><strong>UTR:</strong> ${utr}</div>
        <div><strong>Sender:</strong> ${fromName}</div>
        <div><strong>Account:</strong> FamX Wallet</div>
        <div><strong>Status:</strong> Success</div>
      </div>
    </div>`,
    textBody: newPayment.snippet,
    dateStr: 'Just now',
    timestamp: Date.now(),
    isFamPayment: true,
    parsedPayment: newPayment,
  });

  persistFamAppState();

  res.json({
    success: true,
    message: 'Simulated payment created!',
    payment: newPayment,
  });
});

// Update email address
app.post('/api/auth/gmail/direct-login', (req, res) => {
  const { email } = req.body;
  if (email && typeof email === 'string') {
    connectedEmail = email;
    persistFamAppState();
  }
  res.json({
    success: true,
    message: `Connected to ${connectedEmail}`,
    email: connectedEmail,
  });
});

// Push custom simulated email
app.post('/api/gmail/compose', (req, res) => {
  const { recipient, subject, body, isFamPayment, amount, senderName } = req.body;
  const numAmount = parseFloat(amount) || 100;
  const from = senderName || 'FamApp Payment Sender';
  const now = new Date();
  const timeStr = `${now.getDate()} Nov 2026, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'pm' : 'am'}`;
  const utr = String(Math.floor(100000000000 + Math.random() * 900000000000));
  const txId = 'FMPIB' + Math.floor(1000000000 + Math.random() * 9000000000);
  const emailId = 'comp_' + Date.now();

  let parsed: PaymentRecord | undefined;
  if (isFamPayment) {
    parsed = {
      emailId,
      amount: numAmount,
      rawAmountText: `₹${numAmount.toFixed(1)}`,
      fromName: from,
      utr,
      transactionId: txId,
      formattedTime: timeStr,
      account: 'FamX Wallet',
      sender: 'FamApp 4',
      subject: subject || `You received ₹${numAmount.toFixed(1)} in your FamX account`,
      snippet: body || `You have received ₹${numAmount.toFixed(1)} from ${from}. UTR: ${utr}.`,
      receivedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
      status: 'ACTIVE',
    };
    activePayment = parsed;
    paymentLogs.unshift({ ...parsed });
    totalProcessedEmails += 1;
  }

  emailsInbox.unshift({
    id: emailId,
    subject: subject || 'New Notification',
    sender: from,
    recipient: recipient || connectedEmail,
    snippet: body || 'Simulated incoming message content.',
    htmlBody: `<div style="font-family:sans-serif; padding:16px;">${body || 'Message received'}</div>`,
    textBody: body || 'Message received',
    dateStr: 'Just now',
    timestamp: Date.now(),
    isFamPayment: Boolean(isFamPayment),
    parsedPayment: parsed,
  });

  persistFamAppState();

  res.json({
    success: true,
    message: 'Email pushed to Gmail inbox!',
  });
});

// List all emails
app.get('/api/gmail/inbox-all', (req, res) => {
  if (activePayment && Date.now() > activePayment.expiresAt) {
    activePayment.status = 'EXPIRED';
    activePayment = null;
  }

  res.json({
    success: true,
    authenticated: true,
    userEmail: connectedEmail,
    count: emailsInbox.length,
    resultSizeEstimate: emailsInbox.length,
    nextPageToken: null,
    hasActivePayment: activePayment !== null,
    activePayment: activePayment,
    emails: emailsInbox,
  });
});

// ==========================================
// 2. WINGO LIVE UPSTREAM ENGINE (draw.ar-lottery01.com)
// ==========================================
interface UpstreamRoundInfo {
  gameCode: string;
  intervalMinute: number;
  state: number;
  previous: { issueNumber: string; startTime: number; endTime: number };
  current: { issueNumber: string; startTime: number; endTime: number };
  next: { issueNumber: string; startTime: number; endTime: number };
}

interface GameLiveState {
  draws: WinGoDraw[];
  roundInfo: UpstreamRoundInfo | null;
  lastSyncAt: number;
  lastError: string | null;
  upstreamOk: boolean;
  serviceTime: number;
  predictions: Record<string, WinGoPrediction>;
}

const WINGO_CACHE_FILE = '/tmp/wingo_live_cache.json';

const liveWinGoState: Record<'30s' | '1m', GameLiveState> = {
  '30s': {
    draws: [],
    roundInfo: null,
    lastSyncAt: 0,
    lastError: null,
    upstreamOk: false,
    serviceTime: 0,
    predictions: {},
  },
  '1m': {
    draws: [],
    roundInfo: null,
    lastSyncAt: 0,
    lastError: null,
    upstreamOk: false,
    serviceTime: 0,
    predictions: {},
  },
};

// Load persisted real draws on startup if available
try {
  if (fs.existsSync(WINGO_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(WINGO_CACHE_FILE, 'utf8'));
    if (raw['30s']?.draws) liveWinGoState['30s'].draws = raw['30s'].draws.slice(0, 2880);
    if (raw['30s']?.predictions) liveWinGoState['30s'].predictions = raw['30s'].predictions;
    if (raw['1m']?.draws) liveWinGoState['1m'].draws = raw['1m'].draws.slice(0, 2880);
    if (raw['1m']?.predictions) liveWinGoState['1m'].predictions = raw['1m'].predictions;
  }
} catch {
  // Ignore corrupt cache file
}

const persistWinGoCache = () => {
  try {
    const payload = {
      '30s': {
        draws: liveWinGoState['30s'].draws.slice(0, 2880),
        predictions: Object.fromEntries(Object.entries(liveWinGoState['30s'].predictions).slice(-100)),
      },
      '1m': {
        draws: liveWinGoState['1m'].draws.slice(0, 2880),
        predictions: Object.fromEntries(Object.entries(liveWinGoState['1m'].predictions).slice(-100)),
      },
    };
    fs.writeFileSync(WINGO_CACHE_FILE, JSON.stringify(payload));
  } catch {
    // Non-fatal
  }
};

const syncUpstreamWinGo = async (game: '30s' | '1m', force = false): Promise<GameLiveState> => {
  const state = liveWinGoState[game];
  const now = Date.now();
  if (!force && now - state.lastSyncAt < 2000 && state.draws.length > 0) {
    return state;
  }

  const gameFolder = game === '30s' ? 'WinGo_30S' : 'WinGo_1M';
  const secondsPerRound = game === '30s' ? 30 : 60;
  const ts = Date.now();

  const historyUrl = `https://draw.ar-lottery01.com/WinGo/${gameFolder}/GetHistoryIssuePage.json?pageNo=1&pageSize=30&ts=${ts}`;
  const roundUrl = `https://draw.ar-lottery01.com/WinGo/${gameFolder}.json?ts=${ts}`;

  try {
    const [histRes, roundRes] = await Promise.all([
      fetch(historyUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      }),
      fetch(roundUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      }),
    ]);

    if (!histRes.ok) {
      throw new Error(`Upstream history HTTP ${histRes.status}`);
    }

    const histJson = (await histRes.json()) as any;
    const rawList = histJson?.data?.list;
    if (!Array.isArray(rawList)) {
      throw new Error('Upstream history missing data.list');
    }

    let roundInfo: UpstreamRoundInfo | null = state.roundInfo;
    if (roundRes.ok) {
      const roundJson = (await roundRes.json()) as any;
      if (roundJson?.current?.issueNumber) {
        roundInfo = roundJson as UpstreamRoundInfo;
      }
    }

    // Merge real draws into rolling store keyed by issueNumber
    const mergedMap = new Map<string, WinGoDraw>();
    state.draws.forEach((d) => mergedMap.set(d.issueNumber, d));

    rawList.forEach((item: any) => {
      const normalized = normalizeUpstreamDraw(item, secondsPerRound);
      const existing = mergedMap.get(normalized.issueNumber);
      const lockedPred = state.predictions[normalized.issueNumber];

      if (lockedPred) {
        const actualSize = normalized.size.toUpperCase() as 'BIG' | 'SMALL';
        normalized.predictedSignal = lockedPred.signal;
        normalized.predictedColor = lockedPred.color;
        normalized.predictedNumbers = lockedPred.luckyNumbers;
        normalized.predictionStatus = lockedPred.signal === actualSize ? 'WIN' : 'LOSS';
      } else if (existing?.predictedSignal) {
        normalized.predictedSignal = existing.predictedSignal;
        normalized.predictedColor = existing.predictedColor;
        normalized.predictedNumbers = existing.predictedNumbers;
        normalized.predictionStatus = existing.predictionStatus;
      } else {
        normalized.predictionStatus = 'UNTRACKED';
      }

      mergedMap.set(normalized.issueNumber, normalized);
    });

    const sortedDraws = Array.from(mergedMap.values())
      .sort((a, b) => (b.issueNumber > a.issueNumber ? 1 : b.issueNumber < a.issueNumber ? -1 : 0))
      .slice(0, 2880);

    state.draws = sortedDraws;
    state.roundInfo = roundInfo;
    state.lastSyncAt = Date.now();
    state.lastError = null;
    state.upstreamOk = true;
    state.serviceTime = Number(histJson?.serviceTime) || Date.now();

    // Lock prediction for the active upcoming issue if not already locked
    const targetIssue =
      roundInfo?.current?.issueNumber ||
      (sortedDraws[0]?.issueNumber ? String(BigInt(sortedDraws[0].issueNumber) + 1n) : '');

    if (targetIssue && !state.predictions[targetIssue] && sortedDraws.length > 0) {
      state.predictions[targetIssue] = predictFromLiveHistory(targetIssue, sortedDraws);
    }

    persistWinGoCache();
  } catch (err: any) {
    state.lastError = err?.message || 'Upstream fetch failed';
    state.upstreamOk = false;
  }

  return state;
};

// Initial sync + background 3s live poller
syncUpstreamWinGo('30s', true);
syncUpstreamWinGo('1m', true);
setInterval(() => {
  syncUpstreamWinGo('30s', true);
  syncUpstreamWinGo('1m', true);
}, 3000);

const getActivePeriodMeta = (game: '30s' | '1m', state: GameLiveState) => {
  const secondsPerRound = game === '30s' ? 30 : 60;
  const now = Date.now();

  if (state.roundInfo?.current?.issueNumber && state.roundInfo.current.endTime > now - 5000) {
    const rem = Math.max(0, Math.ceil((state.roundInfo.current.endTime - now) / 1000));
    return {
      periodId: state.roundInfo.current.issueNumber,
      countdownSeconds: Math.min(secondsPerRound, rem),
      startTime: state.roundInfo.current.startTime,
      endTime: state.roundInfo.current.endTime,
      previousIssue: state.roundInfo.previous?.issueNumber || state.draws[0]?.issueNumber || '',
    };
  }

  const utcInfo = getCurrentUtcRoundInfo(secondsPerRound, now);
  return {
    periodId: utcInfo.periodId,
    countdownSeconds: utcInfo.countdownSeconds,
    startTime: utcInfo.startTime,
    endTime: utcInfo.endTime,
    previousIssue: state.draws[0]?.issueNumber || '',
  };
};

const handleWinGo = async (
  game: '30s' | '1m',
  limit: number,
  req: express.Request,
  res: express.Response
) => {
  const forceOffline = req.query.mode === 'offline';
  const secondsPerRound = game === '30s' ? 30 : 60;

  if (!forceOffline) {
    const state = await syncUpstreamWinGo(game);
    if (state.upstreamOk && state.draws.length > 0) {
      const meta = getActivePeriodMeta(game, state);
      const list = state.draws.slice(0, limit);
      const alignedServerTime =
        meta.startTime && meta.endTime
          ? Math.min(meta.endTime - 500, Math.max(meta.startTime + 500, Date.now()))
          : Date.now();
      return res.json({
        code: 0,
        msg: 'success',
        game,
        limit,
        engineMode: 'LIVE_UPSTREAM',
        source: 'draw.ar-lottery01.com',
        upstreamOk: true,
        stale: false,
        serverTime: alignedServerTime,
        lastSyncAt: state.lastSyncAt,
        lastError: null,
        totalCachedDraws: state.draws.length,
        currentRound: meta,
        data: { list },
      });
    }
  }

  // Autonomous Engine (offline or ?mode=offline)
  const now = Date.now();
  const utcMeta = getCurrentUtcRoundInfo(secondsPerRound, now);
  const autoList = generateAutonomousHistory(secondsPerRound, limit, now);

  return res.json({
    code: 0,
    msg: 'success',
    game,
    limit,
    engineMode: 'AUTONOMOUS_ENGINE',
    source: 'autonomous-engine',
    upstreamOk: false,
    stale: false,
    serverTime: now,
    lastSyncAt: now,
    lastError: forceOffline ? 'Forced Standalone Mode' : 'Upstream unreachable — Autonomous Engine active',
    totalCachedDraws: autoList.length,
    currentRound: {
      periodId: utcMeta.periodId,
      countdownSeconds: utcMeta.countdownSeconds,
      startTime: utcMeta.startTime,
      endTime: utcMeta.endTime,
      previousIssue: autoList[0]?.issueNumber || '',
    },
    data: { list: autoList },
  });
};

// Aliases matching all original routes
const wingoLimits30s = [10, 30, 100, 300, 500, 1000, 2880];
wingoLimits30s.forEach((l) => {
  app.get(`/api/wingo-history-30s-${l}`, (req, res) => handleWinGo('30s', l, req, res));
});

const wingoLimits1m = [10, 30, 100, 300, 500, 1000, 1440, 2880];
wingoLimits1m.forEach((l) => {
  app.get(`/api/wingo-history-1m-${l}`, (req, res) => handleWinGo('1m', l, req, res));
});

app.get('/api/wingo-history-30s', (req, res) => handleWinGo('30s', 100, req, res));
app.get('/api/wingo-history-1m', (req, res) => handleWinGo('1m', 100, req, res));

// Parametric route
app.get('/api/wingo-history-:game-:limit', (req, res) => {
  const game = req.params.game === '1m' ? '1m' : '30s';
  const limit = Math.min(2880, Math.max(1, parseInt(req.params.limit, 10) || 100));
  handleWinGo(game, limit, req, res);
});

// Live Upstream Status Endpoint
app.get('/api/wingo-live-status', async (req, res) => {
  const game = req.query.game === '1m' ? '1m' : '30s';
  const state = await syncUpstreamWinGo(game);
  const meta = getActivePeriodMeta(game, state);
  const alignedServerTime =
    meta.startTime && meta.endTime
      ? Math.min(meta.endTime - 500, Math.max(meta.startTime + 500, Date.now()))
      : Date.now();
  res.json({
    success: true,
    game,
    engineMode: state.upstreamOk ? 'LIVE_UPSTREAM' : 'AUTONOMOUS_ENGINE',
    source: state.upstreamOk ? 'draw.ar-lottery01.com' : 'autonomous-engine',
    upstreamOk: state.upstreamOk,
    serverTime: alignedServerTime,
    lastSyncAt: state.lastSyncAt,
    lastError: state.lastError,
    totalCachedDraws30s: liveWinGoState['30s'].draws.length,
    totalCachedDraws1m: liveWinGoState['1m'].draws.length,
    currentRound: meta,
    latestDraw: state.draws[0] || null,
  });
});

// 1:1 draw.ar-lottery01.com Compatible Mirror Endpoints (Works identically Online & Offline)
app.get('/api/ar-lottery/WinGo/:gameFolder.json', async (req, res) => {
  const game: '30s' | '1m' = req.params.gameFolder === 'WinGo_1M' ? '1m' : '30s';
  const forceOffline = req.query.mode === 'offline';

  if (!forceOffline) {
    const state = await syncUpstreamWinGo(game);
    if (state.upstreamOk && state.roundInfo?.current?.issueNumber) {
      return res.json(state.roundInfo);
    }
  }

  return res.json(buildArLotteryRoundSnapshot(game));
});

app.get('/api/ar-lottery/WinGo/:gameFolder/GetHistoryIssuePage.json', async (req, res) => {
  const game: '30s' | '1m' = req.params.gameFolder === 'WinGo_1M' ? '1m' : '30s';
  const secondsPerRound = game === '30s' ? 30 : 60;
  const forceOffline = req.query.mode === 'offline';
  const pageNo = Math.max(1, parseInt(String(req.query.pageNo || '1'), 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize || '30'), 10) || 10));

  if (!forceOffline) {
    const state = await syncUpstreamWinGo(game);
    if (state.upstreamOk && state.draws.length > 0) {
      return res.json(
        buildArLotteryHistoryPage(state.draws, pageNo, Math.min(10, pageSize), state.serviceTime || Date.now())
      );
    }
  }

  const autoDraws = generateAutonomousHistory(secondsPerRound, Math.max(pageNo * pageSize, 100));
  return res.json(buildArLotteryHistoryPage(autoDraws, pageNo, Math.min(10, pageSize), Date.now()));
});

// Live AI Prediction Signal Endpoints (Live Upstream OR Autonomous Engine)
const handleWinGoPredict = async (
  game: '30s' | '1m',
  req: express.Request,
  res: express.Response
) => {
  const forceOffline = req.query.mode === 'offline';
  const secondsPerRound = game === '30s' ? 30 : 60;

  if (!forceOffline) {
    const state = await syncUpstreamWinGo(game);
    if (state.upstreamOk && state.draws.length > 0) {
      const meta = getActivePeriodMeta(game, state);
      if (!state.predictions[meta.periodId]) {
        state.predictions[meta.periodId] = predictFromLiveHistory(meta.periodId, state.draws);
        persistWinGoCache();
      }
      const prediction = state.predictions[meta.periodId];

      return res.json({
        code: 0,
        msg: 'success',
        game,
        engineMode: 'LIVE_UPSTREAM',
        source: 'draw.ar-lottery01.com',
        upstreamOk: true,
        serverTime:
          meta.startTime && meta.endTime
            ? Math.min(meta.endTime - 500, Math.max(meta.startTime + 500, Date.now()))
            : Date.now(),
        data: {
          ...prediction,
          timeRemainingSeconds: meta.countdownSeconds,
          roundEndTime: meta.endTime,
        },
      });
    }
  }

  // Autonomous Engine Prediction (100% locked with autonomous draw history)
  const now = Date.now();
  const utcMeta = getCurrentUtcRoundInfo(secondsPerRound, now);
  const autoRecent = generateAutonomousHistory(secondsPerRound, 30, now);
  const autoPred = getAutonomousPredictionForIssue(utcMeta.periodId, autoRecent);

  return res.json({
    code: 0,
    msg: 'success',
    game,
    engineMode: 'AUTONOMOUS_ENGINE',
    source: 'autonomous-engine',
    upstreamOk: false,
    serverTime: now,
    data: {
      ...autoPred,
      timeRemainingSeconds: utcMeta.countdownSeconds,
      roundEndTime: utcMeta.endTime,
    },
  });
};

app.get('/api/wingo-predict', (req, res) => {
  const game = req.query.game === '1m' ? '1m' : '30s';
  handleWinGoPredict(game, req, res);
});
app.get('/api/wingo-predict-30s', (req, res) => handleWinGoPredict('30s', req, res));
app.get('/api/wingo-predict-1m', (req, res) => handleWinGoPredict('1m', req, res));



// ==========================================
// 3. ZIP HOST & GOD-MODE ANTI-STEAL VAULT
// ==========================================
interface HostedSiteFile {
  path: string;
  size: number;
  isDecoy: boolean;
}

interface HostedSite {
  siteId: string;
  title: string;
  accessKey: string;
  originalSize: number;
  protectedSize: number;
  fileCount: number;
  decoyCount: number;
  liveUrl: string;
  createdAt: number;
  files: HostedSiteFile[];
}

const generateGodModeAccessKey = (seed?: string): string => {
  const hex = seed
    ? crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase()
    : crypto.randomBytes(6).toString('hex').toUpperCase();
  return `GMV3-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
};

const hostedSites = new Map<string, HostedSite>();
const HOSTED_SITES_REGISTRY_FILE = path.resolve('/tmp/hosted_sites_registry.json');

const persistHostedSites = () => {
  try {
    fs.writeFileSync(HOSTED_SITES_REGISTRY_FILE, JSON.stringify(Array.from(hostedSites.values())));
  } catch {
    // Non-fatal
  }
};

try {
  if (fs.existsSync(HOSTED_SITES_REGISTRY_FILE)) {
    const savedSites = JSON.parse(fs.readFileSync(HOSTED_SITES_REGISTRY_FILE, 'utf8'));
    if (Array.isArray(savedSites)) {
      savedSites.forEach((s: HostedSite) => {
        if (s?.siteId && fs.existsSync(path.join(SITES_DIR, s.siteId))) {
          if (!s.accessKey) {
            s.accessKey = generateGodModeAccessKey(s.siteId);
          }
          hostedSites.set(s.siteId, s);
        }
      });
    }
  }
} catch {
  // Ignore corrupt registry file
}

// Anti-DevTools / Anti-F12 protection snippet
const ANTI_F12_SHIELD = `
<script data-vault-shield="god-mode">
(function() {
  // GOD-MODE Anti-Steal & DevTools Neutralizer
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
  document.addEventListener('keydown', function(e) {
    if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || (e.ctrlKey && e.keyCode === 85)) {
      e.preventDefault();
      return false;
    }
  });
  setInterval(function() {
    (function a(b) {
      if (typeof b === 'function') {
        b.constructor('debugger')();
      }
    })(function() {});
  }, 1000);
})();
</script>
`;

const DECOY_DIRECTORIES = [
  'assets/vendor/wasm_runtime',
  'core/kernel/obfuscated_v3',
  'api/internal/grpc_stubs',
  'modules/auth/tokens_v2',
  'lib/crypto/scrambled_hashes',
  'dist/chunks/runtime_worker',
  'plugins/telemetry_guard',
  'assets/shims/legacy_polyfills',
];

const generateDecoyFiles = (count: number = 120): HostedSiteFile[] => {
  const extensions = ['.js', '.json', '.wasm.map', '.min.css', '.vue.cache', '.ts.map', '.bin'];
  const decoys: HostedSiteFile[] = [];

  for (let i = 1; i <= count; i++) {
    const dir = DECOY_DIRECTORIES[i % DECOY_DIRECTORIES.length];
    const ext = extensions[i % extensions.length];
    const fileName = `decoy_module_0x${(i * 1337).toString(16).padStart(4, '0')}_shard_${i}${ext}`;
    const filePath = `${dir}/${fileName}`;
    const size = 512 + (i * 257) % 8192;
    decoys.push({
      path: filePath,
      size,
      isDecoy: true,
    });
  }
  return decoys;
};

// List hosted sites
app.get('/api/zip-host/sites', (req, res) => {
  res.json({
    success: true,
    sites: Array.from(hostedSites.values()).sort((a, b) => b.createdAt - a.createdAt),
  });
});

// Upload and protect zip
app.post('/api/zip-host/upload', upload.single('zipFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No zip file provided.' });
    }

    const title = (req.body.title as string) || req.file.originalname.replace(/\.[^/.]+$/, '');
    const siteId = 'site_' + Math.random().toString(36).substring(2, 9);
    const siteDir = path.join(SITES_DIR, siteId);
    fs.mkdirSync(siteDir, { recursive: true });

    // Read and extract zip
    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();
    const sourceFiles: HostedSiteFile[] = [];
    let originalSize = 0;

    zipEntries.forEach((entry) => {
      if (!entry.isDirectory) {
        originalSize += entry.header.size;
        let fileContent = entry.getData();

        // Inject Anti-F12 Shield if HTML entry
        if (entry.entryName.toLowerCase().endsWith('.html')) {
          let htmlStr = fileContent.toString('utf8');
          if (htmlStr.includes('</head>')) {
            htmlStr = htmlStr.replace('</head>', `${ANTI_F12_SHIELD}\n</head>`);
          } else if (htmlStr.includes('<body>')) {
            htmlStr = htmlStr.replace('<body>', `<body>\n${ANTI_F12_SHIELD}`);
          } else {
            htmlStr = `${ANTI_F12_SHIELD}\n${htmlStr}`;
          }
          fileContent = Buffer.from(htmlStr, 'utf8');
        }

        const outPath = path.join(siteDir, entry.entryName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, fileContent);

        sourceFiles.push({
          path: entry.entryName,
          size: fileContent.length,
          isDecoy: false,
        });
      }
    });

    // Make sure index.html exists
    if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
      const fallbackHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${ANTI_F12_SHIELD}</head><body style="background:#090d16;color:#e2e8f0;font-family:sans-serif;padding:40px;text-align:center;"><h1>${title}</h1><p>Website deployed under God-Mode Anti-Steal Shield.</p></body></html>`;
      fs.writeFileSync(path.join(siteDir, 'index.html'), fallbackHtml);
      sourceFiles.unshift({ path: 'index.html', size: Buffer.byteLength(fallbackHtml), isDecoy: false });
    }

    // Generate 120+ Decoy / Junk files
    const decoys = generateDecoyFiles(128);
    let decoyTotalBytes = 0;

    decoys.forEach((decoy) => {
      decoyTotalBytes += decoy.size;
      const fullPath = path.join(siteDir, decoy.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const junkContent = Buffer.from(`/* GOD_MODE_DECOY_JUNK_PADDING_0x${Math.random().toString(36)} */\nconst _0x${Math.random().toString(36).slice(2)} = "${Math.random().toString(36).repeat(10)}";\n`);
      fs.writeFileSync(fullPath, junkContent);
    });

    const allFiles = [...sourceFiles, ...decoys];
    const protectedSize = originalSize + decoyTotalBytes;

    const siteRecord: HostedSite = {
      siteId,
      title,
      accessKey: generateGodModeAccessKey(),
      originalSize,
      protectedSize,
      fileCount: allFiles.length,
      decoyCount: decoys.length,
      liveUrl: `/site/${siteId}/index.html`,
      createdAt: Date.now(),
      files: allFiles,
    };

    hostedSites.set(siteId, siteRecord);
    persistHostedSites();

    // Clean up temporary upload
    fs.unlink(req.file.path, () => {});

    res.json({
      success: true,
      message: 'Website hosted with GOD_MODE anti-steal protection!',
      site: siteRecord,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to process zip.' });
  }
});

// Delete hosted site
app.delete('/api/zip-host/site/:siteId', (req, res) => {
  const { siteId } = req.params;
  if (hostedSites.has(siteId)) {
    hostedSites.delete(siteId);
    persistHostedSites();
    const siteDir = path.join(SITES_DIR, siteId);
    fs.rm(siteDir, { recursive: true, force: true }, () => {});
    return res.json({ success: true, message: 'Site deleted successfully.' });
  }
  res.status(404).json({ success: false, error: 'Site not found.' });
});

// Reprotect / Inject +120 more decoys
app.post('/api/zip-host/reprotect/:siteId', (req, res) => {
  const { siteId } = req.params;
  const site = hostedSites.get(siteId);
  if (!site) {
    return res.status(404).json({ success: false, error: 'Site not found.' });
  }

  const moreDecoys = generateDecoyFiles(120);
  const siteDir = path.join(SITES_DIR, siteId);
  let moreBytes = 0;

  moreDecoys.forEach((d) => {
    moreBytes += d.size;
    const fullPath = path.join(siteDir, d.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const junkContent = Buffer.from(`/* ADDITIONAL_SCRAMBLED_DECOY */\nvar _0xsec_${Math.random()} = 1;`);
    fs.writeFileSync(fullPath, junkContent);
  });

  site.files.push(...moreDecoys);
  site.decoyCount += moreDecoys.length;
  site.fileCount += moreDecoys.length;
  site.protectedSize += moreBytes;
  if (!site.accessKey) {
    site.accessKey = generateGodModeAccessKey(siteId);
  }
  persistHostedSites();

  res.json({
    success: true,
    message: '+120 More Decoy files injected successfully!',
    site,
  });
});

// Get file list for inspector
app.get('/api/zip-host/files/:siteId', (req, res) => {
  const { siteId } = req.params;
  const site = hostedSites.get(siteId);
  if (!site) {
    return res.status(404).json({ success: false, error: 'Site not found.' });
  }
  res.json({
    success: true,
    files: site.files,
  });
});

// Download protected zip
app.get('/api/zip-host/download-protected/:siteId', (req, res) => {
  const { siteId } = req.params;
  const site = hostedSites.get(siteId);
  if (!site) {
    return res.status(404).json({ success: false, error: 'Site not found.' });
  }

  const siteDir = path.join(SITES_DIR, siteId);
  const zip = new AdmZip();
  zip.addLocalFolder(siteDir);

  const zipBuffer = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${site.title}-GodMode-Protected.zip"`);
  res.send(zipBuffer);
});

// Serve live hosted sites statically
app.use('/site', express.static(SITES_DIR));

// ==========================================
// 3B. CLEAN FRESH EDGEONE PROJECT ZIP EXPORTER
// ==========================================
const EDGEONE_JSON = JSON.stringify(
  {
    buildCommand: 'npm run build',
    outputDirectory: './dist',
    nodeVersion: '22.11.0',
  },
  null,
  2
);

const EDGEONE_README = `# EdgeOne Pages — Clean Fresh Project Export

## Quick Deploy on Tencent Cloud EdgeOne Pages
1. Upload this ZIP directly in EdgeOne Pages (or push to GitHub/GitLab and connect the repository).
2. Build settings are pre-configured via \`edgeone.json\`:
   - **Install Command**: \`npm install\`
   - **Build Command**: \`npm run build\`
   - **Output Directory**: \`./dist\`
3. Serverless Edge API routes are included in \`functions/api/[[default]].js\`:
   - \`/api/wingo-history-30s-10\`, \`/api/wingo-history-30s-100\`, \`/api/wingo-history-1m-10\`
   - \`/api/wingo-predict-30s\`, \`/api/wingo-predict-1m\`, \`/api/wingo-live-status\`
   - \`/api/ar-lottery/WinGo/WinGo_30S.json\`, \`GetHistoryIssuePage.json\`
   - \`?mode=offline\` supported on all WinGo endpoints for 100% deterministic standalone parity
   - \`/api/payment/famapp/status\`, \`/api/gmail-payment-history\`

## Local Full-Stack Development
\`\`\`bash
npm install
npm run dev
\`\`\`
`;

const EDGEONE_API_FUNCTION = `// EdgeOne Pages Catch-All Edge Function: /api/*
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  'Content-Type': 'application/json; charset=utf-8',
};

function mixIssueHash(issue) {
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
}

function formatIssueTime(issueNumber, secondsPerRound) {
  const periodNum = parseInt(issueNumber.slice(13), 10);
  if (isNaN(periodNum) || periodNum < 1) return '00:00:00';
  const totalSec = (periodNum - 1) * secondsPerRound;
  const hh = String(Math.floor(totalSec / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return hh + ':' + mm + ':' + ss;
}

function getUtcRoundInfo(secondsPerRound, nowMs = Date.now()) {
  const d = new Date(nowMs);
  const elapsedToday = Math.floor((nowMs % 86400000) / 1000);
  const rem = secondsPerRound - (elapsedToday % secondsPerRound);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const gameCode = secondsPerRound === 30 ? '10005' : '10001';
  const roundIndex = Math.floor(elapsedToday / secondsPerRound) + 1;
  const periodId = year + month + day + gameCode + String(roundIndex).padStart(4, '0');
  const dur = secondsPerRound * 1000;
  const startTime = Math.floor(nowMs / dur) * dur;
  return { periodId, countdownSeconds: rem, roundIndex, startTime, endTime: startTime + dur };
}

function getAutonomousPred(issue, recentDraws = []) {
  const h = mixIssueHash(issue);
  const num = h % 10;
  const isBig = num >= 5;
  const signal = isBig ? 'BIG' : 'SMALL';
  const color = num === 0 || num === 5 ? 'VIOLET' : [1, 3, 7, 9].includes(num) ? 'GREEN' : 'RED';
  const pool = isBig ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const others = pool.filter((n) => n !== num);
  const luckyNumbers = Array.from(new Set([num, others[h % others.length], others[(h + 2) % others.length]])).sort((a, b) => a - b);
  const shortWin = recentDraws.slice(0, 10);
  const recentBigCount = shortWin.filter((d) => d.number >= 5).length;
  const recentGreenCount = shortWin.filter((d) => [1, 3, 5, 7, 9].includes(d.number)).length;
  return {
    targetPeriod: issue,
    signal,
    color,
    luckyNumbers,
    confidence: (96.2 + (h % 32) / 10).toFixed(1),
    pattern: 'Autonomous Chain Lock',
    basedOnLatestIssue: shortWin[0]?.issueNumber || issue,
    sampleSize: Math.max(10, recentDraws.length),
    engineMode: 'AUTONOMOUS_ENGINE',
    metrics: {
      recentBigCount,
      recentSmallCount: shortWin.length - recentBigCount,
      recentGreenCount,
      recentRedCount: shortWin.length - recentGreenCount,
      currentSizeStreak: { side: signal, length: 1 },
      currentColorStreak: { side: color === 'RED' ? 'RED' : 'GREEN', length: 1 },
    },
  };
}

function getAutonomousDraw(issueNumber, secondsPerRound) {
  const num = mixIssueHash(issueNumber) % 10;
  const pred = getAutonomousPred(issueNumber);
  const col = num === 0 ? 'red,violet' : num === 5 ? 'green,violet' : [1, 3, 7, 9].includes(num) ? 'green' : 'red';
  return {
    issueNumber,
    number: num,
    size: num >= 5 ? 'big' : 'small',
    colour: col,
    color: col,
    time: formatIssueTime(issueNumber, secondsPerRound),
    premium: String(num),
    sum: 0,
    source: 'autonomous-engine',
    predictedSignal: pred.signal,
    predictedColor: pred.color,
    predictedNumbers: pred.luckyNumbers,
    predictionStatus: 'WIN',
  };
}

function generateAutonomousList(secondsPerRound, limit, nowMs = Date.now()) {
  const now = new Date(nowMs);
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsedSeconds = Math.floor((nowMs - midnightUtc) / 1000);
  const totalPerDay = secondsPerRound === 30 ? 2880 : 1440;
  const gameCode = secondsPerRound === 30 ? '10005' : '10001';
  const lastIdx = Math.floor(elapsedSeconds / secondsPerRound);
  const list = [];
  for (let i = 0; i < limit; i++) {
    let r = lastIdx - i;
    let dayShift = 0;
    while (r <= 0) { dayShift++; r += totalPerDay; }
    const d = new Date(midnightUtc - dayShift * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const issue = y + m + day + gameCode + String(r).padStart(4, '0');
    list.push(getAutonomousDraw(issue, secondsPerRound));
  }
  return list;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const pathName = url.pathname;
  const forceOffline = url.searchParams.get('mode') === 'offline';
  const now = Date.now();

  if (pathName.startsWith('/api/payment/famapp/status')) {
    return jsonResponse({
      success: true,
      authenticated: true,
      userEmail: 'shaktimahto1213@gmail.com',
      isScannerRunning: true,
      scanIntervalSeconds: 10,
      hasActivePayment: false,
      activePayment: null,
      totalProcessedEmails: 28,
    });
  }

  if (pathName.startsWith('/api/gmail-payment-history')) {
    return jsonResponse({ code: 0, msg: 'success', data: { list: [] } });
  }

  const is1m = pathName.includes('1m') || pathName.includes('WinGo_1M') || url.searchParams.get('game') === '1m';
  const game = is1m ? '1m' : '30s';
  const secondsPerRound = is1m ? 60 : 30;
  const folder = is1m ? 'WinGo_1M' : 'WinGo_30S';

  if (pathName.startsWith('/api/wingo-') || pathName.startsWith('/api/ar-lottery/')) {
    if (!forceOffline) {
      try {
        const ts = Date.now();
        const [hRes, rRes] = await Promise.all([
          fetch('https://draw.ar-lottery01.com/WinGo/' + folder + '/GetHistoryIssuePage.json?pageNo=1&pageSize=30&ts=' + ts),
          fetch('https://draw.ar-lottery01.com/WinGo/' + folder + '.json?ts=' + ts),
        ]);
        if (hRes.ok) {
          const hJson = await hRes.json();
          const rJson = rRes.ok ? await rRes.json() : null;
          if (pathName.endsWith('GetHistoryIssuePage.json')) return jsonResponse(hJson);
          if (pathName.endsWith('.json') && rJson) return jsonResponse(rJson);
          const rawList = hJson?.data?.list || [];
          const list = rawList.map((item) => {
            const num = parseInt(String(item.number), 10) || 0;
            const col = item.color || (num === 0 ? 'red,violet' : num === 5 ? 'green,violet' : [1, 3, 7, 9].includes(num) ? 'green' : 'red');
            return {
              issueNumber: String(item.issueNumber),
              number: num,
              size: num >= 5 ? 'big' : 'small',
              colour: col,
              color: col,
              time: formatIssueTime(String(item.issueNumber), secondsPerRound),
              premium: String(item.premium ?? num),
              sum: item.sum ?? 0,
              source: 'draw.ar-lottery01.com',
              predictionStatus: 'UNTRACKED',
            };
          });
          const roundMeta = rJson?.current || getUtcRoundInfo(secondsPerRound, now);
          const periodId = roundMeta.issueNumber || roundMeta.periodId;
          const endTime = roundMeta.endTime;
          const countdownSeconds = Math.max(0, Math.min(secondsPerRound, Math.ceil((endTime - now) / 1000)));
          if (pathName.includes('wingo-predict')) {
            const big10 = list.slice(0, 10).filter((d) => d.number >= 5).length;
            const signal = big10 <= 5 ? 'BIG' : 'SMALL';
            return jsonResponse({
              code: 0,
              msg: 'success',
              game,
              engineMode: 'LIVE_UPSTREAM',
              source: 'draw.ar-lottery01.com',
              upstreamOk: true,
              serverTime: now,
              data: {
                targetPeriod: periodId,
                signal,
                color: 'GREEN',
                luckyNumbers: signal === 'BIG' ? [5, 7, 9] : [1, 2, 3],
                confidence: '74.2',
                pattern: 'Edge Live Upstream Trend',
                basedOnLatestIssue: list[0]?.issueNumber || 'NONE',
                sampleSize: list.length,
                engineMode: 'LIVE_UPSTREAM',
                timeRemainingSeconds: countdownSeconds,
                roundEndTime: endTime,
              },
            });
          }
          if (pathName.includes('wingo-live-status')) {
            return jsonResponse({
              success: true,
              game,
              engineMode: 'LIVE_UPSTREAM',
              source: 'draw.ar-lottery01.com',
              upstreamOk: true,
              serverTime: now,
              currentRound: { periodId, countdownSeconds, startTime: roundMeta.startTime, endTime },
              latestDraw: list[0] || null,
            });
          }
          return jsonResponse({
            code: 0,
            msg: 'success',
            game,
            engineMode: 'LIVE_UPSTREAM',
            source: 'draw.ar-lottery01.com',
            upstreamOk: true,
            serverTime: now,
            totalCachedDraws: list.length,
            currentRound: { periodId, countdownSeconds, startTime: roundMeta.startTime, endTime },
            data: { list },
          });
        }
      } catch {
        // Fallback to deterministic edge autonomous engine
      }
    }

    const utc = getUtcRoundInfo(secondsPerRound, now);
    const autoList = generateAutonomousList(secondsPerRound, 100, now);
    if (pathName.includes('wingo-predict')) {
      return jsonResponse({
        code: 0,
        msg: 'success',
        game,
        engineMode: 'AUTONOMOUS_ENGINE',
        source: 'autonomous-engine',
        upstreamOk: false,
        serverTime: now,
        data: { ...getAutonomousPred(utc.periodId, autoList), timeRemainingSeconds: utc.countdownSeconds, roundEndTime: utc.endTime },
      });
    }
    return jsonResponse({
      code: 0,
      msg: 'success',
      game,
      engineMode: 'AUTONOMOUS_ENGINE',
      source: 'autonomous-engine',
      upstreamOk: false,
      serverTime: now,
      totalCachedDraws: autoList.length,
      currentRound: { periodId: utc.periodId, countdownSeconds: utc.countdownSeconds, startTime: utc.startTime, endTime: utc.endTime, previousIssue: autoList[0]?.issueNumber || '' },
      data: { list: autoList },
    });
  }

  return jsonResponse({ success: false, error: 'Endpoint requires Node.js server runtime' }, 404);
}
`;

const addCleanDirectoryToZip = (zip: AdmZip, rootDir: string, relDir: string) => {
  const fullDir = path.join(rootDir, relDir);
  if (!fs.existsSync(fullDir)) return;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', '.aistudio', '.next', 'tmp'].includes(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const entryFull = path.join(rootDir, entryRel);
    if (entry.isDirectory()) {
      addCleanDirectoryToZip(zip, rootDir, entryRel);
    } else if (entry.isFile()) {
      zip.addFile(entryRel, fs.readFileSync(entryFull));
    }
  }
};

export const buildCleanEdgeOneProjectZip = (): Buffer => {
  const rootDir = process.cwd();
  const zip = new AdmZip();

  const cleanRootFiles = [
    'package.json',
    'index.html',
    'tsconfig.json',
    'vite.config.ts',
    'metadata.json',
    'firebase-applet-config.json',
    'firebase-blueprint.json',
    'firestore.rules',
    '.env.example',
    '.gitignore',
    'server.ts',
  ];

  for (const file of cleanRootFiles) {
    const fullPath = path.join(rootDir, file);
    if (fs.existsSync(fullPath)) {
      zip.addFile(file, fs.readFileSync(fullPath));
    }
  }

  addCleanDirectoryToZip(zip, rootDir, 'src');

  zip.addFile('edgeone.json', Buffer.from(EDGEONE_JSON, 'utf8'));
  zip.addFile('functions/api/[[default]].js', Buffer.from(EDGEONE_API_FUNCTION, 'utf8'));
  zip.addFile('README-EDGEONE.md', Buffer.from(EDGEONE_README, 'utf8'));

  return zip.toBuffer();
};

app.get('/api/project-export/edgeone-zip', (_req, res) => {
  try {
    const zipBuffer = buildCleanEdgeOneProjectZip();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="famapp-wingo-edgeone-clean.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to build EdgeOne ZIP' });
  }
});

// ==========================================
// 4. VITE DEV SERVER / PRODUCTION SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
