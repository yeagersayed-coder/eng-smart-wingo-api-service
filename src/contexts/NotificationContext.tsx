import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bell, CheckCircle2, Info, TrendingUp, X, Zap } from 'lucide-react';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';
export type AlertKind = 'payment' | 'wingo' | 'info';

export interface ToastAlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  message: string;
  meta?: string;
  accent: 'emerald' | 'indigo' | 'amber';
  createdAt: number;
}

export interface PaymentAlertPayload {
  emailId: string;
  amount: number;
  rawAmountText?: string;
  fromName: string;
  utr: string;
}

export interface WinGoSignalAlertPayload {
  targetPeriod: string;
  signal: 'BIG' | 'SMALL';
  color: 'GREEN' | 'RED' | 'VIOLET';
  luckyNumbers: number[];
  confidence: string;
  gameMode: '30s' | '1m';
}

export interface PushAlertInput {
  kind: AlertKind;
  title: string;
  message: string;
  meta?: string;
  accent?: 'emerald' | 'indigo' | 'amber';
  dedupeKey?: string;
  sendBrowserNotification?: boolean;
}

interface NotificationContextValue {
  permission: BrowserNotificationPermission;
  browserEnabled: boolean;
  toasts: ToastAlertItem[];
  requestPermission: () => Promise<BrowserNotificationPermission>;
  toggleBrowserAlerts: () => Promise<void>;
  dismissToast: (id: string) => void;
  pushAlert: (input: PushAlertInput) => boolean;
  notifyPaymentDetected: (payload: PaymentAlertPayload) => boolean;
  notifyWinGoSignal: (payload: WinGoSignalAlertPayload) => boolean;
}

const STORAGE_BROWSER_ALERTS_KEY = 'edgeone_browser_alerts_enabled_v1';

const getInitialPermission = (): BrowserNotificationPermission => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
};

const getInitialBrowserEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(STORAGE_BROWSER_ALERTS_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(getInitialPermission);
  const [browserEnabled, setBrowserEnabled] = useState<boolean>(getInitialBrowserEnabled);
  const [toasts, setToasts] = useState<ToastAlertItem[]>([]);
  const shouldReduceMotion = useReducedMotion();

  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const syncPermission = () => {
      setPermission(getInitialPermission());
    };
    window.addEventListener('focus', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dispatchBrowserNotification = useCallback(
    (title: string, body: string, tag?: string) => {
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (!browserEnabled || window.Notification.permission !== 'granted') return;

      try {
        const notification = new window.Notification(title, {
          body,
          tag,
          silent: false,
        });
        notification.onclick = () => {
          try {
            window.focus();
            notification.close();
          } catch {
            // Ignore focus/close errors in sandboxed iframes
          }
        };
      } catch {
        // Ignore browser notification restrictions inside nested iframes
      }
    },
    [browserEnabled]
  );

  const pushAlert = useCallback(
    (input: PushAlertInput): boolean => {
      if (input.dedupeKey) {
        if (notifiedKeysRef.current.has(input.dedupeKey)) {
          return false;
        }
        notifiedKeysRef.current.add(input.dedupeKey);
        if (notifiedKeysRef.current.size > 250) {
          const oldest = notifiedKeysRef.current.values().next().value;
          if (oldest) notifiedKeysRef.current.delete(oldest);
        }
      }

      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastAlertItem = {
        id,
        kind: input.kind,
        title: input.title,
        message: input.message,
        meta: input.meta,
        accent: input.accent || (input.kind === 'payment' ? 'emerald' : input.kind === 'wingo' ? 'indigo' : 'amber'),
        createdAt: Date.now(),
      };

      setToasts((prev) => [item, ...prev].slice(0, 4));

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5500);
      timersRef.current.set(id, timer);

      if (input.sendBrowserNotification) {
        const body = input.meta ? `${input.message} — ${input.meta}` : input.message;
        dispatchBrowserNotification(input.title, body, input.dedupeKey || id);
      }

      return true;
    },
    [dispatchBrowserNotification]
  );

  const requestPermission = useCallback(async (): Promise<BrowserNotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported');
      pushAlert({
        kind: 'info',
        title: 'In-app toast alerts active',
        message: 'Native browser notifications are unavailable in this environment.',
        accent: 'amber',
      });
      return 'unsupported';
    }

    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        setBrowserEnabled(true);
        try {
          localStorage.setItem(STORAGE_BROWSER_ALERTS_KEY, 'true');
        } catch {
          // Ignore storage errors
        }
        pushAlert({
          kind: 'info',
          title: 'Browser notifications enabled',
          message: 'Payment scans and new WinGo signals will alert you live.',
          accent: 'emerald',
        });
        try {
          new window.Notification('EdgeOne Alerts Enabled', {
            body: 'You will receive alerts for new FamApp payments and WinGo signals.',
            tag: 'edgeone-alerts-enabled',
          });
        } catch {
          // Ignore iframe restriction
        }
      } else if (result === 'denied') {
        pushAlert({
          kind: 'info',
          title: 'Browser permission blocked',
          message: 'Allow notifications in browser site settings. In-app toasts remain active.',
          accent: 'amber',
        });
      }
      return result;
    } catch {
      const current = getInitialPermission();
      setPermission(current);
      return current;
    }
  }, [pushAlert]);

  const toggleBrowserAlerts = useCallback(async () => {
    if (permission === 'unsupported') {
      pushAlert({
        kind: 'info',
        title: 'In-app toast alerts active',
        message: 'This browser view supports in-app toast alerts only.',
        accent: 'amber',
      });
      return;
    }

    if (permission === 'default') {
      await requestPermission();
      return;
    }

    if (permission === 'denied') {
      pushAlert({
        kind: 'info',
        title: 'Browser permission blocked',
        message: 'Unblock notifications from your browser address bar. In-app toasts are active.',
        accent: 'amber',
      });
      return;
    }

    setBrowserEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_BROWSER_ALERTS_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      pushAlert({
        kind: 'info',
        title: next ? 'Browser alerts resumed' : 'Browser alerts muted',
        message: next
          ? 'Desktop notifications and in-app toasts are both active.'
          : 'In-app toast alerts remain active while desktop popups are muted.',
        accent: next ? 'emerald' : 'amber',
      });
      return next;
    });
  }, [permission, pushAlert, requestPermission]);

  const notifyPaymentDetected = useCallback(
    (payload: PaymentAlertPayload): boolean => {
      const amountLabel = payload.rawAmountText || `₹${Number(payload.amount).toFixed(1)}`;
      return pushAlert({
        kind: 'payment',
        title: `Payment received · ${amountLabel}`,
        message: `From ${payload.fromName || 'FamApp Sender'}`,
        meta: `UTR ${payload.utr}`,
        accent: 'emerald',
        dedupeKey: `payment:${payload.emailId}`,
        sendBrowserNotification: true,
      });
    },
    [pushAlert]
  );

  const notifyWinGoSignal = useCallback(
    (payload: WinGoSignalAlertPayload): boolean => {
      const nums = Array.isArray(payload.luckyNumbers) ? payload.luckyNumbers.join(', ') : '';
      return pushAlert({
        kind: 'wingo',
        title: `WinGo ${payload.gameMode.toUpperCase()} signal · ${payload.signal}`,
        message: `Period #${payload.targetPeriod} · ${payload.color}`,
        meta: nums ? `Numbers ${nums} · ${payload.confidence}%` : `${payload.confidence}% confidence`,
        accent: payload.signal === 'BIG' ? 'emerald' : 'indigo',
        dedupeKey: `wingo:${payload.gameMode}:${payload.targetPeriod}:${payload.signal}`,
        sendBrowserNotification: true,
      });
    },
    [pushAlert]
  );

  return (
    <NotificationContext.Provider
      value={{
        permission,
        browserEnabled,
        toasts,
        requestPermission,
        toggleBrowserAlerts,
        dismissToast,
        pushAlert,
        notifyPaymentDetected,
        notifyWinGoSignal,
      }}
    >
      {children}

      {/* Global Toast Alert Viewport */}
      <div
        aria-live="polite"
        aria-label="Live transaction and signal alerts"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const borderClass =
              toast.accent === 'emerald'
                ? 'border-emerald-500/50 bg-slate-950/95'
                : toast.accent === 'indigo'
                ? 'border-indigo-500/50 bg-slate-950/95'
                : 'border-amber-500/50 bg-slate-950/95';

            const iconBgClass =
              toast.accent === 'emerald'
                ? 'bg-emerald-500/15 text-emerald-400'
                : toast.accent === 'indigo'
                ? 'bg-indigo-500/15 text-indigo-400'
                : 'bg-amber-500/15 text-amber-400';

            const Icon =
              toast.kind === 'payment'
                ? Zap
                : toast.kind === 'wingo'
                ? TrendingUp
                : toast.accent === 'emerald'
                ? CheckCircle2
                : Info;

            return (
              <motion.div
                key={toast.id}
                role="status"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={`pointer-events-auto rounded-xl border ${borderClass} backdrop-blur-xl shadow-2xl p-3.5 flex items-start gap-3`}
              >
                <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${iconBgClass}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white leading-snug">
                    <span className="truncate">{toast.title}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug truncate">{toast.message}</p>
                  {toast.meta && (
                    <p className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                      <Bell className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{toast.meta}</span>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside a NotificationProvider');
  }
  return ctx;
}
