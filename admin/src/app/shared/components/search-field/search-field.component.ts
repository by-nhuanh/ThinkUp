import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Search input shared by the Business module. Its frame, magnifier icon and
 * focus state follow the "Tìm mã voucher" field of the Voucher page, so the
 * Voucher, Orders and Payouts toolbars show the same control everywhere.
 */
@Component({
  selector: 'app-search-field',
  standalone: true,
  templateUrl: './search-field.component.html',
  styleUrl: './search-field.component.css'
})
export class SearchFieldComponent {
  /** Current query, controlled by the parent page. */
  @Input() value = '';
  @Input() placeholder = '';
  /** Accessible name of the input, e.g. "Tìm mã voucher". */
  @Input() label = '';
  @Input() inputId = '';
  @Output() readonly valueChange = new EventEmitter<string>();

  onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
