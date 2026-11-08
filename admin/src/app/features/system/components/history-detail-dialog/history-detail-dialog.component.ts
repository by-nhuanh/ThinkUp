import { Component, computed, inject, input, output } from '@angular/core';
import { AdminDialogComponent } from '../../../../shared/components/admin-dialog/admin-dialog.component';
import { AdminHistoryEntry } from '../../models/system.models';
import { SYSTEM_STORE } from '../../data/system.store';

@Component({
  selector: 'app-system-history-detail-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './history-detail-dialog.component.html',
  styleUrls: ['../../system-page.css', './history-detail-dialog.component.css']
})
export class HistoryDetailDialogComponent {
  private readonly store = inject(SYSTEM_STORE);

  readonly entry = input.required<AdminHistoryEntry>();
  readonly closed = output<void>();

  readonly subtitle = computed(() => `${this.entry().id} · ${this.entry().at.replace(' · ', ' lúc ')} (UTC+7)`);
  readonly targetCode = computed(() =>
    this.store.admins().find((person) => person.email === this.entry().targetEmail)?.code ?? '—');
  readonly reasonLabel = computed(() =>
    this.entry().action.includes('vai trò') ? 'Lý do thay đổi' : 'Lý do thực hiện');
  readonly beforeLines = computed(() => this.splitLines(this.entry().before ?? this.entry().change.split(' → ')[0]));
  readonly afterLines = computed(() => this.splitLines(this.entry().after ?? this.entry().change.split(' → ')[1]));

  initials(name: string): string {
    const words = name.trim().split(/\s+/);
    return ((words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '')).toUpperCase();
  }

  private splitLines(value: string | undefined): string[] {
    return (value ?? '').split(' · ').map((line) => line.trim()).filter(Boolean);
  }
}