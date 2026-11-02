/** Helper định dạng dùng chung cho module quản lý người dùng. */

const decimalFormatter = new Intl.NumberFormat('vi-VN');
const DATE_LOCALE = 'vi-VN';
const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: VN_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  timeZone: VN_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function partsOf(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

function parseIsoDateOnly(value: string): { day: string; month: string; year: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: match[1], month: match[2], day: match[3] };
}

/** 12480 → "12.480" */
export function formatCount(value: number): string {
  return decimalFormatter.format(value);
}

/** 185000000 → "185.000.000 đ" */
export function formatCurrency(value: number): string {
  return `${decimalFormatter.format(Math.round(value))} đ`;
}

/** 185000000 → "185 tr" (khối thống kê trong popup hồ sơ). */
export function formatRevenueShort(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace('.', ',')} tỷ`;
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} tr`;
  return `${decimalFormatter.format(value)} đ`;
}

/** ISO 8601 → "11/05/2026" (ngày theo giờ Việt Nam). */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const dateOnly = parseIsoDateOnly(iso);
  if (dateOnly) return `${dateOnly.day}/${dateOnly.month}/${dateOnly.year}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = partsOf(dateFormatter, date);
  return `${parts['day']}/${parts['month']}/${parts['year']}`;
}

/** ISO 8601 → "13:05 11/07/2026" (giờ Việt Nam). */
export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = partsOf(dateTimeFormatter, date);
  return `${parts['hour']}:${parts['minute']} ${parts['day']}/${parts['month']}/${parts['year']}`;
}

/** ISO 8601 → "22:30 22/05/2026 (GMT+7)" — hạn khoá hiển thị trong popup kỷ luật. */
export function formatDeadline(iso: string): string {
  const formatted = formatDateTime(iso);
  return formatted === '—' ? '—' : `${formatted} (GMT+7)`;
}

/** dd/mm/yyyy → yyyy-mm-dd (chỉ dùng cho input ngày do người dùng gõ). */
export function toIsoDate(value: string): string {
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** yyyy-mm-dd của "hôm nay" theo giờ máy người dùng. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Cộng số ngày vào một ngày ISO, trả về chuỗi ISO. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Thời điểm hiện tại dạng ISO 8601 đầy đủ, dùng cho lịch sử xử lý. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Hạn khoá 22:30 giờ Việt Nam sau `days` ngày; mức vô thời hạn trả về undefined. */
export function lockDeadlineIso(days: number | null | undefined): string | undefined {
  if (!days) return undefined;
  return `${addDaysIso(todayIso(), days)}T22:30:00+07:00`;
}
