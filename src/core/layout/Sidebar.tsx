import { NavLink } from 'react-router-dom';
import { useCurrentUser } from '@/core/authentication/AuthContext';
import { MODULES, visibleNavigation } from '@/core/modules/registry';
import { Icon } from '@/shared/components/Icons';

const MODULE_ROOTS = new Set(MODULES.map((m) => m.basePath));

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const user = useCurrentUser();
  const groups = visibleNavigation(user);
  const licensed = MODULES.filter((m) => user.tenant.enabledModules.includes(m.code)).length;

  return (
    <nav className="app-sidebar" aria-label="Main navigation">
      {groups.map((group) => (
        <div className="nav-group" key={group.title}>
          <div className="nav-group-title">{group.title}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              // A module's root link should not stay highlighted on its sub-pages.
              end={MODULE_ROOTS.has(item.path)}
              className={({ isActive }) => `nav-link accent-${item.accent} ${isActive ? 'active' : ''}`}
              onClick={onNavigate}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={19} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}

      <div className="sidebar-plan">
        <div className="plan-title">{user.tenant.name}</div>
        <div className="plan-meta">
          {licensed} of {MODULES.length} modules active
        </div>
        <div className="plan-bar" aria-hidden="true">
          <span style={{ width: `${(licensed / MODULES.length) * 100}%` }} />
        </div>
        <div className="plan-tagline">Better care for a healthier tomorrow</div>
      </div>
    </nav>
  );
}
