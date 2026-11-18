import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { AdminDialogComponent } from '../admin-dialog/admin-dialog.component';
import { SelectionAction } from '../selection-bar/selection-bar.component';

export interface BulkSelectionItem {
  id: string;
  label: string;
  detail?: string;
}

/**
 * Danh sách chọn hàng loạt dùng chung (theo mẫu "N tài khoản được chọn" của Phân quyền & Bảo mật):
 * tick lại từng dòng, xóa dòng khỏi lựa chọn, thêm bản ghi khác, rồi chọn chức năng áp dụng.
 */
@Component({
  selector: 'app-bulk-selection-dialog',
  standalone: true,
  imports: [AdminDialogComponent],
  templateUrl: './bulk-selection-dialog.component.html',
  styleUrl: './bulk-selection-dialog.component.css'
})
export class BulkSelectionDialogComponent {
  readonly noun = input.required<string>();
  readonly items = input.required<readonly BulkSelectionItem[]>();
  readonly candidates = input<readonly BulkSelectionItem[]>([]);
  readonly actions = input<readonly SelectionAction[]>([]);
  readonly note = input('');

  readonly closed = output<void>();
  readonly selectionChange = output<string[]>();
  readonly action = output<{ key: string; ids: string[] }>();

  readonly pickerOpen = signal(false);
  readonly pickerQuery = signal('');
  readonly checkedIds = linkedSignal(() => this.items().map((item) => item.id));

  readonly checkedCount = computed(() => this.items().filter((item) => this.checkedIds().includes(item.id)).length);
  readonly allChecked = computed(() => this.items().length > 0 && this.checkedCount() === this.items().length);
  readonly someChecked = computed(() => this.checkedCount() > 0 && !this.allChecked());
  readonly pickerCandidates = computed(() => {
    const query = this.pickerQuery().trim().toLocaleLowerCase('vi-VN');
    return this.candidates().filter((item) => !query
      || item.label.toLocaleLowerCase('vi-VN').includes(query)
      || (item.detail ?? '').toLocaleLowerCase('vi-VN').includes(query));
  });

  togglePicker(): void {
    this.pickerOpen.update((open) => !open);
    this.pickerQuery.set('');
  }

  toggleItem(id: string, checked: boolean): void {
    this.checkedIds.update((ids) => checked ? [...ids, id] : ids.filter((value) => value !== id));
  }

  toggleAll(checked: boolean): void {
    this.checkedIds.set(checked ? this.items().map((item) => item.id) : []);
  }

  remove(id: string): void {
    this.selectionChange.emit(this.items().filter((item) => item.id !== id).map((item) => item.id));
  }

  add(item: BulkSelectionItem): void {
    this.selectionChange.emit([...this.items().map((entry) => entry.id), item.id]);
    this.pickerOpen.set(false);
    this.pickerQuery.set('');
  }

  run(key: string): void {
    const ids = this.items().filter((item) => this.checkedIds().includes(item.id)).map((item) => item.id);
    if (!ids.length) return;
    this.action.emit({ key, ids });
  }
}