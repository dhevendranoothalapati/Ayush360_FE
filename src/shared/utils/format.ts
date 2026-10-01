const LOCALE = 'en-IN';

export function formatDateLong(d: Date): string {
  return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })}, ${formatTime(d)}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

/** "9876543210" -> "+91 98765 43210" */
export function formatMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : mobile;
}

export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function fullName(p: { firstName: string; middleName?: string | null; lastName: string }): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
}
