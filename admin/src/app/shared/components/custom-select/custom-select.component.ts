import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Dropdown with a floating trigger and a floating menu. It replaces the native select
 * so every filter of the admin shares the same control, menu and keyboard behaviour.
 */
@Component({
  selector: 'app-custom-select',
  standalone: true,
  templateUrl: './custom-select.component.html',
  styleUrl: './custom-select.component.css'
})
export class CustomSelectComponent implements OnDestroy {
  private static activeInstance: CustomSelectComponent | null = null;

  @Input() value = '';
  @Input() options: ReadonlyArray<CustomSelectOption> = [];
  @Input() placeholder = 'Tất cả';
  @Input() labelId = '';
  @Input() controlId = '';
  @Input() menuWidth = 188;
  @Input() menuMaxHeight = 0;
  @Input() disabled = false;
  @Output() readonly valueChange = new EventEmitter<string>();

  readonly open = signal(false);

  get displayLabel(): string {
    return this.options.find(option => option.value === this.value)?.label ?? this.placeholder;
  }

  get valueId(): string {
    return this.controlId ? `${this.controlId}-value` : '';
  }

  toggle(): void {
    if (this.disabled) return;
    if (this.open()) {
      this.close();
      return;
    }

    CustomSelectComponent.activeInstance?.close();
    CustomSelectComponent.activeInstance = this;
    this.open.set(true);
  }

  choose(value: string): void {
    this.valueChange.emit(value);
    this.open.set(false);
  }

  close(): void {
    this.open.set(false);
    if (CustomSelectComponent.activeInstance === this) {
      CustomSelectComponent.activeInstance = null;
    }
  }

  ngOnDestroy(): void {
    this.close();
  }
}
