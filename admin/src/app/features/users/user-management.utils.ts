/** Helper định dạng dùng chung cho module quản lý người dùng. */

const decimalFormatter = new Intl.NumberFormat('vi-VN');

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

/** dd/mm/yyyy → yyyy-mm-dd để so sánh khoảng ngày. */
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

/** "22:30:00 22/05/2026 (GMT+7)" — hạn khoá tài khoản hiển thị trong popup kỷ luật. */
export function formatDeadline(iso: string): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  return `22:30:00 ${day}/${month}/${year} (GMT+7)`;
}
