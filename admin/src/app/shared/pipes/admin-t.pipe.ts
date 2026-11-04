import { Pipe, PipeTransform, inject } from '@angular/core';
import { AdminI18nService } from '../../core/i18n/admin-i18n.service';
import { AdminMessageKey } from '../../core/i18n/admin-i18n.dictionary';

/** P9 — translate a typed dictionary key; impure so switching language re-renders. */
@Pipe({ name: 'adminT', standalone: true, pure: false })
export class AdminTPipe implements PipeTransform {
  private readonly i18n = inject(AdminI18nService);

  transform(key: AdminMessageKey): string {
    return this.i18n.t(key);
  }
}
