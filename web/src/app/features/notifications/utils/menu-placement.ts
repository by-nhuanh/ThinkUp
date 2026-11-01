/**
 * Chọn hướng mở cho menu nổi (dropdown, menu 3 chấm) dựa trên khoảng trống thực tế
 * của CSS viewport tại thời điểm mở - không giả định luôn có chỗ bên dưới trigger.
 *
 * Trả về true khi nên mở lên trên. Viewport thấp hoặc zoom lớn sẽ đảo hướng
 * thay vì để menu bị cắt khỏi vùng nhìn thấy.
 */
export function preferMenuAbove(trigger: HTMLElement, estimatedHeight: number, margin = 12): boolean {
  if (typeof window === 'undefined') return false;

  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  return spaceBelow < estimatedHeight + margin && spaceAbove > spaceBelow;
}

/**
 * Di chuyển focus giữa các mục menu bằng Arrow/Home/End theo WAI-ARIA.
 * Bỏ qua mục đang disabled để không đưa focus vào control không thao tác được.
 */
export function moveMenuFocus(
  event: KeyboardEvent,
  container: HTMLElement,
  selector = '[role="menuitem"]:not([disabled]), [role="option"]'
): void {
  const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (item) => !item.hasAttribute('disabled')
  );
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex: number | null = null;

  switch (event.key) {
    case 'ArrowDown':
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      break;
    case 'ArrowUp':
      nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = items.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  items[nextIndex]?.focus();
}
