/**
 * Timezone helpers for P2/P5.
 *
 * All persisted timestamps stay UTC; formatting happens at the edge with an
 * explicit IANA zone so DST transitions are resolved by the platform ICU data.
 */

export const FALLBACK_TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Pacific/Auckland',
  'UTC'
];

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 64) return false;
  // Tên IANA bắt đầu bằng chữ cái; loại chuỗi offset như "+07:00".
  if (!/^[A-Za-z][A-Za-z0-9_+\-/.]+$/.test(value.trim())) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Returns the browser zone when it is a valid IANA identifier. */
export function detectTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(zone) ? zone : 'Asia/Ho_Chi_Minh';
  } catch {
    return 'Asia/Ho_Chi_Minh';
  }
}

export function listTimezones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf?.('timeZone');
  const all = Array.isArray(supported) && supported.length ? supported : FALLBACK_TIMEZONES;
  return Array.from(new Set(all)).sort((left, right) => left.localeCompare(right));
}

export function formatInTimezone(
  value: string | Date | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }
): string {
  if (value === null || value === undefined) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: timezone }).format(date);
  } catch {
    return '';
  }
}

/** UTC offset in minutes for a given instant, used to prove DST handling in tests. */
export function timezoneOffsetMinutes(value: string | Date, timezone: string): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()) || !isValidTimezone(timezone)) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value])
    );
    const asUtc = Date.UTC(
      Number(parts['year']),
      Number(parts['month']) - 1,
      Number(parts['day']),
      Number(parts['hour']),
      Number(parts['minute']),
      Number(parts['second'])
    );
    return Math.round((asUtc - date.getTime()) / 60_000);
  } catch {
    return null;
  }
}
