/** Định dạng thời gian cho danh sách và popover thông báo. */

export type NotificationTimeGroup = 'today' | 'yesterday' | 'earlier';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function dayDistance(from: Date, to: Date): number {
  return Math.round((startOfDay(from) - startOfDay(to)) / DAY);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function clock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Figma hiển thị mốc trong ngày theo 12 giờ: "10:30 AM". */
function clock12(date: Date): string {
  const hours = date.getHours();
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hour12)}:${pad(date.getMinutes())} ${suffix}`;
}

function shortDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function notificationTimeGroup(iso: string, now: Date = new Date()): NotificationTimeGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'earlier';

  const distance = dayDistance(now, date);
  if (distance <= 0) return 'today';
  if (distance === 1) return 'yesterday';
  return 'earlier';
}

/** Dùng cho danh sách: "10:30 AM", "Hôm qua, 21:30", "2 ngày trước", "12/05/2026". */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const distance = dayDistance(now, date);
  if (distance <= 0) return clock12(date);
  if (distance === 1) return `Hôm qua, ${clock(date)}`;
  if (distance < 7) return `${distance} ngày trước`;
  return shortDate(date);
}

/** Dùng cho popover: "5 phút trước", "1 giờ trước", "Hôm qua", "3 ngày trước". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return 'Vừa xong';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;

  const distance = dayDistance(now, date);
  if (distance === 0) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  if (distance === 1) return 'Hôm qua';
  if (distance < 7) return `${distance} ngày trước`;
  return shortDate(date);
}
