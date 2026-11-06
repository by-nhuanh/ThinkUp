import { Pipe, PipeTransform, inject } from '@angular/core';
import { AdminDisplayPreferencesService } from '../../core/services/admin-display-preferences.service';

/**
 * P7 — mask sensitive text. In `blur` mode the raw value stays in the DOM and the
 * `.sensitive` class blurs it through CSS; in `mask` mode the value is replaced.
 */
@Pipe({ name: 'adminPrivacy', standalone: true, pure: false })
export class AdminPrivacyPipe implements PipeTransform {
  private readonly preferences = inject(AdminDisplayPreferencesService);

  transform(value: string | null | undefined): string {
    if (!value) return '';
    return this.preferences.privacyMode() === 'mask' ? maskValue(value) : value;
  }
}

export function maskValue(value: string): string {
  const trimmed = value.trim();
  const email = /^([^@\s]+)@([^@\s]+)$/.exec(trimmed);
  if (email) {
    const [local, domain] = email.slice(1);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }
  const digits = trimmed.replace(/\s+/g, '');
  if (/^\+?\d{8,15}$/.test(digits)) {
    const prefix = digits.slice(0, Math.min(3, digits.length - 2));
    const suffix = digits.slice(-2);
    return `${prefix}${'*'.repeat(Math.max(3, digits.length - prefix.length - suffix.length))}${suffix}`;
  }
  if (trimmed.length <= 2) return '*'.repeat(trimmed.length);
  return `${trimmed.slice(0, 1)}${'*'.repeat(Math.min(6, trimmed.length - 2))}${trimmed.slice(-1)}`;
}