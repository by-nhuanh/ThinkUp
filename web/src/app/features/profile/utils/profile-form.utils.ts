/**
 * Tiện ích dùng riêng cho module hồ sơ học viên.
 * Không phụ thuộc component để có thể test độc lập.
 */

/** Che email: giữ ký tự đầu + domain. a••••••@email.com */
export function maskEmail(email: string | undefined | null): string {
  const value = (email ?? '').trim();
  const at = value.indexOf('@');
  if (at <= 0) return value;
  const local = value.slice(0, at);
  const domain = value.slice(at);
  if (local.length <= 1) return `•${domain}`;
  return `${local[0]}${'•'.repeat(Math.max(6, local.length - 1))}${domain}`;
}

/** Che số điện thoại: 0••• ••• ••21 */
export function maskPhone(phone: string | undefined | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 4) return phone ?? '';
  const head = digits.slice(0, 1);
  const tail = digits.slice(-2);
  return `${head}••• ••• ••${tail}`;
}

/** Chuẩn hoá ngày sinh về DD/MM/YYYY, trả về null nếu không hợp lệ. */
export function parseBirthDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!valid) return null;
  if (date.getTime() > Date.now()) return null;
  if (year < 1900) return null;
  return date;
}

/** Tên/Họ: chỉ cho chữ cái (kể cả tiếng Việt), khoảng trắng, gạch nối, nháy đơn. */
export function isValidPersonName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[\p{L}\s'-]+$/u.test(trimmed);
}

/**
 * Liên kết MXH: cho phép username rút gọn hoặc URL đầy đủ.
 * `host` là tên miền gốc, ví dụ facebook.com.
 */
export function isValidSocialLink(value: string, host: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/\s/.test(trimmed)) return false;

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  if (/^https?:\/\//i.test(trimmed) && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(trimmed)) {
    return false;
  }

  const hostPattern = new RegExp(`^(www\\.)?${host.replace(/\./g, '\\.')}/`, 'i');
  if (hostPattern.test(withoutProtocol)) {
    return withoutProtocol.length > host.length + 1;
  }

  // Cho phép username rút gọn: không chứa dấu / hoặc chỉ có 1 dấu / ở đầu (@user)
  return /^@?[\p{L}\p{N}._-]+$/u.test(trimmed);
}

/** Bio: bỏ toàn bộ thẻ HTML nguy hiểm, giữ lại B/I/BR/P/STRONG/EM. */
export function sanitizeBioHtml(html: string): string {
  if (!html) return '';
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI']);
  const template = document.createElement('template');
  template.innerHTML = html;

  const walk = (node: Node): void => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!allowed.has(el.tagName)) {
          el.replaceWith(...Array.from(el.childNodes));
          walk(node);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        walk(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    }
  };

  walk(template.content);
  return template.innerHTML;
}

/** Đếm ký tự hiển thị (không tính markup) của nội dung bio. */
export function bioTextLength(html: string): number {
  if (!html) return 0;
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return (template.content.textContent ?? '').replace(/\u00a0/g, ' ').length;
}
