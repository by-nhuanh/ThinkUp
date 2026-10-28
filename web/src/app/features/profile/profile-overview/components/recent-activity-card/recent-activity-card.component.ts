import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecentActivity } from '../../../../../core/models/profile.model';

@Component({
  selector: 'app-recent-activity-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recent-activity-card.component.html',
  styleUrl: './recent-activity-card.component.css'
})
export class RecentActivityCardComponent {
  @Input() activities: RecentActivity[] = [];

  toneColor(tone: string): string {
    switch (tone) {
      case 'amber':
        return '#F59E0B';
      case 'green':
        return '#10B981';
      case 'sky':
        return '#0EA5E9';
      case 'blue':
      default:
        return '#3B82F6';
    }
  }
}
