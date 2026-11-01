import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideBan, LucideBookOpen, LucideCheckCircle2, LucideCircleDollarSign, LucideClock3, LucideEye, LucideFileText, LucideGift, LucideGraduationCap, LucideInfo, LucideLockKeyhole, LucideMessageSquareText, LucideTriangleAlert, LucideUserRound, LucideX } from '@lucide/angular';
import { ComplaintCase } from '../models/support.models';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { SupportDemoService } from '../services/support-demo.service';

type CaseAction = 'explanation' | 'refund' | 'dismiss' | 'discipline' | null;

@Component({
  selector: 'app-complaint-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, CustomSelectComponent, LucideBan, LucideBookOpen, LucideCheckCircle2, LucideCircleDollarSign, LucideClock3, LucideEye, LucideFileText, LucideGift, LucideGraduationCap, LucideInfo, LucideLockKeyhole, LucideMessageSquareText, LucideTriangleAlert, LucideUserRound, LucideX],
  templateUrl: './complaint-detail.component.html',
  styleUrls: ['../support-page.css', './complaint-detail.component.css']
})
export class ComplaintDetailComponent {
  private readonly data = inject(SupportDemoService);
  private readonly route = inject(ActivatedRoute);
  readonly caseId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly caseFile = computed(() => this.data.complaints().find(item => item.id === this.caseId) ?? null);
  readonly action = signal<CaseAction>(null);
  readonly decision = signal('');
  readonly actionText = signal('');
  readonly option = signal('');
  readonly confirmRisk = signal(false);
  readonly explanationDeadline = signal<12 | 24>(12);
  readonly freezeCommission = signal(true);
  readonly refundMode = signal<'full' | 'partial'>('full');
  readonly partialRefundAmount = signal<number | null>(null);
  readonly revokeAccess = signal(true);
  readonly revokeCertificate = signal(true);
  readonly dismissalBasis = signal('');
  readonly giftVoucher = signal(true);
  readonly sanctions = signal<string[]>(['strike', 'archive']);
  readonly toast = signal('');
  readonly decisionOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'refund', label: 'Chấp thuận hoàn tiền' },
    { value: 'dismiss', label: 'Bác bỏ khiếu nại' },
    { value: 'discipline', label: 'Áp dụng kỷ luật' },
  ];
  readonly dismissalBasisOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'progress_over_20', label: 'Học viên đã học quá 20% tiến độ' },
    { value: 'refund_window_expired', label: 'Quá thời hạn đổi trả 7 ngày' },
    { value: 'course_operational', label: 'Khóa học hoạt động bình thường' },
    { value: 'invalid_evidence', label: 'Bằng chứng không xác thực' },
  ];
  readonly refundAmount = computed(() => { const item = this.caseFile(); if (!item) return 0; return this.refundMode() === 'full' ? item.amount : Math.max(0, Math.min(item.amount, Number(this.partialRefundAmount()) || 0)); });
  readonly partialRefundExceedsOriginal = computed(() => { const item = this.caseFile(); return Boolean(item && this.refundMode() === 'partial' && Number(this.partialRefundAmount()) > item.amount); });
  readonly instructorRefundShare = computed(() => Math.round(this.refundAmount() * .7));
  readonly platformRefundShare = computed(() => this.refundAmount() - this.instructorRefundShare());
  readonly decisionActionLabel = computed(() => {
    if (this.decision() === 'refund') return 'Tiếp tục hoàn tiền';
    if (this.decision() === 'dismiss') return 'Tiếp tục bác bỏ';
    if (this.decision() === 'discipline') return 'Tiếp tục kỷ luật';
    return 'Tiếp tục xử lý';
  });

  money(value: number): string { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value); }
  sla(item: ComplaintCase): string { const hours = Math.ceil(Math.abs(new Date(item.dueAt).getTime() - Date.now()) / 3_600_000); return new Date(item.dueAt).getTime() < Date.now() ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  openAction(value: Exclude<CaseAction, null>): void { this.action.set(value); this.actionText.set(''); this.option.set(''); this.confirmRisk.set(false); this.explanationDeadline.set(12); this.freezeCommission.set(true); this.refundMode.set('full'); this.partialRefundAmount.set(null); this.revokeAccess.set(true); this.revokeCertificate.set(true); this.dismissalBasis.set(''); this.giftVoucher.set(true); this.sanctions.set(['strike', 'archive']); }
  closeAction(): void { this.action.set(null); }
  selectDecision(value: string): void { this.decision.set(value); }
  toggleSanction(value: string, checked: boolean): void { this.sanctions.update(items => checked ? [...new Set([...items, value])] : items.filter(item => item !== value)); }
  sanctionSelected(value: string): boolean { return this.sanctions().includes(value); }
  canConfirmAction(): boolean {
    const action = this.action();
    if (action === 'explanation') return this.actionText().trim().length >= 30;
    if (action === 'refund') return this.refundAmount() > 0 && !this.partialRefundExceedsOriginal() && this.actionText().trim().length >= 30 && this.confirmRisk();
    if (action === 'dismiss') return !!this.dismissalBasis() && this.actionText().trim().length >= 30 && this.confirmRisk();
    if (action === 'discipline') return this.sanctions().length > 0 && this.actionText().trim().length >= 30 && this.confirmRisk();
    return false;
  }
  confirmAction(): void {
    const item = this.caseFile();
    if (!item || !this.canConfirmAction()) return;
    if (this.action() === 'explanation') this.data.requestInstructorExplanation(item.id, this.explanationDeadline(), this.freezeCommission(), this.actionText().trim());
    if (this.action() === 'refund') this.data.approveComplaintRefund(item.id, this.refundAmount(), this.revokeAccess(), this.revokeCertificate(), this.actionText().trim());
    if (this.action() === 'dismiss') this.data.dismissComplaint(item.id, this.dismissalBasis(), this.actionText().trim(), this.giftVoucher());
    if (this.action() === 'discipline') this.data.disciplineInstructor(item.id, this.sanctions(), this.actionText().trim());
    this.action.set(null); this.decision.set(''); this.notify('Đã ghi nhận quyết định và cập nhật lịch sử xử lý.');
  }
  canIssue(): boolean { return !!this.decision(); }
  issue(): void {
    if (!this.canIssue()) return;
    const decision = this.decision();
    if (decision !== 'refund' && decision !== 'dismiss' && decision !== 'discipline') return;
    this.openAction(decision);
  }
  openFile(name: string): void { this.notify(`Không thể mở tệp ${name}.`); }
  openRelated(label: string): void { this.notify(`Không thể mở ${label.toLowerCase()}.`); }
  private notify(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 3500); }
}
