import { Component, ElementRef, HostListener, OnDestroy, computed, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LearningLesson } from '../../models/learning.model';

const VIDEO_SETTINGS_KEY = 'thinkup_video_settings';
const VIDEO_PROGRESS_KEY = 'thinkup_video_progress';

interface VideoSettings {
  playbackRate: number;
  volume: number;
}

interface VideoProgress {
  lastPosition: number;
  watchedSeconds: number;
}

@Component({
  selector: 'app-lesson-video-player',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './lesson-video-player.component.html',
  styleUrls: ['./lesson-video-player.component.css', './lesson-video-player-state.css']
})
export class LessonVideoPlayerComponent implements OnDestroy {
  readonly lesson = input.required<LearningLesson>();
  readonly completed = output<void>();
  readonly nextRequested = output<void>();
  readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly player = viewChild.required<ElementRef<HTMLElement>>('player');

  readonly playing = signal(false);
  readonly buffering = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly buffered = signal(0);
  readonly volume = signal(0.8);
  readonly muted = signal(false);
  readonly playbackRate = signal(1);
  readonly resumePosition = signal(0);
  readonly countdown = signal<number | null>(null);
  readonly completedAutomatically = signal(false);
  readonly offline = signal(typeof navigator !== 'undefined' && !navigator.onLine);
  readonly progressPercent = computed(() => this.duration() ? this.currentTime() / this.duration() * 100 : 0);
  readonly bufferedPercent = computed(() => this.duration() ? this.buffered() / this.duration() * 100 : 0);
  readonly seekPreview = signal<{ x: number; time: number } | null>(null);

