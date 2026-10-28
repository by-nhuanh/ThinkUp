import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import {
  LucideChevronDown,
  LucideFlaskConical,
  LucideLayoutGrid,
  LucideLightbulb,
  LucideMaximize,
  LucidePause,
  LucidePlay,
  LucideSearch,
  LucideSettings,
  LucideVolume2,
  LucideVolumeX,
} from '@lucide/angular';
import { LearningLesson } from '../../models/learning.model';

@Component({
  selector: 'app-video-view',
  standalone: true,
  imports: [
    LucideChevronDown,
    LucideFlaskConical,
    LucideLayoutGrid,
    LucideLightbulb,
    LucideMaximize,
    LucidePause,
    LucidePlay,
    LucideSearch,
    LucideSettings,
    LucideVolume2,
    LucideVolumeX,
  ],
  templateUrl: './video-view.component.html',
})
export class VideoViewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) lesson!: LearningLesson;
  @Input() courseTitle = '';
  @Input() chapterTitle = '';

  @Output() completed = new EventEmitter<void>();

  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;

  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly muted = signal(false);
  readonly rate = signal(1);
  readonly quality = signal('1080p');
  readonly rateMenuOpen = signal(false);
  readonly qualityMenuOpen = signal(false);
  readonly started = signal(false);

  readonly rates = [0.75, 1, 1.25, 1.5, 1.75, 2];
  readonly qualities = ['360p', '480p', '720p', '1080p'];

  private completionEmitted = false;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private initializedLessonId = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lesson'] && this.lesson?.id !== this.initializedLessonId) {
      this.initializedLessonId = this.lesson.id;
      this.playing.set(false);
      this.started.set(false);
      this.currentTime.set(0);
      this.duration.set(0);
      this.completionEmitted = false;
      this.rateMenuOpen.set(false);
      this.qualityMenuOpen.set(false);
      this.rate.set(1);
    }
  }

  ngOnDestroy(): void {
    this.persistProgress();
    if (this.saveTimer) clearInterval(this.saveTimer);
  }

  get progressPercent(): number {
    return this.duration() ? (this.currentTime() / this.duration()) * 100 : 0;
  }

  get formattedCurrent(): string {
    return this.formatTime(this.currentTime());
  }

  get formattedDuration(): string {
    return this.formatTime(this.duration() || this.estimatedSeconds);
  }

  get estimatedSeconds(): number {
    const [minutes, seconds] = this.lesson.duration.split(':').map((value) => Number(value));
    return (minutes || 0) * 60 + (seconds || 0);
  }

  async togglePlay(): Promise<void> {
    const video = this.videoElement?.nativeElement;
    if (!video) return;
    if (video.paused) {
      this.started.set(true);
      try {
        await video.play();
        this.playing.set(true);
        this.startProgressSaver();
      } catch {
        this.playing.set(false);
      }
    } else {
      video.pause();
      this.playing.set(false);
      this.persistProgress();
    }
  }

  onLoadedMetadata(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;
    this.duration.set(Number.isFinite(video.duration) ? video.duration : this.estimatedSeconds);
    const saved = Number(localStorage.getItem(`thinkup:video:${this.lesson.id}`) ?? '0');
    if (saved > 0 && saved < video.duration - 5) {
      video.currentTime = saved;
      this.currentTime.set(saved);
    }
  }

  onTimeUpdate(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;
    this.currentTime.set(video.currentTime);
    if (!this.completionEmitted && video.duration > 0 && video.currentTime / video.duration >= 0.9) {
      this.completionEmitted = true;
      this.completed.emit();
    }
  }

  onEnded(): void {
    this.playing.set(false);
    this.completed.emit();
    localStorage.removeItem(`thinkup:video:${this.lesson.id}`);
  }

  onSeek(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    const video = this.videoElement?.nativeElement;
    if (video) {
      video.currentTime = value;
      this.currentTime.set(value);
    }
  }

  toggleMute(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;
    video.muted = !video.muted;
    this.muted.set(video.muted);
  }

  setRate(value: number): void {
    const video = this.videoElement?.nativeElement;
    if (video) video.playbackRate = value;
    this.rate.set(value);
    this.rateMenuOpen.set(false);
  }

  setQuality(value: string): void {
    this.quality.set(value);
    this.qualityMenuOpen.set(false);
  }

  async toggleFullscreen(): Promise<void> {
    const video = this.videoElement?.nativeElement;
    if (!video) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await video.requestFullscreen?.();
    }
  }

  formatTime(value: number): string {
    if (!Number.isFinite(value)) return '00:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private startProgressSaver(): void {
    if (this.saveTimer) return;
    this.saveTimer = setInterval(() => this.persistProgress(), 5000);
  }

  private persistProgress(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || !video.currentTime) return;
    localStorage.setItem(`thinkup:video:${this.lesson.id}`, String(video.currentTime));
  }
}
