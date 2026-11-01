import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideGraduationCap,
  LucideHistory,
  LucideKeyRound,
  LucideLock,
  LucideMail,
  LucideMessageSquare,
  LucideMonitor,
  LucideRefreshCw,
  LucideSend,
} from '@lucide/angular';
import { SettingsService } from '../services/settings.service';
import { DndDuration, NotificationPrefs } from '../models/settings.model';
import { SettingsToggleComponent } from '../components/settings-toggle/settings-toggle.component';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

type ToggleKey = Exclude<keyof NotificationPrefs, 'dnd'>;

interface MethodRow {
  key: ToggleKey;
  title: string;
  sub: string;
  icon: 'monitor' | 'mail';
}

interface CategoryRow {
  key: ToggleKey | null;
  title: string;
  sub: string;
  icon: 'graduation' | 'chat' | 'refresh' | 'send' | 'key';
  color: string;
  bg: string;
  locked?: boolean;
}

/**
 * Cài đặt thông báo. Bố cục và nội dung khớp Figma node 3200:22823.
 * Figma không có nút Lưu: mỗi thay đổi được áp dụng ngay vào trạng thái của trang.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    SettingsToggleComponent,
    SettingsBackButtonComponent,
    LucideGraduationCap,
    LucideHistory,
    LucideKeyRound,
    LucideLock,
    LucideMail,
    LucideMessageSquare,
    LucideMonitor,
    LucideRefreshCw,
    LucideSend,
  ],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
})
export class NotificationsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.settingsService.getNotificationPrefs().subscribe();
  }

  readonly back = () => void this.router.navigate(['/main/settings']);
  readonly prefs = this.settingsService.notificationPrefs;

  readonly dndOptions: ReadonlyArray<{ value: DndDuration; label: string }> = [
    { value: '15', label: '15 phút' },
    { value: '1', label: '1 giờ' },
    { value: '8', label: '8 giờ' },
    { value: '24', label: '24 giờ' },
    { value: 'until', label: 'Đến khi tôi bật lại' },
  ];

  readonly methods: ReadonlyArray<MethodRow> = [
    {
      key: 'web',
      title: 'Thông báo trên trang web',
      sub: 'Hiển thị trên trình duyệt khi bạn đang nhập.',
      icon: 'monitor',
    },
    {
      key: 'email',
      title: 'Email thông báo',
      sub: 'Nhận thông báo qua email.',
      icon: 'mail',
    },
    {
      key: 'newsletter',
      title: 'Bản tin khuyến mãi',
      sub: 'Nhận thông tin về khóa học mới, ưu đãi.',
      icon: 'mail',
    },
  ];

  readonly categories: ReadonlyArray<CategoryRow> = [
    {
      key: 'learning',
      title: 'Học tập & Tiến độ',
      sub: 'Thông báo về bài học, tiến độ, chứng chỉ',
      icon: 'graduation',
      color: '#23A55A',
      bg: '#D2F6DD',
    },
    {
      key: 'community',
      title: 'Thảo luận & Cộng đồng',
      sub: 'Trả lời, bình luận, nhắc đến\nbạn',
      icon: 'chat',
      color: '#1C8AD9',
      bg: '#D4F0FF',
    },
    {
      key: 'courseUpdates',
      title: 'Cập nhật khóa học',
      sub: 'Bài học mới, cập nhật từ giảng viên',
      icon: 'refresh',
      color: '#F08C00',
      bg: '#FFECCF',
    },
    {
      key: 'marketing',
      title: 'Khuyến mãi & Sự kiện',
      sub: 'Ưu đãi, sự kiện và thông tin đặc biệt',
      icon: 'send',
      color: '#E64980',
      bg: '#FFE7F6',
    },
    {
      key: null,
      title: 'Bảo mật & Hệ thống',
      sub: 'Thông báo quan trọng từ hệ thống',
      icon: 'key',
      color: '#7C5CFC',
      bg: '#F2E9FF',
      locked: true,
    },
  ];

  setDnd(value: DndDuration): void {
    this.updatePrefs({ dnd: value });
  }

  togglePref(key: ToggleKey): void {
    this.updatePrefs({ [key]: !this.prefs()[key] } as Partial<NotificationPrefs>);
  }

  isEnabled(key: ToggleKey): boolean {
    return this.prefs()[key];
  }

  private updatePrefs(patch: Partial<NotificationPrefs>): void {
    this.settingsService.updateNotificationPrefs(patch).subscribe();
  }
}
