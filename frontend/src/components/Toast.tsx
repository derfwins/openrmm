import { useEffect, useState } from 'react';
import { toast, type Toast as ToastType } from '../services/toastService';
import { IconSuccess, IconError, IconWarning, IconInfo } from './Icons';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

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
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${getColor(t.type)} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[300px]`}
        >
          {getIcon(t.type)}
          <span className="text-sm">{t.message}</span>
        </div>
      ))}
    </div>
  );
}