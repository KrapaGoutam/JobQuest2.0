import { useToast, type ToastItem } from '../../context/ToastContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const iconMap = {
    success: <CheckCircle2 size={16} className="success-t" aria-hidden="true" />,
    warning: <AlertTriangle size={16} className="warning-t" aria-hidden="true" />,
    danger: <AlertCircle size={16} className="danger-t" aria-hidden="true" />,
    info: <Info size={16} className="info-t" aria-hidden="true" />,
  };

  return (
    <div
      className="toast"
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px 8px 14px',
        minHeight: '40px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--inverse-bg)',
        color: 'var(--inverse-fg)',
        boxShadow: 'var(--shadow-modal)',
        maxWidth: '380px',
      }}
    >
      {iconMap[toast.type]}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{toast.title}</span>
        {toast.description && (
          <span style={{ fontSize: '12px', opacity: 0.85 }}>{toast.description}</span>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          style={{
            background: 'transparent',
            border: '1px solid currentColor',
            color: 'inherit',
            cursor: 'pointer',
            padding: '4px 10px',
            minHeight: '28px',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close notification"
        style={{
          background: 'transparent',
          border: 0,
          color: 'inherit',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          opacity: 0.8,
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