  private watchedSeconds = 0;
  private previousPlaybackPosition = 0;
  private lastPersistedPosition = 0;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const settings = this.readSettings();
    this.volume.set(settings.volume);
    this.playbackRate.set(settings.playbackRate);
  }

  onLoadedMetadata(): void {
    const video = this.video().nativeElement;
    const progress = this.readProgress();
    this.duration.set(Number.isFinite(video.duration) ? video.duration : 0);
    this.watchedSeconds = progress.watchedSeconds;
    video.volume = this.volume();
    video.playbackRate = this.playbackRate();
    if (progress.lastPosition > 0 && progress.lastPosition < video.duration - 5) {
      video.currentTime = progress.lastPosition;
      this.currentTime.set(progress.lastPosition);
      this.previousPlaybackPosition = progress.lastPosition;
      this.resumePosition.set(progress.lastPosition);
    }
  }

  onTimeUpdate(): void {
    const position = this.video().nativeElement.currentTime;
    const delta = position - this.previousPlaybackPosition;
    if (this.playing() && delta > 0 && delta <= 2.5) this.watchedSeconds += delta;
    this.previousPlaybackPosition = position;
    this.currentTime.set(position);
    if (Math.abs(position - this.lastPersistedPosition) >= 5) {
      this.persistProgress(position);
      this.lastPersistedPosition = position;
    }
    const threshold = this.lesson().completionThreshold ?? 0.8;
    if (!this.completedAutomatically() && this.duration() > 0 && this.watchedSeconds / this.duration() >= threshold) {
      this.completedAutomatically.set(true);
      this.completed.emit();
    }
  }

  onProgress(): void {
    const video = this.video().nativeElement;
    if (video.buffered.length) this.buffered.set(video.buffered.end(video.buffered.length - 1));
  }

  async togglePlayback(): Promise<void> {
    const video = this.video().nativeElement;
    if (video.paused) await video.play();
    else video.pause();
  }

  seek(value: string): void {
    const time = Number(value);
    this.video().nativeElement.currentTime = time;
    this.currentTime.set(time);
    this.previousPlaybackPosition = time;
    this.persistProgress(time);
    this.lastPersistedPosition = time;
  }

  updateSeekPreview(event: MouseEvent): void {
    const target = event.currentTarget as HTMLInputElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.seekPreview.set({ x: ratio * rect.width, time: ratio * this.duration() });
  }

  setVolume(value: string): void {
    const volume = Number(value);
    const video = this.video().nativeElement;
    video.volume = volume;
    video.muted = volume === 0;
    this.volume.set(volume);
    this.muted.set(video.muted);
    this.persistSettings();
  }

  toggleMute(): void {
    const video = this.video().nativeElement;
    video.muted = !video.muted;
    this.muted.set(video.muted);
  }

  setPlaybackRate(value: string): void {
    const rate = Number(value);
    this.video().nativeElement.playbackRate = rate;
    this.playbackRate.set(rate);
    this.persistSettings();
  }

  async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await this.player().nativeElement.requestFullscreen();
  }

  async togglePictureInPicture(): Promise<void> {
    const video = this.video().nativeElement;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
  }

  replay(): void {
    this.clearCountdown();
    const video = this.video().nativeElement;
    video.currentTime = 0;
    this.currentTime.set(0);
    void video.play();
  }

  moveNext(): void {
    this.clearCountdown();
    this.nextRequested.emit();
  }

  onEnded(): void {
    this.playing.set(false);
    this.persistProgress(this.video().nativeElement.currentTime);
    if (!this.completedAutomatically()) {
      this.completedAutomatically.set(true);
      this.completed.emit();
    }
    this.countdown.set(5);
    this.countdownTimer = setInterval(() => {
      const remaining = (this.countdown() ?? 1) - 1;
      this.countdown.set(remaining);
      if (remaining <= 0) this.moveNext();
    }, 1000);
  }

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  @HostListener('document:keydown', ['$event'])
  handleShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, button')) return;
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'k') { event.preventDefault(); void this.togglePlayback(); }
    if (key === 'm') this.toggleMute();
    if (key === 'f') void this.toggleFullscreen();
    if (event.key === 'ArrowLeft') this.skipBy(-5);
    if (event.key === 'ArrowRight') this.skipBy(5);
  }

  @HostListener('window:offline')
  handleOffline(): void {
    this.offline.set(true);
    this.video().nativeElement.pause();
    this.persistProgress(this.video().nativeElement.currentTime);
  }

  @HostListener('window:online')
  handleOnline(): void {
    this.offline.set(false);
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    const video = this.video().nativeElement;
    this.persistProgress(video.currentTime);
  }

  private skipBy(seconds: number): void {
    const video = this.video().nativeElement;
    video.currentTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + seconds));
    this.previousPlaybackPosition = video.currentTime;
  }

  private persistSettings(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VIDEO_SETTINGS_KEY, JSON.stringify({ playbackRate: this.playbackRate(), volume: this.volume() } satisfies VideoSettings));
  }

  private readSettings(): VideoSettings {
    if (typeof localStorage === 'undefined') return { playbackRate: 1, volume: 0.8 };
    try {
      const settings = JSON.parse(localStorage.getItem(VIDEO_SETTINGS_KEY) ?? '{}') as Partial<VideoSettings>;
      return { playbackRate: settings.playbackRate ?? 1, volume: settings.volume ?? 0.8 };
    } catch {
      return { playbackRate: 1, volume: 0.8 };
    }
  }

  private persistProgress(lastPosition: number): void {
    if (typeof localStorage === 'undefined') return;
    const all = this.readAllProgress();
    all[this.lesson().id] = { lastPosition, watchedSeconds: this.watchedSeconds };
    localStorage.setItem(VIDEO_PROGRESS_KEY, JSON.stringify(all));
    // TODO(pre-deploy): Nhớ thay heartbeat local bằng API tiến độ video 5 giây/lần theo hợp đồng backend chính thức.
  }

  private readProgress(): VideoProgress {
    return this.readAllProgress()[this.lesson().id] ?? { lastPosition: 0, watchedSeconds: 0 };
  }

  private readAllProgress(): Record<string, VideoProgress> {
    if (typeof localStorage === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(VIDEO_PROGRESS_KEY) ?? '{}') as Record<string, VideoProgress>;
    } catch {
      return {};
    }
  }

  private clearCountdown(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.countdown.set(null);
  }
}
