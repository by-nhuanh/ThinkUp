import { Component, input, output } from '@angular/core';

export interface SelectionAction {
  key: string;
  label: string;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  title?: string;
}

/**
 * Thanh thao tác hàng loạt dùng chung cho mọi trang danh sách của admin.
 * Học theo voucher / phân quyền: tick nhiều dòng rồi chọn chức năng muốn áp dụng.
 * Bấm vào số lượng đã chọn để mở danh sách chọn (xem / thêm / xóa / tick lại).
 */
@Component({
  selector: 'app-selection-bar',
  standalone: true,
  templateUrl: './selection-bar.component.html',
  styleUrl: './selection-bar.component.css'
})
export class SelectionBarComponent {
  readonly count = input.required<number>();
  readonly noun = input.required<string>();
  readonly actions = input<readonly SelectionAction[]>([]);

  readonly action = output<string>();
  readonly inspect = output<void>();
  readonly clear = output<void>();
}