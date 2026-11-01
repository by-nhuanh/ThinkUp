import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideBookOpen, LucideCheckCircle2, LucideCircleDollarSign, LucideClock3, LucideEye, LucideFileText, LucideGraduationCap, LucideMessageSquareText, LucideTriangleAlert, LucideUserRound, LucideX } from '@lucide/angular';
import { ComplaintCase } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';

type CaseAction = 'explanation' | 'refund' | 'dismiss' | 'discipline' | null;

@Component({
  selector: 'app-complaint-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, LucideBookOpen, LucideCheckCircle2, LucideCircleDollarSign, LucideClock3, LucideEye, LucideFileText, LucideGraduationCap, LucideMessageSquareText, LucideTriangleAlert, LucideUserRound, LucideX],
  templateUrl: './complaint-detail.component.html',
  styleUrls: ['../support-page.css', './complaint-detail.component.css']
})
export class ComplaintDetailComponent {
  private readonly data = inject(SupportDemoService);
  private readonly route = inject(ActivatedRoute);
  readonly caseId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly caseFile = computed(() => this.data.complaints().find(item => item.id === this.caseId) ?? null);
  readonly action = signal<CaseAction>(null);
  readonly conclusion = signal('');
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
  readonly refundAmount = computed(() => { const item = this.caseFile(); if (!item) return 0; return this.refundMode() === 'full' ? item.amount : Math.max(0, Math.min(item.amount, Number(this.partialRefundAmount()) || 0)); });
  readonly instructorRefundShare = computed(() => Math.round(this.refundAmount() * .7));
  readonly platformRefundShare = computed(() => this.refundAmount() - this.instructorRefundShare());

  money(value: number): string { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value); }
  sla(item: ComplaintCase): string { const hours = Math.ceil(Math.abs(new Date(item.dueAt).getTime() - Date.now()) / 3_600_000); return new Date(item.dueAt).getTime() < Date.now() ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  openAction(value: Exclude<CaseAction, null>): void { this.action.set(value); this.actionText.set(''); this.option.set(''); this.confirmRisk.set(false); this.explanationDeadline.set(12); this.freezeCommission.set(true); this.refundMode.set('full'); this.partialRefundAmount.set(null); this.revokeAccess.set(true); this.revokeCertificate.set(true); this.dismissalBasis.set(''); this.giftVoucher.set(true); this.sanctions.set(['strike', 'archive']); }
  closeAction(): void { this.action.set(null); }
  selectDecision(value: string): void { this.decision.set(value); if (value === 'refund' || value === 'dismiss' || value === 'discipline') this.openAction(value); }
  toggleSanction(value: string, checked: boolean): void { this.sanctions.update(items => checked ? [...new Set([...items, value])] : items.filter(item => item !== value)); }
  sanctionSelected(value: string): boolean { return this.sanctions().includes(value); }
  canConfirmAction(): boolean {
    const action = this.action();
    if (action === 'explanation') return this.actionText().trim().length >= 10;
    if (action === 'refund') return this.refundAmount() > 0 && this.actionText().trim().length >= 30 && this.confirmRisk();
    if (action === 'dismiss') return !!this.dismissalBasis() && this.actionText().trim().length >= 30;
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
    this.action.set(null); this.notify('Đã ghi nhận quyết định trong adapter; các tác động bên ngoài đang chờ backend xác nhận.');
  }
  canIssue(): boolean { return !!this.decision() && this.conclusion().trim().length >= 30 && !!this.caseFile()?.instructorStatement; }
  issue(): void { const item = this.caseFile(); if (!item || !this.canIssue()) return; this.data.requestComplaintAction(item.id, 'complaint_ruling', { decision: this.decision(), conclusion: this.conclusion().trim(), requiresBackendConfirmation: true }); this.notify('Phán quyết đang chờ backend xác nhận quyền và lưu audit log.'); }
  openFile(name: string): void { this.notify(`Tệp ${name} chưa có URL tải xuống từ backend.`); }
  openRelated(label: string): void { this.notify(`${label} chưa có đường dẫn chi tiết từ backend.`); }
  private notify(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 3500); }
}
