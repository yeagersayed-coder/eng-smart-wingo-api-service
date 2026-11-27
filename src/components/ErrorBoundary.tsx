import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  parsedInfo: {
    error?: string;
    operationType?: string;
    path?: string | null;
  } | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '', parsedInfo: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    let parsedInfo: ErrorBoundaryState['parsedInfo'] = null;
    try {
      const candidate = JSON.parse(raw);
      if (candidate && typeof candidate === 'object' && 'operationType' in candidate) {
        parsedInfo = candidate;
      }
    } catch {
      // Not a JSON FirestoreErrorInfo payload
    }
    return {
      hasError: true,
      message: raw,
      parsedInfo,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#030712] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#090d1a] border border-rose-500/40 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-white font-mono uppercase">
                {this.state.parsedInfo ? 'Firestore Security / Connection Notice' : 'Application Error'}
              </h2>
              <p className="text-xs text-slate-400">
                {this.state.parsedInfo
                  ? 'A Firestore operation was blocked or encountered a permission error.'
                  : 'An unexpected client error occurred.'}
              </p>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-rose-200 overflow-x-auto space-y-1.5">
            {this.state.parsedInfo ? (
              <>
                <div>
                  <span className="text-slate-500">Operation:</span>{' '}
                  <span className="text-amber-300 uppercase">{this.state.parsedInfo.operationType}</span>
                </div>
                {this.state.parsedInfo.path && (
                  <div>
                    <span className="text-slate-500">Path:</span>{' '}
                    <span className="text-indigo-300">{this.state.parsedInfo.path}</span>
                  </div>
                )}
                <div className="pt-1 text-rose-300 break-words">
                  {this.state.parsedInfo.error}
                </div>
              </>
            ) : (
              <div className="break-words">{this.state.message}</div>
            )}
          </div>

          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '', parsedInfo: null })}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recover &amp; Retry
          </button>
        </div>
      </div>
    );
  }
}
