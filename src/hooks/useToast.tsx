'use client';

// /src/hooks/useToast.tsx
// SmartStock Experience V1 — Toast Notification Hook & Provider

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastMessage, ToastType } from '../components/ui/Toast';

interface ToastContextType {
  toast: (options: { type: ToastType; title: string; description?: string; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({
      type,
      title,
      description,
      duration = 4000,
    }: {
      type: ToastType;
      title: string;
      description?: string;
      duration?: number;
    }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Render Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-auto">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
