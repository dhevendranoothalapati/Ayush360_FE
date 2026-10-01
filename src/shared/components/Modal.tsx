import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icons';
import './modal.css';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
}

export function Modal({ title, open, onClose, children, footer, closeDisabled }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, closeDisabled]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => !closeDisabled && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={closeDisabled} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
