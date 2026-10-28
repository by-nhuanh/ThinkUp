import { Component, output } from '@angular/core';
import { LucideArrowLeft } from '@lucide/angular';

@Component({
  selector: 'app-settings-back-button',
  standalone: true,
  imports: [LucideArrowLeft],
  templateUrl: './settings-back-button.component.html',
  styleUrl: './settings-back-button.component.css',
})
export class SettingsBackButtonComponent {
  readonly back = output<void>();
}
