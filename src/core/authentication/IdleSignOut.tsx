import { useCallback, useEffect, useState } from 'react';
import { env } from '@/core/config/env';
import { signOutNotice } from '@/core/api/httpClient';
import { Modal } from '@/shared/components/Modal';
import { useAuth } from './AuthContext';

/**
 * Signs the user out after env.idleTimeoutMinutes without mouse, keyboard or touch activity, so a PC left
 * unattended at a desk or in a ward doesn't stay open on patient records. A warning with a countdown appears
 * 60 seconds before; any activity (or "Stay signed in") cancels it.
 *
 * Activity in any open tab counts for all of them (shared through localStorage). A computer that slept past
 * the limit is signed out as soon as it wakes.
 */
const ACTIVITY_KEY = 'ayush360.lastActivity';
const WARN_SECONDS = 60;
const EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

let memoryActivity = Date.now(); // fallback when storage is blocked

function readActivity(): number {
  try {
    const stored = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.max(stored, memoryActivity) : memoryActivity;
  } catch {
    return memoryActivity;
  }
}

function writeActivity(at: number) {
  memoryActivity = at;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* storage blocked: memoryActivity still works for this tab */
  }
}

export function IdleSignOut() {
  const { logout } = useAuth();
  const timeoutMs = env.idleTimeoutMinutes * 60_000;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const stay = useCallback(() => {
    writeActivity(Date.now());
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (timeoutMs <= 0) return;
    writeActivity(Date.now()); // signing in / opening the app counts as activity

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 5_000) return; // mousemove fires constantly: record at most every 5 s
      lastWrite = now;
      writeActivity(now);
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));

    let signedOut = false;
    const timer = window.setInterval(() => {
      if (signedOut) return;
      const left = Math.ceil((timeoutMs - (Date.now() - readActivity())) / 1000);
      if (left <= 0) {
        signedOut = true;
        signOutNotice.set(
          `You were signed out after ${env.idleTimeoutMinutes} minutes without activity. Please sign in again.`,
        );
        void logout();
        return;
      }
      setSecondsLeft(left <= WARN_SECONDS ? left : null);
    }, 1_000);

    return () => {
      window.clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
    };
  }, [timeoutMs, logout]);

  return (
    <Modal
      title="Are you still there?"
      open={secondsLeft !== null}
      onClose={stay}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            Sign out now
          </button>
          <button type="button" className="btn btn-primary" onClick={stay} autoFocus>
            Stay signed in
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        To protect patient information, you will be signed out in{' '}
        <strong>{secondsLeft} second{secondsLeft === 1 ? '' : 's'}</strong> because there has been no activity.
      </p>
      <p style={{ margin: 0, color: 'var(--ink-2)' }}>Anything you haven't saved will be lost.</p>
    </Modal>
  );
}
