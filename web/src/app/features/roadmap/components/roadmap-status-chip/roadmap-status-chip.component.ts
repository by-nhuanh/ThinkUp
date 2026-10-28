import { Component, computed, input } from '@angular/core';
import { RoadmapSkillStatus } from '../../models/roadmap.model';

const STATUS_LABEL: Record<RoadmapSkillStatus, string> = {
  completed: 'Đã hoàn thành',
  'in-progress': 'Đang học',
  review: 'Ôn tập lại',
  'not-started': 'Chưa bắt đầu'
};

@Component({
  selector: 'app-roadmap-status-chip',
  standalone: true,
  styleUrls: ['../../styles/roadmap-ui.css'],
  template: `<span
    class="rm-status"
    [class.rm-status--completed]="status() === 'completed'"
    [class.rm-status--in-progress]="status() === 'in-progress'"
    [class.rm-status--review]="status() === 'review'"
    [class.rm-status--not-started]="status() === 'not-started'"
    >{{ label() }}</span
  >`,
  styles: [':host { display: inline-flex; }']
})
export class RoadmapStatusChipComponent {
  readonly status = input.required<RoadmapSkillStatus>();
  readonly label = computed(() => STATUS_LABEL[this.status()]);
}
