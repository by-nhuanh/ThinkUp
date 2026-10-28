import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideBell, LucideCreditCard, LucideGraduationCap, LucideShield } from '@lucide/angular';
import { SettingSection } from '../../models/settings.model';

@Component({
  selector: 'app-settings-section-card',
  standalone: true,
  imports: [RouterLink, LucideShield, LucideBell, LucideGraduationCap, LucideCreditCard],
  templateUrl: './settings-section-card.component.html',
  styleUrl: './settings-section-card.component.css',
})
export class SettingsSectionCardComponent {
  readonly section = input.required<SettingSection>();
  readonly manage = output<void>();
}
