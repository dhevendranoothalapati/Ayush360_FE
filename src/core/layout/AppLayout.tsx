import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { IdleSignOut } from '@/core/authentication/IdleSignOut';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import './layout.css';

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <Header onToggleNav={() => setNavOpen((o) => !o)} />
      <div className="app-body">
        <Sidebar onNavigate={() => setNavOpen(false)} />
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />}
        <main className="app-main" id="main-content">
          <Outlet />
        </main>
      </div>
      <IdleSignOut />
    </div>
  );
}
