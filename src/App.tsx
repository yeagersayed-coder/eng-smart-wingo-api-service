import React, { useState } from 'react';
import { Zap, TrendingUp, FolderArchive, Activity, Server, Download, LogIn, LogOut, Cloud, AlertTriangle, Bell, BellOff, BellRing } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import FamAppPaymentGateway from './components/FamAppPaymentGateway.js';
import WinGoPredictor from './components/WinGoPredictor.js';
import ZipHostVault from './components/ZipHostVault.js';
import { useFirebase } from './contexts/FirebaseContext.js';
import { useNotifications } from './contexts/NotificationContext.js';

export default function App() {
  const { user, authReady, profileSynced, dbConnected, firestoreLatencyMs, signingIn, authError, signInWithGoogle, signOutUser } = useFirebase();
  const { permission, browserEnabled, toggleBrowserAlerts } = useNotifications();
  const [activeTab, setActiveTab] = useState<'famapp' | 'wingo' | 'ziphost'>('famapp');

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white relative">
      {/* Dynamic Background Glow Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-rose-600/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[25%] w-[50vw] h-[50vw] rounded-full bg-emerald-600/10 blur-[150px]" />
      </div>

      {/* Main App Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full animate-pulse ${dbConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${dbConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  ZERO-API STANDALONE • FIREBASE {dbConnected ? 'CONNECTED' : 'LOCAL ENGINE'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-display flex items-center gap-2">
                FAMAPP PAYMENT <span className="text-indigo-400">&amp; WINGO SUITE</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
                100% API-Free client engine connected directly to Cloud Firestore — FamApp 10-second scanner &amp; 10-minute auto-expiry, deterministic WinGo 30S/1M predictor, and browser-native God-Mode ZIP vault.
              </p>
            </div>

            {/* Live Metrics Header Badges */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <div className="text-left font-mono">
                  <span className="text-[9px] uppercase text-slate-500 block leading-tight">Firebase Ping</span>
                  <span className="text-xs font-bold text-white leading-tight">{firestoreLatencyMs}ms</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <div className="text-left font-mono">
                  <span className="text-[9px] uppercase text-slate-500 block leading-tight">Core Mode</span>
                  <span className="text-xs font-bold text-emerald-400 leading-tight flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    NO-API + FB
                  </span>
                </div>
              </div>

              {authReady && (
                user ? (
                  <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl px-3 py-1.5 flex items-center gap-2.5 font-mono">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || 'User'} className="w-6 h-6 rounded-lg object-cover border border-slate-700" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[11px] font-bold text-emerald-300">
                        {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left leading-tight">
                      <span className="text-[9px] uppercase text-emerald-400 flex items-center gap-1 font-bold">
                        <Cloud className="w-2.5 h-2.5" />
                        {profileSynced ? 'Firestore Synced' : 'Connecting...'}
                      </span>
                      <span className="text-[11px] font-bold text-white block max-w-[140px] truncate">
                        {user.displayName || user.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={signOutUser}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                      title="Sign out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={signingIn}
                    className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded-xl px-3.5 py-2 flex items-center gap-2 text-emerald-200 hover:text-white transition font-mono text-xs font-bold cursor-pointer disabled:opacity-50"
                    title="Sign in with Google to sync payments, WinGo signals & ZipHost keys to Firestore"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{signingIn ? 'Signing in...' : 'Google Cloud Sync'}</span>
                  </button>
                )
              )}

              <button
                type="button"
                onClick={toggleBrowserAlerts}
                className={`rounded-xl px-3.5 py-2 flex items-center gap-2 transition font-mono text-xs font-bold cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  permission === 'granted' && browserEnabled
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-200 hover:text-white'
                    : permission === 'denied'
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/35 text-amber-200 hover:text-white'
                    : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
                }`}
                title={
                  permission === 'granted'
                    ? browserEnabled
                      ? 'Browser & toast alerts enabled (click to mute desktop popups)'
                      : 'Desktop popups muted (click to resume)'
                    : permission === 'denied'
                    ? 'Browser notifications blocked in site settings; in-app toast alerts active'
                    : 'Enable native browser notifications for payment scans & WinGo signals'
                }
              >
                {permission === 'granted' && browserEnabled ? (
                  <BellRing className="w-3.5 h-3.5 text-emerald-400" />
                ) : permission === 'granted' && !browserEnabled ? (
                  <BellOff className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Bell className="w-3.5 h-3.5 text-indigo-400" />
                )}
                <span>
                  {permission === 'granted'
                    ? browserEnabled
                      ? 'Alerts On'
                      : 'Alerts Muted'
                    : permission === 'denied'
                    ? 'Toasts On'
                    : permission === 'unsupported'
                    ? 'Toasts Active'
                    : 'Enable Alerts'}
                </span>
              </button>

              <a
                href="/api/project-export/edgeone-zip"
                download="famapp-wingo-edgeone-clean.zip"
                className="bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 rounded-xl px-3.5 py-2 flex items-center gap-2 text-indigo-200 hover:text-white transition font-mono text-xs font-bold cursor-pointer"
                title="Download clean EdgeOne Pages ready project ZIP"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>EdgeOne ZIP</span>
              </a>
            </div>
          </div>
          {authError && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 font-mono text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">{authError}</span>
            </div>
          )}

          {/* Primary Navigation Tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 max-w-fit">
            <button
              onClick={() => setActiveTab('famapp')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'famapp'
                  ? 'bg-gradient-to-r from-rose-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-300" />
              FamApp Payment Gateway API
            </button>

            <button
              onClick={() => setActiveTab('wingo')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'wingo'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-black shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              WinGo API &amp; Predictor
            </button>

            <button
              onClick={() => setActiveTab('ziphost')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'ziphost'
                  ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <FolderArchive className="w-4 h-4 text-amber-400" />
              Zip Host &amp; Anti-Steal Vault
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 pb-24 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.995 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === 'famapp' && <FamAppPaymentGateway />}
            {activeTab === 'wingo' && <WinGoPredictor />}
            {activeTab === 'ziphost' && <ZipHostVault />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-16 pt-6 pb-8 border-t border-slate-900 text-center text-slate-500 text-xs font-mono relative z-10">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            WinGo 30S Developer Gateway Node Online • JSON Payload compliant • Standard UTF-8 Content-Type
          </p>
          <p className="text-[10px] text-slate-600">
            Firestore Cluster (owner-jabed-islam): {dbConnected ? 'Connected' : 'Standby'} • {user ? `Authenticated as ${user.email}` : 'Sign in with Google to enable cloud sync'}
          </p>
        </div>
      </footer>
    </div>
  );
}
