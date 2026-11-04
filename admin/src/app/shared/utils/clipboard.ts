/**
 * Copies text to the clipboard. The async Clipboard API only works in secure contexts
 * (https or localhost), so a selection-based fallback keeps the feature usable when
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
  if (typeof document === 'undefined') return false;
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
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}
