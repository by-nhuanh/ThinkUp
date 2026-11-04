import { Pipe, PipeTransform, inject } from '@angular/core';
import { AdminDisplayPreferencesService } from '../../core/services/admin-display-preferences.service';
import { AdminI18nService } from '../../core/i18n/admin-i18n.service';

const formatters = new Map<string, { full: Intl.NumberFormat; compact: Intl.NumberFormat }>();

function formattersFor(locale: string) {
  let entry = formatters.get(locale);
  if (!entry) {
    entry = {
      full: new Intl.NumberFormat(locale),
      compact: new Intl.NumberFormat(locale, {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1
      })
    };
    formatters.set(locale, entry);
  }
  return entry;
}

/**
 * P7/P9 — number display. `full` keeps the grouped format used across the admin
 * UI; `compact` uses short notation (12,5 N / 2,5 T). Locale follows the language
 * preference, which defaults to vi-VN. Non-numeric input passes through untouched
 * so pre-formatted strings are safe.
 */
@Pipe({ name: 'adminNumber', standalone: true, pure: false })
export class AdminNumberPipe implements PipeTransform {
  private readonly preferences = inject(AdminDisplayPreferencesService);
  private readonly i18n = inject(AdminI18nService);

  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) return value;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    const locale = this.i18n.language() === 'en' ? 'en-US' : 'vi-VN';
    const format = formattersFor(locale);
    return this.preferences.numberFormat() === 'compact'
      ? format.compact.format(numeric)
      : format.full.format(numeric);
  }
}
