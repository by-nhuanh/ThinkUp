import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SettingsService } from '../services/settings.service';
import { DEFAULT_LEARNING_OPTIONS, LearningOptions } from '../models/settings.model';
import { SettingsSelectComponent } from '../components/settings-select/settings-select.component';
import { SettingsToggleComponent } from '../components/settings-toggle/settings-toggle.component';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

type Option = { value: string; label: string };

/**
 * Tùy chọn học tập. Bố cục và nội dung khớp Figma node 3200:23104.
 */
@Component({
  selector: 'app-learning-options',
  standalone: true,
  imports: [SettingsSelectComponent, SettingsToggleComponent, SettingsBackButtonComponent],
  templateUrl: './learning-options.component.html',
  styleUrl: './learning-options.component.css',
})
export class LearningOptionsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly back = () => void this.router.navigate(['/main/settings']);
  readonly isSaving = signal(false);
  readonly saveStatus = signal<'idle' | 'success' | 'error'>('idle');

  readonly options = this.settingsService.learningOptions;

  /** Bản chụp để nút "Hủy" trả lại đúng trạng thái lúc mở trang. */
  private readonly savedOptions = signal<LearningOptions>({ ...this.options() });

  // Hai công tắc chưa có trong hợp đồng API nên chỉ giữ ở phạm vi trang.
  // TODO(pre-deploy): Nối vào LearningOptions khi backend chốt spec.
  readonly subtitles = signal(false);
  readonly autoNext = signal(true);

  readonly languageOptions: Option[] = [
    { value: 'vi', label: 'Tiếng Việt' },
    { value: 'en', label: 'Tiếng Anh' },
  ];

  readonly timezoneOptions: Option[] = [
    { value: 'GMT+07:00', label: '(GMT+07:00) Bangkok, Hanoi, Jakarta' },
    { value: 'GMT+08:00', label: '(GMT+08:00) Singapore, Kuala Lumpur' },
    { value: 'GMT+09:00', label: '(GMT+09:00) Tokyo, Seoul' },
    { value: 'GMT+00:00', label: '(GMT+00:00) London' },
  ];

  readonly videoQualityOptions: Option[] = [
    { value: 'auto', label: 'Tự động (Khuyến dùng)' },
    { value: '1080p', label: '1080p (HD)' },
    { value: '720p', label: '720p (HD)' },
    { value: '480p', label: '480p' },
  ];

  readonly playbackSpeedOptions: Option[] = [
    { value: '0.5', label: '0.5x' },
    { value: '0.75', label: '0.75x' },
    { value: '1.0', label: '1.0x (Bình thường)' },
    { value: '1.25', label: '1.25x' },
    { value: '1.5', label: '1.5x' },
    { value: '2.0', label: '2.0x' },
  ];

  readonly downloadQualityOptions: Option[] = [
    { value: 'high', label: 'Chất lượng cao' },
    { value: 'standard', label: 'Chất lượng tiêu chuẩn' },
    { value: 'saving', label: 'Tiết kiệm dung lượng' },
  ];

  readonly downloadLocationOptions: Option[] = [
    { value: 'downloads', label: 'Thư mục Downloads (Mặc định)' },
    { value: 'documents', label: 'Thư mục Tài liệu' },
    { value: 'choose', label: 'Chọn thư mục khác' },
  ];

  patch<K extends keyof LearningOptions>(key: K, value: string): void {
    this.settingsService.setLearningOptions({ ...this.options(), [key]: value });
  }

  onSave(): void {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.settingsService.updateLearningOptions({ ...this.options() }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.saveStatus.set('success');
        this.savedOptions.set({ ...this.options() });
      },
      error: () => {
        this.isSaving.set(false);
        this.saveStatus.set('error');
      },
    });
  }

  /** Hủy: bỏ các thay đổi chưa lưu, trả về trạng thái lúc mở trang. */
  onCancel(): void {
    this.settingsService.setLearningOptions({ ...this.savedOptions() });
    this.subtitles.set(false);
    this.autoNext.set(true);
    this.saveStatus.set('idle');
  }

  /** Khôi phục cài đặt mặc định của toàn bộ mục Tùy chọn học tập. */
  onReset(): void {
    this.settingsService.setLearningOptions({ ...DEFAULT_LEARNING_OPTIONS });
    this.subtitles.set(false);
    this.autoNext.set(true);
    this.saveStatus.set('idle');
  }
}
