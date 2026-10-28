import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { LucideBookOpen, LucideLightbulb, LucideCheck } from '@lucide/angular';
import { LearningLesson } from '../../models/learning.model';

@Component({
  selector: 'app-reading-view',
  standalone: true,
  imports: [LucideBookOpen, LucideLightbulb, LucideCheck],
  templateUrl: './reading-view.component.html',
})
export class ReadingViewComponent {
  @Input({ required: true }) lesson!: LearningLesson;
  @Input() chapterTitle = '';
  @Input() completed = false;

  @Output() completedChange = new EventEmitter<void>();

  readonly scrollPercent = signal(0);

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const max = element.scrollHeight - element.clientHeight;
    this.scrollPercent.set(max > 0 ? Math.min(100, Math.round((element.scrollTop / max) * 100)) : 0);
  }
}
