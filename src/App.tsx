import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, FolderArchive, Activity, Server } from 'lucide-react';
import FamAppPaymentGateway from './components/FamAppPaymentGateway.js';
import WinGoPredictor from './components/WinGoPredictor.js';
import ZipHostVault from './components/ZipHostVault.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<'famapp' | 'wingo' | 'ziphost'>('famapp');
  const [latency, setLatency] = useState(24);

  // Ping backend status to measure live node latency
  useEffect(() => {
    const checkLatency = async () => {
      const start = performance.now();
      try {
        await fetch('/api/payment/famapp/status');
        setLatency(Math.max(12, Math.round(performance.now() - start)));
      } catch {
        setLatency(38);
      }
    };

    checkLatency();
    const interval = setInterval(checkLatency, 15000);
    return () => clearInterval(interval);
  }, []);

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
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
                  DEVELOPER GATEWAY NODE ONLINE
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-display flex items-center gap-2">
                FAMAPP PAYMENT <span className="text-indigo-400">&amp; WINGO API</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
                Automated FamApp Gmail payment gateway API with 10-second background scanning &amp; 10-minute auto-expiry, alongside high-speed WinGo 30S/1M prediction endpoints &amp; God-Mode protected zip website hosting.
              </p>
            </div>

            {/* Live Metrics Header Badges */}
            <div className="flex items-center gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <div className="text-left font-mono">
                  <span className="text-[9px] uppercase text-slate-500 block leading-tight">Node Latency</span>
                  <span className="text-xs font-bold text-white leading-tight">{latency}ms</span>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                <div className="text-left font-mono">
                  <span className="text-[9px] uppercase text-slate-500 block leading-tight">Gateway Engine</span>
                  <span className="text-xs font-bold text-emerald-400 leading-tight flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    ONLINE
                  </span>
                </div>
              </div>
            </div>
          </div>

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
        {activeTab === 'famapp' && <FamAppPaymentGateway />}
        {activeTab === 'wingo' && <WinGoPredictor />}
        {activeTab === 'ziphost' && <ZipHostVault />}
      </main>

      {/* Footer */}
      <footer className="mt-16 pt-6 pb-8 border-t border-slate-900 text-center text-slate-500 text-xs font-mono relative z-10">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            WinGo 30S Developer Gateway Node Online • JSON Payload compliant • Standard UTF-8 Content-Type
          </p>
          <p className="text-[10px] text-slate-600">
            System latency metrics and active draws auto-commit directly to active Firestore cluster instance.
          </p>
        </div>
      </footer>
    </div>
  );
}
