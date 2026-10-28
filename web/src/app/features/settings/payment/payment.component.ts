import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideBookOpen,
  LucideCheck,
  LucideChevronRight,
  LucideCode,
  LucideCreditCard,
  LucideCrown,
  LucideDownload,
  LucideEllipsisVertical,
  LucideFileText,
  LucideGift,
  LucideMail,
  LucideMonitorPlay,
  LucideShieldCheck,
} from '@lucide/angular';
import { SettingsService } from '../services/settings.service';
import { PaymentMethod } from '../models/settings.model';
import { SettingsToggleComponent } from '../components/settings-toggle/settings-toggle.component';
import { SettingsBackButtonComponent } from '../components/settings-back-button/settings-back-button.component';

type PaymentTone = 'green' | 'pink' | 'yellow';
type TransactionIcon = 'book' | 'monitor' | 'gift' | 'code' | 'crown';

interface TransactionItem {
  title: string;
  date: string;
  value: string;
  tone: PaymentTone;
  icon: TransactionIcon;
}

interface InvoiceItem {
  code: string;
  date: string;
  amount: string;
}

/**
 * Cài đặt thanh toán. Bố cục, màu và typography khớp Figma node 3200:22503.
 */
@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [
    SettingsToggleComponent,
    SettingsBackButtonComponent,
    LucideBookOpen,
    LucideCheck,
    LucideChevronRight,
    LucideCode,
    LucideCreditCard,
    LucideCrown,
    LucideDownload,
    LucideEllipsisVertical,
    LucideFileText,
    LucideGift,
    LucideMail,
    LucideMonitorPlay,
    LucideShieldCheck,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class PaymentComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);

  readonly back = () => void this.router.navigate(['/main/settings']);

  readonly methods = this.settingsService.paymentMethods;
  readonly methodNames: Record<PaymentMethod['type'], string> = {
    momo: 'MoMo Wallet',
    zalopay: 'ZaloPay',
    visa: 'Thẻ Visa',
  };

  readonly openMenuId = signal<string | null>(null);
  private readonly carouselStart = signal(0);

  /** Xoay danh sách phương thức khi bấm nút mũi tên bên phải (carousel trong Figma). */
  readonly visibleMethods = computed(() => {
    const methods = this.methods();
    if (methods.length < 2) return methods;
    const start = this.carouselStart() % methods.length;
    return [...methods.slice(start), ...methods.slice(0, start)];
  });

  readonly transactions: TransactionItem[] = [
    {
      title: 'Khóa học ReactJS từ cơ bản đến nâng cao',
      date: '12/05/2024 • 10:30',
      value: '499.000₫',
      tone: 'green',
      icon: 'book',
    },
    {
      title: 'Khóa học UI/UX Design Masterclass',
      date: '05/05/2024 • 14:20',
      value: '399.000₫',
      tone: 'green',
      icon: 'monitor',
    },
    {
      title: 'Mã giảm giá từ sự kiện ThinkUp Birthday',
      date: '01/05/2024 • 09:15',
      value: '-Đã áp dụng',
      tone: 'pink',
      icon: 'gift',
    },
    {
      title: 'Khóa học JavaScript Nâng cao',
      date: '22/04/2024 • 16:45',
      value: '449.000₫',
      tone: 'green',
      icon: 'code',
    },
    {
      title: 'Gói hội viên ThinkUp Premium (1 tháng)',
      date: '15/04/2024 • 11:05',
      value: '129.000₫',
      tone: 'yellow',
      icon: 'crown',
    },
  ];

  readonly invoices: InvoiceItem[] = [
    { code: 'INV-2024-000123', date: '12/05/2024 • 10:30', amount: '499.000₫' },
    { code: 'INV-2024-000122', date: '05/05/2024 • 14:20', amount: '399.000₫' },
    { code: 'INV-2024-000121', date: '22/04/2024 • 16:45', amount: '449.000₫' },
    { code: 'INV-2024-000120', date: '15/04/2024 • 11:05', amount: '129.000₫' },
    { code: 'INV-2024-000119', date: '01/04/2024 • 09:30', amount: '299.000₫' },
  ];

  readonly savePayment = signal(true);
  readonly invoiceEmail = signal(true);
  readonly quickConfirm = signal(false);

  readonly badgeClass: Record<PaymentTone, string> = {
    green:
      'inline-flex items-center rounded-lg bg-[#DCFCE7] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#16A34A]',
    pink:
      'inline-flex items-center rounded-lg bg-[#FCE7F3] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#DB2777]',
    yellow:
      'inline-flex items-center rounded-lg bg-[#FEF9C3] px-2.5 py-1 text-[12px] font-semibold leading-[18px] text-[#CA8A04]',
  };

  readonly iconBoxClass: Record<TransactionIcon, string> = {
    book: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#EFF6FF] text-[#3B82F6]',
    monitor: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#F0FDF4] text-[#16A34A]',
    gift: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FDF2F8] text-[#DB2777]',
    code: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FEF3C7] text-[#D97706]',
    crown: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FEF9C3] text-[#CA8A04]',
  };

  toggleMenu(id: string): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  setDefaultMethod(id: string): void {
    this.settingsService.setDefaultPaymentMethod(id);
    this.closeMenu();
  }

  removeMethod(id: string): void {
    this.settingsService.removePaymentMethod(id);
    this.closeMenu();
  }

  nextMethods(): void {
    this.carouselStart.update((index) => index + 1);
  }

  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-payment-menu]')) this.closeMenu();
  }
}
