import { useEffect, useState } from 'react';
import { toast, type Toast as ToastType } from '../services/toastService';
import { IconSuccess, IconError, IconWarning, IconInfo, IconClose } from './Icons';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [exiting, setExiting] = useState<Set<string>>(new Set());

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  const dismiss = (id: string) => {
    setExiting(prev => new Set(prev).add(id));
    setTimeout(() => toast.dismiss(id), 200);
  };

  const getIcon = (type: ToastType['type']) => {
    switch (type) {
      case 'success': return <IconSuccess size={18} />;
      case 'error': return <IconError size={18} />;
      case 'warning': return <IconWarning size={18} />;
      default: return <IconInfo size={18} />;
    }
  };

  const getColor = (type: ToastType['type']) => {
    switch (type) {
      case 'success': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      case 'warning': return 'bg-yellow-600';
      default: return 'bg-blue-600';
    }
  };

  // Auto-dismiss after 4s
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of toasts) {
      if (!exiting.has(t.id)) {
        timers.push(setTimeout(() => dismiss(t.id), 4000));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [toasts.length]);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${getColor(t.type)} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[300px] ${exiting.has(t.id) ? 'animate-slide-out' : 'animate-slide-in'}`}
        >
          {getIcon(t.type)}
          <span className="text-sm flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100 transition-opacity ml-2">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}