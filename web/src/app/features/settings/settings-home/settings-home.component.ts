import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SettingsService } from '../services/settings.service';
import { SettingSection } from '../models/settings.model';
import { SettingsSectionCardComponent } from '../components/settings-section-card/settings-section-card.component';

@Component({
  selector: 'app-settings-home',
  standalone: true,
  imports: [CommonModule, SettingsSectionCardComponent],
  templateUrl: './settings-home.component.html',
  styleUrl: './settings-home.component.css',
})
export class SettingsHomeComponent {
  readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly sections = this.settingsService.getSections();

  open(section: SettingSection): void {
    void this.router.navigate([section.href]);
  }
}
