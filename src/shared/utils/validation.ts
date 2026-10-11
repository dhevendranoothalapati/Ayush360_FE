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

// Verhoeff checksum tables (UIDAI uses Verhoeff for the last digit of every Aadhaar number).
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** 12 digits, not starting with 0 or 1, valid Verhoeff check digit. Catches most typing mistakes. */
export function isValidAadhaar(digits: string): boolean {
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let c = 0;
  digits
    .split('')
    .reverse()
    .forEach((ch, i) => {
      c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]];
    });
  return c === 0;
}

/** "123456789012" -> "1234 5678 9012" (also works while typing). */
export function formatAadhaar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
