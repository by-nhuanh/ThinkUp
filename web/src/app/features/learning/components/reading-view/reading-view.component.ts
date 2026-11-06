import { Component, EventEmitter, Input, Output, signal, inject, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { LucideBookOpen, LucideLightbulb, LucideCheck } from '@lucide/angular';
import { LearningLesson } from '../../models/learning.model';
import { LearningService } from '../../services/learning.service';
import { OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-reading-view',
  standalone: true,
  imports: [LucideBookOpen, LucideLightbulb, LucideCheck],
  templateUrl: './reading-view.component.html',
})
export class ReadingViewComponent implements OnInit, OnChanges, OnDestroy {
  private readonly learningService = inject(LearningService);

  @Input({ required: true }) lesson!: LearningLesson;
  @Input() chapterTitle = '';
  @Input() completed = false;

  @Output() completedChange = new EventEmitter<void>();

  readonly scrollPercent = signal(0);
  readonly contentHtml = signal<string>('');
  readonly loading = signal(false);
  readonly loadError = signal('');
  private request?: Subscription;

  ngOnInit(): void {
    this.loadContent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson'] && !changes['lesson'].firstChange && changes['lesson'].previousValue?.id !== this.lesson.id) {
      this.loadContent();
    }
  }

  private loadContent(): void {
    this.request?.unsubscribe();
    this.contentHtml.set('');
    this.loadError.set('');
    this.scrollPercent.set(0);
    if (!this.lesson?.id) return;
    this.loading.set(true);
    this.request = this.learningService.getLessonContent(this.lesson.id).subscribe({
      next: (data) => {
        this.loading.set(false);
        if (data?.reading?.content_html) {
          this.contentHtml.set(data.reading.content_html);
        } else this.loadError.set('Bài đọc chưa có nội dung hợp lệ.');
      },
      error: () => { this.loading.set(false); this.loadError.set('Không tải được bài đọc. Vui lòng thử lại.'); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const max = element.scrollHeight - element.clientHeight;
    this.scrollPercent.set(max > 0 ? Math.min(100, Math.round((element.scrollTop / max) * 100)) : 0);
  }
}
