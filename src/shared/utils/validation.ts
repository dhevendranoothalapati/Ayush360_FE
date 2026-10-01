export const patterns = {
  /** Indian mobile number: 10 digits starting 6-9. */
  mobile: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** Indian PIN code. */
  postalCode: /^[1-9]\d{5}$/,
  name: /^[A-Za-z][A-Za-z .'-]*$/,
};

export function digitsOnly(value: string, maxLength?: number): string {
  const d = value.replace(/\D/g, '');
  return maxLength ? d.slice(0, maxLength) : d;
}

export function isBlank(v: string | null | undefined): boolean {
  return !v || v.trim().length === 0;
}
