export type PwaPlatform = 'ios' | 'android' | 'desktop';

export function detectPwaPlatform(userAgent: string, maxTouchPoints = 0): PwaPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}
