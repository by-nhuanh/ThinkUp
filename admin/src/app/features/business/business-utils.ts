export const money = (value: number): string => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
export const dateTime = (value: string): string => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh'
}).format(new Date(value));

export type PaginationItem = { kind: 'page'; value: number } | { kind: 'ellipsis' };

export function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const pageItem = (value: number): PaginationItem => ({ kind: 'page', value });
  const ellipsis: PaginationItem = { kind: 'ellipsis' };

  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => pageItem(index + 1));
  if (page <= 3) return [pageItem(1), pageItem(2), pageItem(3), ellipsis, pageItem(totalPages)];
  if (page >= totalPages - 2) return [pageItem(1), ellipsis, pageItem(totalPages - 2), pageItem(totalPages - 1), pageItem(totalPages)];
  return [pageItem(1), ellipsis, pageItem(page), ellipsis, pageItem(totalPages)];
}

export function matchesDates(value: string, from: string, to: string): boolean {
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

/**
 * Mức giảm tối đa áp dụng cho một lượt dùng của voucher.
 * Voucher phần trăm bị giới hạn bởi trần giảm tối đa nên lấy maxDiscount làm mức tối đa.
 */
export function voucherMaxDiscountPerUse(voucher: { discountType: 'percent' | 'fixed'; discountValue: number; maxDiscount?: number }): number {
  return voucher.discountType === 'percent' ? (voucher.maxDiscount ?? 0) : voucher.discountValue;
}

/**
 * Ngân sách chiết khấu tối đa của một voucher: limit × mức giảm tối đa mỗi lượt.
 * Đây là tổng chiết khấu voucher cam kết; ai chịu chiết khấu thì xem theo voucher.sponsor.
 */
export function voucherFundedAmount(voucher: {
  limit: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
}): number {
  return voucher.limit * voucherMaxDiscountPerUse(voucher);
}

/**
 * Chiết khấu đã thực chi tiêu theo số lượt đã dùng (dùng cho báo cáo đối soát).
 */
export function voucherSpentAmount(voucher: {
  used: number;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
}): number {
  return voucher.used * voucherMaxDiscountPerUse(voucher);
}

/**
 * Copies text to the clipboard. The async Clipboard API only works in secure contexts
 * (https or localhost), so a selection based fallback keeps the feature usable when
 * the admin is opened through a LAN address.
 */
export async function copyText(value: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or insecure context: fall back to the legacy command below.
    }
  }
  return copyWithSelection(value);
}

function copyWithSelection(value: string): boolean {
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, value.length);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  document.body.removeChild(area);
  return copied;
}
