import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { EXPORT_FORMAT_OPTIONS, ExportFormat } from '../../utils/export-formats';

@Component({
  selector: 'app-export-menu',
  standalone: true,
  templateUrl: './export-menu.component.html',
  styleUrl: './export-menu.component.css'
})
export class ExportMenuComponent {
  /** Nhãn truy cập (aria) của nút, mô tả đúng dữ liệu đang xuất. */
  @Input() label = 'Xuất dữ liệu';
  /** Hiển thị nhãn trên trigger khi toolbar có đủ không gian; mặc định giữ dạng icon-only. */
  @Input() showText = false;
  @Output() readonly formatChange = new EventEmitter<ExportFormat>();
  readonly open = signal(false);
  readonly options = EXPORT_FORMAT_OPTIONS;

  toggle(): void { this.open.update(value => !value); }
  close(): void { this.open.set(false); }
  choose(format: ExportFormat): void {
    this.formatChange.emit(format);
    this.close();
  }
}
