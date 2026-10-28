import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-roadmap-progress',
  standalone: true,
  template: `
    <div
      class="rm-progress"
      [class.rm-progress--success]="success()"
      [class.rm-progress--sm]="small()"
      role="progressbar"
      [attr.aria-valuenow]="value()"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-label]="label()"
    >
      <span class="rm-progress__value" [style.width.%]="boundedValue()"></span>
    </div>
  `,
  styleUrls: ['../../styles/roadmap-ui.css'],
  styles: [':host { display: block; width: 100%; }']
})
export class RoadmapProgressComponent {
  readonly value = input(0);
  readonly success = input(false);
  readonly small = input(false);
  readonly label = input('Tiến độ hoàn thành');

  readonly boundedValue = computed(() => Math.min(100, Math.max(0, Math.round(this.value()))));
}
