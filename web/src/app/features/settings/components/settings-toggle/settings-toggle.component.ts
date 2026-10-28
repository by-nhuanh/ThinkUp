import { Component, input, output, model } from '@angular/core';

export type SettingsToggleSize = 'sm' | 'md';

/**
 * Công tắc bật/tắt dùng chung cho các trang cài đặt.
 * - sm: 44x24, núm 20x20, cách mép 2px (Figma node 3200:23104).
 * - md: 52x28, núm 22x22, cách mép 3px (Figma node 3200:22783).
 */
@Component({
  selector: 'app-settings-toggle',
  standalone: true,
  templateUrl: './settings-toggle.component.html',
  styleUrl: './settings-toggle.component.css',
})
export class SettingsToggleComponent {
  readonly checked = model<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly size = input<SettingsToggleSize>('sm');
  readonly onColor = input<string>('#155DFC');
  readonly offColor = input<string>('#E2E8F0');
  readonly change = output<boolean>();

  onChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.checked.set(checked);
    this.change.emit(checked);
  }
}
