import { useEffect, useRef, useState } from 'react';
import { useAuth, useCurrentUser } from '@/core/authentication/AuthContext';
import { BrandMark, Icon } from '@/shared/components/Icons';
import { formatDateLong, formatTime } from '@/shared/utils/format';
import { env } from '@/core/config/env';

function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function initials(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Header({ onToggleNav }: { onToggleNav: () => void }) {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <header className="app-header">
      <button className="icon-btn nav-toggle" onClick={onToggleNav} aria-label="Toggle navigation">
        <Icon name="menu" />
      </button>
      <div className="brand">
        <BrandMark size={38} />
        <div className="brand-text">
          <span className="brand-name">{env.appName}</span>
          <span className="brand-sub">{user.tenant.name}</span>
        </div>
      </div>

      <div className="header-right">
        <div className="header-clock">
          <span>{formatDateLong(now)}</span>
          <span>{formatTime(now)}</span>
        </div>
        <div className="user-menu" ref={menuRef}>
          <button className="user-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            <span className="avatar" aria-hidden="true">
              {initials(user.displayName)}
            </span>
            <span className="user-text">
              <span className="user-name">{user.displayName}</span>
              <span className="user-role">{user.roles.join(', ')}</span>
            </span>
            <Icon name="chevronDown" size={16} />
          </button>
          {menuOpen && (
            <div className="menu" role="menu">
              <div className="menu-info">
                <strong>{user.displayName}</strong>
                <span>{user.email}</span>
                <span>
                  {user.tenant.name}, {user.tenant.city}
                </span>
              </div>
              <button className="menu-item" role="menuitem" onClick={() => void logout()}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
