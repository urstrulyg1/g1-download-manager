/**
 * Lightweight toast notification primitive.
 *
 * Usage:
 *   const [toasts, addToast] = useToasts();
 *   addToast('Saved!', 'success');
 *   ...
 *   <ToastContainer toasts={toasts} onDismiss={dismissToast} />
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastEntry {
  id: string;
  message: string;
  variant: ToastVariant;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToasts(): [ToastEntry[], (message: string, variant?: ToastVariant, durationMs?: number) => void, (id: string) => void] {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const add = useCallback((message: string, variant: ToastVariant = 'info', durationMs = 4000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
    if (durationMs > 0) {
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    }
  }, [dismiss]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => { timers.current.forEach((t) => clearTimeout(t)); };
  }, []);

  return [toasts, add, dismiss];
}

// ─── Container ───────────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
}

const ICON: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  error:   <XCircle      className="w-4 h-4 text-rose-400    shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400  shrink-0" />,
  info:    <Info          className="w-4 h-4 text-blue-400   shrink-0" />,
};

const BG: Record<ToastVariant, string> = {
  success: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200',
  error:   'bg-rose-950/60    border-rose-500/40    text-rose-200',
  warning: 'bg-amber-950/60   border-amber-500/40   text-amber-200',
  info:    'bg-blue-950/60    border-blue-500/40    text-blue-200',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 ${BG[toast.variant]}`}
        >
          {ICON[toast.variant]}
          <span className="flex-1 leading-relaxed">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
