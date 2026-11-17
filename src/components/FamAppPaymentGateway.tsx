import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Mail,
  RefreshCw,
  Copy,
  Check,
  Clock,
  Send,
  AlertCircle,
  FileCode,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  User,
  Inbox,
  ExternalLink,
  Cloud,
} from 'lucide-react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  sanitizeFirestoreId,
  truncateString,
} from '../firebase.js';
import { useFirebase } from '../contexts/FirebaseContext.js';

interface PaymentData {
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
  parsedPayment?: PaymentData;
}

export default function FamAppPaymentGateway() {
  const { user, authReady, profileSynced, profile, updateConnectedGmail } = useFirebase();
  const [gatewayStatus, setGatewayStatus] = useState<any>(null);
  const [activePayment, setActivePayment] = useState<PaymentData | null>(null);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [logs, setLogs] = useState<PaymentData[]>([]);
  const [cloudPayments, setCloudPayments] = useState<Record<string, { status: 'ACTIVE' | 'EXPIRED'; record: PaymentData }>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState<'api' | 'simulate' | 'logs' | 'inbox'>('api');
  const syncingIdsRef = useRef<Set<string>>(new Set());

  // Modals
  const [showSimulateModal, setShowSimulateModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);

  // Form states for simulate
  const [simAmount, setSimAmount] = useState('50');
  const [simSender, setSimSender] = useState('Rohit Verma');
  const [simUtr, setSimUtr] = useState('528216904346');
  const [simulating, setSimulating] = useState(false);

  // Form state for login
  const [loginEmail, setLoginEmail] = useState(profile.connectedGmail || 'shaktimahto1213@gmail.com');

  // Form state for compose
  const [composeRecipient, setComposeRecipient] = useState('shaktimahto1213@gmail.com');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeIsFam, setComposeIsFam] = useState(true);
  const [composeAmount, setComposeAmount] = useState('100');
  const [sendingCompose, setSendingCompose] = useState(false);

  // Copy feedback states
  const [copiedUtr, setCopiedUtr] = useState(false);
  const [copiedHistoryUrl, setCopiedHistoryUrl] = useState(false);
  const [copiedLatestUrl, setCopiedLatestUrl] = useState(false);
  const [copiedEmbedCode, setCopiedEmbedCode] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: string; text: string } | null>(null);

  const showToast = (text: string, type = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (profile.connectedGmail) {
      setLoginEmail(profile.connectedGmail);
    }
  }, [profile.connectedGmail]);

  // Real-time Firestore listener for payment records
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !profileSynced) {
      setCloudPayments({});
      return;
    }

    const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);
    const colPath = `users/${uid}/payment_records`;
    const q = query(collection(db, 'users', uid, 'payment_records'), where('ownerId', '==', uid), limit(50));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextMap: Record<string, { status: 'ACTIVE' | 'EXPIRED'; record: PaymentData }> = {};
        snapshot.docs.forEach((docSnap) => {
          const d = docSnap.data();
          nextMap[docSnap.id] = {
            status: d.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
            record: {
              emailId: String(d.emailId || docSnap.id),
              amount: Number(d.amount) || 0,
              rawAmountText: String(d.rawAmountText || `₹${d.amount}`),
              fromName: String(d.fromName || 'FamApp Sender'),
              utr: String(d.utr || ''),
              transactionId: String(d.transactionId || ''),
              formattedTime: String(d.formattedTime || ''),
              account: String(d.account || 'FamApp UPI'),
              sender: 'alerts@famapp.in',
              subject: 'Payment Received via FamApp',
              snippet: `Synced payment ₹${d.amount} from ${d.fromName}`,
              receivedAt: d.createdAt?.toMillis?.() ?? Date.now(),
              expiresAt: Date.now(),
              status: d.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
            },
          };
        });
        setCloudPayments(nextMap);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, colPath);
      }
    );

    return () => unsub();
  }, [authReady, user, profileSynced]);

  // Sync live gateway payment logs into Firestore cleanly
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !profileSynced) return;
    const candidates = [...(activePayment ? [activePayment] : []), ...logs];
    if (candidates.length === 0) return;

    const uid = sanitizeFirestoreId(user.uid, 'user_default', 128);

    const syncRecords = async () => {
      for (const item of candidates.slice(0, 15)) {
        const recordId = sanitizeFirestoreId(item.emailId || item.utr, 'pay_01', 128);
        if (syncingIdsRef.current.has(recordId)) continue;

        const existingCloud = cloudPayments[recordId];
        const targetStatus: 'ACTIVE' | 'EXPIRED' = item.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
        const docPath = `users/${uid}/payment_records/${recordId}`;

        if (!existingCloud) {
          syncingIdsRef.current.add(recordId);
          try {
            await setDoc(doc(db, 'users', uid, 'payment_records', recordId), {
              ownerId: uid,
              emailId: recordId,
              amount: Math.min(10000000, Math.max(0.01, Number(item.amount) || 1)),
              rawAmountText: truncateString(item.rawAmountText, 32, `₹${Number(item.amount) || 1}`),
              fromName: truncateString(item.fromName, 100, 'FamApp Sender'),
              utr: sanitizeFirestoreId(item.utr, '000000', 32).padEnd(6, '0').slice(0, 32),
              transactionId: truncateString(item.transactionId, 64, recordId),
              account: truncateString(item.account, 64, 'FamApp UPI'),
              status: targetStatus,
              formattedTime: truncateString(item.formattedTime, 64, new Date().toISOString()),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, docPath);
          } finally {
            syncingIdsRef.current.delete(recordId);
          }
        } else if (existingCloud.status === 'ACTIVE' && targetStatus === 'EXPIRED') {
          syncingIdsRef.current.add(recordId);
          try {
            await updateDoc(doc(db, 'users', uid, 'payment_records', recordId), {
              status: 'EXPIRED',
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, docPath);
          } finally {
            syncingIdsRef.current.delete(recordId);
          }
        }
      }
    };

    syncRecords();
  }, [authReady, user, profileSynced, activePayment, logs, cloudPayments]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/payment/famapp/status');
      const data = await res.json();
      setGatewayStatus(data);
      if (data.hasActivePayment && data.activePayment) {
        setActivePayment(data.activePayment);
        const rem = Math.max(0, Math.floor((data.activePayment.expiresAt - Date.now()) / 1000));
        setRemainingSeconds(rem);
      } else {
        setActivePayment(null);
        setRemainingSeconds(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchInbox = async () => {
    try {
      const res = await fetch('/api/gmail/inbox-all');
      const data = await res.json();
      if (data.emails) setEmails(data.emails);
      if (data.hasActivePayment && data.activePayment) {
        setActivePayment(data.activePayment);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/payment/famapp/logs');
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchInbox(), fetchLogs()]);
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetchStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Countdown timer for active payment
  useEffect(() => {
    if (!activePayment || activePayment.status !== 'ACTIVE') return;

    const timer = setInterval(() => {
      const rem = Math.max(0, Math.floor((activePayment.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(rem);
      if (rem <= 0) {
        setActivePayment(null);
        fetchStatus();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activePayment]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/payment/famapp/scan', { method: 'POST' });
      const data = await res.json();
      showToast(data.message || 'Gmail scanned successfully!');
      await Promise.all([fetchStatus(), fetchInbox(), fetchLogs()]);
    } catch {
      showToast('Scan failed', 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleResetCache = async () => {
    try {
      const res = await fetch('/api/payment/famapp/reset-processed', { method: 'POST' });
      const data = await res.json();
      showToast(data.message || 'Cache reset');
      fetchStatus();
    } catch {
      showToast('Failed to reset cache', 'error');
    }
  };

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const res = await fetch('/api/payment/famapp/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(simAmount) || 50,
          senderName: simSender,
          utr: simUtr,
        }),
      });
      const data = await res.json();
      showToast(data.message || 'Payment simulated successfully!');
      setShowSimulateModal(false);
      await Promise.all([fetchStatus(), fetchInbox(), fetchLogs()]);
    } catch {
      showToast('Simulation failed', 'error');
    } finally {
      setSimulating(false);
    }
  };

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/gmail/direct-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });
      const data = await res.json();
      await updateConnectedGmail(loginEmail);
      showToast(data.message || `Connected to ${loginEmail}`);
      setShowLoginModal(false);
      fetchStatus();
    } catch {
      showToast('Login failed', 'error');
    }
  };

  const handleComposeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingCompose(true);
    try {
      const res = await fetch('/api/gmail/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: composeRecipient,
          subject: composeSubject,
          body: composeBody,
          isFamPayment: composeIsFam,
          amount: composeAmount,
          senderName: 'FamApp Payment Sender',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Email pushed to Gmail inbox!');
        setShowComposeModal(false);
        await Promise.all([fetchStatus(), fetchInbox()]);
      }
    } catch {
      showToast('Failed to send email', 'error');
    } finally {
      setSendingCompose(false);
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://gateway-node.run.app';
  const latestEndpointUrl = `${originUrl}/api/payment/famapp/latest`;
  const historyEndpointUrl = `${originUrl}/api/gmail-payment-history`;

  const embedScriptCode = `<!-- Embed FamApp Payment Checker into your website -->
<script>
async function verifyPayment() {
  const response = await fetch('${latestEndpointUrl}');
  const result = await response.json();
  if (result.success && result.data) {
    console.log("Payment Confirmed! Amount: ₹" + result.data.amount + ", UTR: " + result.data.utr);
    // Trigger your success credits or coin balance addition here!
  } else {
    console.log("No payment received in the last 10 minutes.");
  }
}
setInterval(verifyPayment, 10000);
</script>`;

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    if (type === 'utr') {
      setCopiedUtr(true);
      setTimeout(() => setCopiedUtr(false), 2000);
    } else if (type === 'latest') {
      setCopiedLatestUrl(true);
      setTimeout(() => setCopiedLatestUrl(false), 2000);
    } else if (type === 'history') {
      setCopiedHistoryUrl(true);
      setTimeout(() => setCopiedHistoryUrl(false), 2000);
    } else if (type === 'embed') {
      setCopiedEmbedCode(true);
      setTimeout(() => setCopiedEmbedCode(false), 2000);
    } else if (type === 'json') {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
    showToast('Copied to clipboard!');
  };

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / 600) * 100));

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 p-4 rounded-xl border backdrop-blur-lg flex items-center gap-2 shadow-2xl bg-slate-950/95 border-emerald-500/50 text-emerald-300 font-mono text-xs">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {toast.text}
        </div>
      )}

      {/* Hero Banner / Scanner Node Status */}
      <div className="bg-[#090d1a] border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                GMAIL PAYMENT SCANNER NODE
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              FamApp Automated Payment Gateway API
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Auto-scans your Gmail inbox every 10 seconds for real FamApp transaction alerts, parses UTR, Amount &amp; Sender, and hosts live API endpoints with automatic 10-minute validity expiry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning Inbox...' : 'Scan Now (10s)'}
            </button>
            <button
              onClick={() => setShowSimulateModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-black rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Zap className="w-3.5 h-3.5" />
              Simulate Payment
            </button>
          </div>
        </div>

        {/* 4 Quick Stat Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">10s Background Scanner</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-bold text-emerald-400 font-mono">Active &amp; Polling</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">Connected Gmail Account</span>
            <div className="flex items-center justify-between gap-1 mt-1">
              <span className="text-xs font-bold text-slate-200 font-mono truncate">{gatewayStatus?.userEmail || loginEmail}</span>
              <button
                onClick={() => setShowLoginModal(true)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold ml-1 cursor-pointer"
              >
                Change
              </button>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">Current API Endpoint State</span>
            <div className="mt-1">
              {activePayment ? (
                <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> LIVE (Active)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> EXPIRED / IDLE
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase block">Total Processed Payments</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-bold text-white font-mono">{gatewayStatus?.totalProcessedEmails ?? 28}</span>
              <button
                onClick={handleResetCache}
                className="text-[10px] text-slate-400 hover:text-rose-400 font-bold cursor-pointer"
              >
                Reset Cache
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE PAYMENT HERO CARD */}
      {activePayment ? (
        <div className="bg-gradient-to-b from-[#0c1322] to-[#070b14] border-2 border-emerald-500/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block">
                  Current Active FamApp Payment Data
                </span>
                <h3 className="text-xl font-black text-white">Live on /api/payment/famapp/latest</h3>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/40 px-3 py-1.5 rounded-xl font-mono text-xs text-emerald-300">
              <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>ACTIVE • Auto-expires in:</span>
              <span className="font-black text-emerald-200 text-sm">{timeFormatted}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800/80 mb-6">
            <div className="border-b md:border-b-0 md:border-r border-slate-800/80 pb-4 md:pb-0 md:pr-4">
              <span className="text-[10px] font-mono uppercase text-slate-400">Amount Received</span>
              <div className="text-3xl font-black text-emerald-400 mt-1 font-mono">
                {activePayment.rawAmountText || `₹${activePayment.amount.toFixed(1)}`}
              </div>
            </div>

            <div className="border-b md:border-b-0 md:border-r border-slate-800/80 pb-4 md:pb-0 md:pr-4">
              <span className="text-[10px] font-mono uppercase text-slate-400">From Name</span>
              <div className="text-sm font-bold text-white mt-1 truncate">{activePayment.fromName}</div>
              <span className="text-[10px] font-mono text-slate-500">Account: {activePayment.account}</span>
            </div>

            <div className="border-b md:border-b-0 md:border-r border-slate-800/80 pb-4 md:pb-0 md:pr-4">
              <span className="text-[10px] font-mono uppercase text-slate-400">UTR (12 Digits Only)</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-mono font-black text-amber-300">{activePayment.utr}</span>
                <button
                  onClick={() => copyToClipboard(activePayment.utr, 'utr')}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Copy UTR"
                >
                  {copiedUtr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[10px] font-mono text-slate-500">TxID: {activePayment.transactionId}</span>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Time &amp; Source</span>
              <div className="text-xs font-mono font-bold text-slate-300 mt-1">{activePayment.formattedTime}</div>
              <span className="text-[10px] font-mono text-slate-500">{activePayment.sender}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
            <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Parsed Gmail Alert Snippet:</div>
            <p className="line-clamp-2 text-slate-200">{activePayment.snippet}</p>
          </div>
        </div>
      ) : (
        <div className="bg-[#0b0f19] border border-amber-500/20 rounded-2xl p-6 text-center">
          <div className="inline-flex p-3 bg-amber-500/10 rounded-full text-amber-400 mb-3">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider font-mono">
            NO PAYMENT IN LAST 10 MIN
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            No active FamApp payment detected within the last 10 minutes. Any payment older than 10 minutes is automatically purged from the active endpoints to maintain real-time validity.
          </p>
          <div className="mt-4">
            <button
              onClick={() => setShowSimulateModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <Zap className="w-3.5 h-3.5" />
              Simulate &amp; Push Active Payment
            </button>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'api' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          API Endpoints &amp; Integration
        </button>

        <button
          onClick={() => setActiveTab('simulate')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'simulate' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Simulate Payment
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Audit Logs ({logs.length})
        </button>

        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'inbox' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          Gmail Inbox Monitor ({emails.length})
        </button>
      </div>

      {/* TAB 1: API ENDPOINTS & INTEGRATION */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WinGo Style API */}
            <div className="bg-[#080d1a] border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  ⚡ WinGo-Style Gmail Payment Data Transfer API (GET Request)
                </span>
                <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold rounded">
                  Format: code 0 / msg / data.list
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono text-xs flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-emerald-400 font-bold">GET</span>
                  <span className="text-slate-300 truncate">{historyEndpointUrl}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copyToClipboard(historyEndpointUrl, 'history')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedHistoryUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={historyEndpointUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Matches exactly the JSON schema expected by WinGo betting engines, color prediction tools, and automated gaming bots.
              </p>
            </div>

            {/* Latest Active API */}
            <div className="bg-[#080d1a] border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400">
                  Single Active Payment Endpoint (GET Request)
                </span>
                <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-500/30 text-indigo-400 text-[10px] font-mono font-bold rounded">
                  Auto-Expires in 10 Mins
                </span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono text-xs flex items-center justify-between gap-2 overflow-x-auto">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-indigo-400 font-bold">GET</span>
                  <span className="text-slate-300 truncate">{latestEndpointUrl}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => copyToClipboard(latestEndpointUrl, 'latest')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedLatestUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={latestEndpointUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Instant verification endpoint. Returns 200 with payment details if within 10 minutes, or 404 when expired.
              </p>
            </div>
          </div>

          {/* Live Response Payload Inspector */}
          <div className="bg-[#080d1a] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white uppercase">
                  WinGo-Style Gmail Payment Transfer JSON Output
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  HTTP 200 OK (code: 0)
                </span>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(
                      {
                        code: 0,
                        msg: 'success',
                        data: {
                          list: activePayment
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
                            : [],
                        },
                      },
                      null,
                      2
                    ),
                    'json'
                  )
                }
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy JSON
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-emerald-300 overflow-x-auto max-h-72">
              {JSON.stringify(
                {
                  code: 0,
                  msg: 'success',
                  data: {
                    list: activePayment
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
                      : [],
                  },
                },
                null,
                2
              )}
            </pre>
          </div>

          {/* HTML Embed Snippet */}
          <div className="bg-[#080d1a] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-400" />
                📄 HTML / JavaScript Integration Code (Copy into your website)
              </span>
              <button
                onClick={() => copyToClipboard(embedScriptCode, 'embed')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                {copiedEmbedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy Script
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-indigo-300 overflow-x-auto">
              {embedScriptCode}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 2: SIMULATE TEST PAYMENT */}
      {activeTab === 'simulate' && (
        <div className="bg-[#080d1a] border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Simulate FamApp Payment Alert</h3>
              <p className="text-xs text-slate-400">
                Pushes a realistic FamApp payment notification into the pipeline, activating the 10-minute validity timer.
              </p>
            </div>
          </div>

          <form onSubmit={handleSimulatePayment} className="space-y-4">
            <div>
              <label className="text-xs font-mono uppercase text-slate-400 block mb-1">Amount Received (₹)</label>
              <input
                type="number"
                step="0.1"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="text-xs font-mono uppercase text-slate-400 block mb-1">From Name</label>
              <input
                type="text"
                value={simSender}
                onChange={(e) => setSimSender(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-mono uppercase text-slate-400">UTR / Reference No (12 Digits)</label>
                <button
                  type="button"
                  onClick={() => setSimUtr(String(Math.floor(100000000000 + Math.random() * 900000000000)))}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                >
                  Generate Random
                </button>
              </div>
              <input
                type="text"
                value={simUtr}
                onChange={(e) => setSimUtr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-black rounded-xl text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {simulating ? 'Injecting...' : 'Inject Payment & Activate 10m Timer'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === 'logs' && (() => {
        const mergedMap = new Map<string, PaymentData>();
        Object.values(cloudPayments).forEach(({ record }) => {
          mergedMap.set(sanitizeFirestoreId(record.emailId || record.utr, 'pay_01', 128), record);
        });
        logs.forEach((l) => {
          mergedMap.set(sanitizeFirestoreId(l.emailId || l.utr, 'pay_01', 128), l);
        });
        const mergedLogs = Array.from(mergedMap.values()).sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
        const cloudCount = Object.keys(cloudPayments).length;

        return (
          <div className="bg-[#080d1a] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white uppercase">Processed Payment Audit Trail</span>
                {user && profileSynced && (
                  <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] font-bold flex items-center gap-1">
                    <Cloud className="w-3 h-3" />
                    Firestore Synced ({cloudCount})
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-slate-400">{mergedLogs.length} Total Logs</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">UTR</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Sender</th>
                    <th className="py-3 px-4">Processed At</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {mergedLogs.length > 0 ? (
                    mergedLogs.map((log, idx) => (
                      <tr key={log.emailId || idx} className="hover:bg-slate-900/40">
                        <td className="py-3 px-4 text-amber-300 font-bold">{log.utr}</td>
                        <td className="py-3 px-4 text-emerald-400 font-bold">{log.rawAmountText}</td>
                        <td className="py-3 px-4 text-white">{log.fromName}</td>
                        <td className="py-3 px-4 text-slate-400">{log.formattedTime}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No payment logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* TAB 4: GMAIL INBOX MONITOR */}
      {activeTab === 'inbox' && (
        <div className="bg-[#080d1a] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-mono font-bold text-white uppercase">
                Gmail Inbox Simulation ({emails.length})
              </span>
            </div>
            <button
              onClick={() => setShowComposeModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              Compose / Push Email
            </button>
          </div>

          <div className="divide-y divide-slate-800/60">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className="p-4 hover:bg-slate-900/50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 truncate">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{email.sender}</span>
                    {email.isFamPayment && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500/30">
                        FamApp Payment
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 font-medium truncate">{email.subject}</div>
                  <div className="text-[11px] text-slate-500 truncate">{email.snippet}</div>
                </div>

                <div className="text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0">{email.dateStr}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: DIRECT LOGIN */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white font-mono uppercase">Connect Gmail Account</h3>
              <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Provide the Gmail inbox address where FamApp alerts and UPI transfer emails are sent.
            </p>
            <form onSubmit={handleDirectLogin} className="space-y-4">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EMAIL DETAIL */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white font-mono uppercase">Email Message Details</h3>
              <button onClick={() => setSelectedEmail(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                ✕
              </button>
            </div>
            <div className="space-y-1 text-xs font-mono text-slate-400">
              <div>
                <span className="text-slate-500">From:</span> {selectedEmail.sender}
              </div>
              <div>
                <span className="text-slate-500">Subject:</span> {selectedEmail.subject}
              </div>
              <div>
                <span className="text-slate-500">Date:</span> {selectedEmail.dateStr}
              </div>
            </div>

            {selectedEmail.parsedPayment && (
              <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl text-xs font-mono space-y-1">
                <div className="text-emerald-400 font-bold uppercase text-[10px]">Extracted FamApp Payment:</div>
                <div className="text-slate-200">
                  Amount: <strong>{selectedEmail.parsedPayment.rawAmountText}</strong>
                </div>
                <div className="text-slate-200">
                  UTR: <strong>{selectedEmail.parsedPayment.utr}</strong>
                </div>
                <div className="text-slate-200">
                  From: <strong>{selectedEmail.parsedPayment.fromName}</strong>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-200">
              <div dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody || selectedEmail.textBody }} />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedEmail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPOSE EMAIL */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white font-mono uppercase">Push Simulated Gmail Message</h3>
              <button onClick={() => setShowComposeModal(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
                ✕
              </button>
            </div>
            <form onSubmit={handleComposeEmail} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  placeholder="You received ₹100.0 in your FamX account"
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFam"
                  checked={composeIsFam}
                  onChange={(e) => setComposeIsFam(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800"
                />
                <label htmlFor="isFam" className="text-slate-300 cursor-pointer">
                  Tag as valid FamApp Payment (Triggers parser)
                </label>
              </div>

              {composeIsFam && (
                <div>
                  <label className="text-slate-400 block mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    value={composeAmount}
                    onChange={(e) => setComposeAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="text-slate-400 block mb-1">Body / Alert Content</label>
                <textarea
                  rows={3}
                  value={composeBody}
                  placeholder="Hey Shakti, You have received ₹100 from..."
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingCompose}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {sendingCompose ? 'Sending...' : 'Send to Inbox'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
