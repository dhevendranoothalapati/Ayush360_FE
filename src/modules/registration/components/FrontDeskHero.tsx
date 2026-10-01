import { useCurrentUser } from '@/core/authentication/AuthContext';
import { Icon, type IconName } from '@/shared/components/Icons';
import { formatCurrency } from '@/shared/utils/format';
import type { TodaySummary } from '../types';

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface Stat {
  label: string;
  value: string;
  sub?: string;
  icon: IconName;
}

/** Colourful page header with today's front desk numbers. */
export function FrontDeskHero({ summary }: { summary: TodaySummary | null }) {
  const user = useCurrentUser();
  const firstName = user.displayName.replace(/^dr\.?\s+/i, '').split(' ')[0];

  const stats: Stat[] = [
    { label: 'Registered today', value: summary ? String(summary.registeredToday) : '–', icon: 'registration' },
    { label: 'Waiting in queue', value: summary ? String(summary.waiting) : '–', icon: 'queue' },
    { label: 'New patients', value: summary ? String(summary.newPatients) : '–', icon: 'user' },
    summary && summary.totalCollectedToday !== null
      ? {
          label: 'Total collected',
          value: formatCurrency(summary.totalCollectedToday),
          sub: `Mine ${formatCurrency(summary.myCollectedToday)}`,
          icon: 'billing',
        }
      : { label: 'My collection', value: summary ? formatCurrency(summary.myCollectedToday) : '–', icon: 'billing' },
  ];

  return (
    <section className="fd-hero" aria-label="Front desk overview">
      <div className="fd-hero-text">
        <span className="fd-hero-kicker">Front Desk · {user.tenant.name}</span>
        <h1 className="fd-hero-title">
          {greeting()}, {firstName}
        </h1>
      </div>
      <div className="fd-stats">
        {stats.map((s) => (
          <div className="fd-stat" key={s.label}>
            <span className="fd-stat-icon">
              <Icon name={s.icon} size={18} />
            </span>
            <span className="fd-stat-value">{s.value}</span>
            <span className="fd-stat-label">{s.label}</span>
            {s.sub && <span className="fd-stat-sub">{s.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
