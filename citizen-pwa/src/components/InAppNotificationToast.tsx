import { useEffect } from 'react';
import { Info, X, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export const InAppNotificationToast: React.FC = () => {
  const inAppToast = useAppStore((state) => state.inAppToast);
  const dismiss = useAppStore((state) => state.dismissInAppNotification);

  useEffect(() => {
    if (!inAppToast) return;
    const timer = setTimeout(() => {
      dismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [inAppToast, dismiss]);

  if (!inAppToast) return null;

  const isAlert = inAppToast.type === 'alert';

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        top: '12px',
        left: '14px',
        right: '14px',
        zIndex: 9999,
        background: isAlert
          ? 'linear-gradient(135deg, rgba(30, 16, 53, 0.95) 0%, rgba(220, 38, 38, 0.25) 100%)'
          : 'linear-gradient(135deg, rgba(13, 19, 34, 0.95) 0%, rgba(139, 92, 246, 0.25) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${isAlert ? 'rgba(239, 68, 68, 0.5)' : 'rgba(167, 139, 250, 0.4)'}`,
        borderRadius: '14px',
        padding: '12px 14px',
        boxShadow: isAlert
          ? '0 12px 32px rgba(239, 68, 68, 0.3), 0 0 16px rgba(239, 68, 68, 0.2)'
          : '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(139, 92, 246, 0.2)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        cursor: 'pointer',
        animation: 'slideDownToast 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <style>
        {`
          @keyframes slideDownToast {
            from { transform: translateY(-100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}
      </style>

      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          backgroundColor: isAlert ? 'rgba(239, 68, 68, 0.25)' : 'rgba(139, 92, 246, 0.25)',
          color: isAlert ? '#f87171' : '#c084fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {isAlert ? <ShieldAlert size={18} /> : <Info size={18} />}
      </div>

      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: '0.84rem', color: '#ffffff', display: 'block', marginBottom: '2px' }}>
          {inAppToast.title}
        </strong>
        <p style={{ margin: 0, fontSize: '0.76rem', color: '#e2e8f0', lineHeight: 1.35 }}>
          {inAppToast.body}
        </p>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          padding: '2px'
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default InAppNotificationToast;
