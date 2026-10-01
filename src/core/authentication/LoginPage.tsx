import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { canOpenPath } from '@/core/modules/registry';
import { env } from '@/core/config/env';
import { ApiError } from '@/core/api/httpClient';
import { BrandMark, Icon, type IconName } from '@/shared/components/Icons';

const SHOWCASE_POINTS: { title: string; text: string; icon: IconName; accent: string }[] = [
  { title: 'Register in under a minute', text: 'Search, register, collect fee and issue a token', icon: 'registration', accent: 'teal' },
  { title: 'Live patient queue', text: 'Every desk sees the same queue in real time', icon: 'queue', accent: 'blue' },
  { title: 'Modules you can add any time', text: 'Billing, Doctor, Nursing, Pharmacy, Lab, Payroll', icon: 'plus', accent: 'violet' },
  { title: 'Secure for every hospital', text: 'Each hospital sees only its own data', icon: 'lock', accent: 'amber' },
];
import { useAuth } from './AuthContext';
import './login.css';

export default function LoginPage() {
  const { status, user, login } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Go back to the page the user wanted only if this user may open it (e.g. after a
  // receptionist signs out and a doctor signs in); otherwise go to their own home page.
  if (status === 'authenticated' && user) {
    return <Navigate to={canOpenPath(user, from) ? from : '/'} replace />;
  }

  async function signIn(u: string, p: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login({ username: u.trim(), password: p }); // the redirect above runs on re-render
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(username, password);
  }

  return (
    <div className="login-page">
      <aside className="login-showcase" aria-hidden="true">
        <div className="showcase-brand">
          <BrandMark size={40} />
          <span>{env.appName}</span>
        </div>
        <div className="showcase-body">
          <h2>
            One platform for
            <br />
            every hospital desk.
          </h2>
          <p>Registration, queue, billing, doctors, nursing, pharmacy and lab — switch on only what you need.</p>
          <ul className="showcase-points">
            {SHOWCASE_POINTS.map((point) => (
              <li key={point.title}>
                <span className={`icon-badge accent-${point.accent}`}>
                  <Icon name={point.icon} size={18} />
                </span>
                <span>
                  <strong>{point.title}</strong>
                  <small>{point.text}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="showcase-foot">Better care for a healthier tomorrow</div>
      </aside>

      <div className="login-card">
        <div className="login-brand">
          <BrandMark size={44} />
          <div>
            <h1>Welcome back</h1>
            <p>Sign in to {env.appName} Hospital Management System</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={submitting || !username || !password}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
