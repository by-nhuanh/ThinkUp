import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowDownUp, LucideArrowUp, LucideBold, LucideCalendarDays, LucideCheckCircle2, LucideClock3, LucideCopy, LucideDownload, LucideEllipsis, LucideFileText, LucideImage, LucideItalic, LucideLayoutGrid, LucideList, LucideListOrdered, LucideMail, LucideMessageSquareText, LucidePaperclip, LucidePencil, LucidePlus, LucideRefreshCw, LucideReply, LucideSearch, LucideSend, LucideTag, LucideUserRoundPlus, LucideX } from '@lucide/angular';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { Attachment, EmailReplyMetadata, Priority, ReplyTemplate, ResolutionCategory, SupportTicket, ThreadMessage, TicketStatus } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';

type TicketModal = 'assign' | 'escalate' | 'templates' | 'close' | null;
type ReplyChannel = 'internal' | 'email';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, CustomSelectComponent, LucideArrowDownUp, LucideArrowUp, LucideBold, LucideCalendarDays, LucideCheckCircle2, LucideClock3, LucideCopy, LucideDownload, LucideEllipsis, LucideFileText, LucideImage, LucideItalic, LucideLayoutGrid, LucideList, LucideListOrdered, LucideMail, LucideMessageSquareText, LucidePaperclip, LucidePencil, LucidePlus, LucideRefreshCw, LucideReply, LucideSearch, LucideSend, LucideTag, LucideUserRoundPlus, LucideX],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['../support-page.css', './ticket-detail.component.css']
})
export class TicketDetailComponent {
  @ViewChild('replyEditor') private replyEditor?: ElementRef<HTMLElement>;

  private readonly data = inject(SupportDemoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly ticketId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ticket = computed(() => this.data.tickets().find(item => item.id === this.ticketId) ?? null);
  readonly staff = this.data.staff;
  readonly activeModal = signal<TicketModal>(null);
  readonly reply = signal('');
  readonly replyChannel = signal<ReplyChannel>('email');
  readonly emailTo = signal(this.ticket()?.email ?? '');
  readonly emailSubject = signal(this.ticket() ? `Re: ${this.ticket()!.id} - ${this.ticket()!.summary}` : '');
  readonly showCc = signal(false);
  readonly showBcc = signal(false);
  readonly emailCc = signal('');
  readonly emailBcc = signal('');
  readonly pendingFiles = signal<Attachment[]>([]);
  readonly emojiPickerOpen = signal(false);
  readonly emojiOptions = ['😀', '😃', '😊', '🙂', '😉', '😍', '🥳', '😂', '😅', '🤔', '😮', '😢', '🙏', '👍', '👎', '👏', '🙌', '👌', '✅', '❌', '⚠️', '💡', '📌', '📎', '📧', '💬', '🎉', '🚀', '❤️', '⭐', '🔥', '💯'] as const;
  readonly messageMenuId = signal<string | null>(null);
  readonly newestFirst = signal(true);
  readonly assignmentDepartment = signal('');
  readonly pendingAssignee = signal('');
  readonly assignmentNote = signal('');
  readonly escalationGrounds = signal('');
  readonly disputeGroup = signal('');
  readonly customDisputeType = signal('');
  readonly customClassificationReason = signal('');
  readonly templateQuery = signal('');
  readonly templateCategory = signal<'all' | ReplyTemplate['category']>('all');
  readonly selectedTemplate = signal<ReplyTemplate | null>(null);
  readonly templateEditorMode = signal<'create' | 'edit' | null>(null);
  readonly templateDraftId = signal('');
  readonly templateDraftTitle = signal('');
  readonly templateDraftDescription = signal('');
  readonly templateDraftCategory = signal<ReplyTemplate['category']>('technical');
  readonly templateDraftKeywords = signal('');
  readonly templateDraftBody = signal('');
  readonly resolutionCategory = signal<ResolutionCategory | ''>('');
  readonly internalResolutionNote = signal('');
  readonly sendCsat = signal(true);
  readonly lightbox = signal<Attachment | null>(null);
  readonly toast = signal('');
  readonly now = signal(Date.now());
  readonly staffLoading = signal(false);
  private modalOrigin: HTMLElement | null = null;
  private readonly objectUrls = new Set<string>();
  readonly workflowSteps: ReadonlyArray<{ status: TicketStatus; label: string }> = [
    { status: 'unassigned', label: 'Chờ tiếp nhận' },
    { status: 'processing', label: 'Đang xử lý' },
    { status: 'waiting', label: 'Chờ phản hồi' },
    { status: 'reopened', label: 'Cần xử lý tiếp' },
    { status: 'closed', label: 'Hoàn tất' }
  ];
  readonly replyTemplates = this.data.replyTemplates;
  readonly departments = ['Đội Kỹ thuật và Coding Lab', 'Đội Thanh toán', 'Đội Chăm sóc học viên', 'Đội Đào tạo và Giảng viên', 'Ban Quản lý Cấp cao / Trưởng ca'] as const;
  readonly departmentOptions: ReadonlyArray<CustomSelectOption> = this.departments.map(department => ({ value: department, label: department }));
  readonly templateCategoryOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'technical', label: 'Lỗi kỹ thuật và Lab' },
    { value: 'account', label: 'Tài khoản' },
    { value: 'payment', label: 'Thanh toán' }
  ];
  readonly resolutionOptions: ReadonlyArray<CustomSelectOption> = [
    { value: 'code_guidance', label: 'Đã hướng dẫn sửa lỗi code' },
    { value: 'lab_fixed', label: 'Đã sửa lỗi môi trường Lab trên máy chủ' },
    { value: 'information_restored', label: 'Đã cấp lại thông tin' },
    { value: 'no_response', label: 'Học viên không phản hồi sau 48 giờ' },
    { value: 'other', label: 'Khác' }
  ];
  readonly currentStepIndex = computed(() => this.workflowSteps.findIndex(step => step.status === (this.ticket()?.status ?? 'unassigned')));
  readonly displayedThread = computed(() => {
    const messages = this.ticket()?.thread ?? [];
    return this.newestFirst() ? [...messages].reverse() : [...messages];
  });
  readonly filteredStaff = computed(() => this.staff().filter(person => person.active && person.team === this.assignmentDepartment()));
  readonly assigneeOptions = computed<ReadonlyArray<CustomSelectOption>>(() => [
    { value: 'auto', label: 'Tự động gán cho người ít việc nhất' },
    ...this.filteredStaff().map(person => ({ value: person.name, label: `${person.name} · ${this.staffWorkload(person.name)} ticket đang xử lý` }))
  ]);
  readonly filteredTemplates = computed(() => { const query = this.templateQuery().trim().toLocaleLowerCase('vi'); const preferred = this.templateCategoryForTopic(this.ticket()?.topic ?? ''); return this.replyTemplates().filter(item => (this.templateCategory() === 'all' || item.category === this.templateCategory()) && (!query || `${item.title} ${item.description} ${item.body} ${item.keywords.join(' ')}`.toLocaleLowerCase('vi').includes(query))).sort((a, b) => Number(b.category === preferred) - Number(a.category === preferred)); });
  readonly canSaveTemplate = computed(() => this.templateDraftTitle().trim().length >= 5 && this.templateDraftDescription().trim().length >= 10 && this.wordCount(this.templateDraftBody()) >= 5);
  readonly emailFieldsValid = computed(() => this.replyChannel() === 'internal' || (this.isEmail(this.emailTo()) && this.emailSubject().trim().length >= 3 && this.validOptionalEmails(this.emailCc()) && this.validOptionalEmails(this.emailBcc())));
  readonly canSubmitReply = computed(() => this.reply().trim().length >= 3 && this.emailFieldsValid());
  readonly isOtherDispute = computed(() => this.disputeGroup() === 'other');
  readonly canEscalate = computed(() => Boolean(this.disputeGroup()) && this.escalationGrounds().trim().length >= 20 && (!this.isOtherDispute() || (this.customDisputeType().trim().length >= 5 && this.customClassificationReason().trim().length >= 20)));
  readonly canCloseTicket = computed(() => Boolean(this.resolutionCategory()) && this.wordCount(this.internalResolutionNote()) >= 15);

  slaMs(): number { const ticket = this.ticket(); if (!ticket) return 0; const end = ticket.status === 'closed' && ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : this.now(); return new Date(ticket.dueAt).getTime() - end; }
  sla(): string { const ticket = this.ticket(); const ms = this.slaMs(); const hours = Math.ceil(Math.abs(ms) / 3_600_000); if (ticket?.status === 'closed') return ms < 0 ? `Đóng trễ ${hours} giờ` : `Đúng hạn ${hours} giờ`; return ms < 0 ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  toggleSort(): void { this.newestFirst.update(value => !value); }
  constructor() { const clock = setInterval(() => this.now.set(Date.now()), 60_000); this.destroyRef.onDestroy(() => { clearInterval(clock); this.objectUrls.forEach(url => URL.revokeObjectURL(url)); }); }

  onEditorInput(event: Event): void { this.reply.set((event.target as HTMLElement).innerText.slice(0, 2000)); }
  selectReplyChannel(channel: ReplyChannel): void { this.replyChannel.set(channel); }
  removePrimaryRecipient(): void { this.emailTo.set(''); }
  toggleCc(): void { this.showCc.update(value => !value); if (!this.showCc()) this.emailCc.set(''); }
  toggleBcc(): void { this.showBcc.update(value => !value); if (!this.showBcc()) this.emailBcc.set(''); }
  formatReply(command: 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList'): void { this.replyEditor?.nativeElement.focus(); document.execCommand(command); if (this.replyEditor) this.reply.set(this.replyEditor.nativeElement.innerText.slice(0, 2000)); }
  useTemplate(template: ReplyTemplate): void {
    const ticket = this.ticket(); if (!ticket) return;
    const value = template.body.replaceAll('{Tên học viên}', ticket.learner).replaceAll('{Mã bài học}', ticket.lessonCode ?? '[Mã bài học]');
    this.reply.set(value);
    if (this.replyEditor) this.replyEditor.nativeElement.innerText = value;
    this.closeModal();
    this.replyEditor?.nativeElement.focus();
  }
  openTemplates(): void { if (this.replyChannel() !== 'email') return; this.templateEditorMode.set(null); this.templateQuery.set(''); this.templateCategory.set('all'); this.selectedTemplate.set(this.filteredTemplates()[0] ?? null); this.openModal('templates'); }
  templateCount(category: ReplyTemplate['category']): number { return this.replyTemplates().filter(item => item.category === category).length; }
  openCreateTemplate(): void { this.templateDraftId.set(`TPL-CUSTOM-${Date.now()}`); this.templateDraftTitle.set(''); this.templateDraftDescription.set(''); this.templateDraftCategory.set(this.templateCategoryForTopic(this.ticket()?.topic ?? '')); this.templateDraftKeywords.set(''); this.templateDraftBody.set(''); this.templateEditorMode.set('create'); }
  openEditTemplate(): void { const template = this.selectedTemplate(); if (!template) return; this.templateDraftId.set(template.id); this.templateDraftTitle.set(template.title); this.templateDraftDescription.set(template.description); this.templateDraftCategory.set(template.category); this.templateDraftKeywords.set(template.keywords.join(', ')); this.templateDraftBody.set(template.body); this.templateEditorMode.set('edit'); }
  cancelTemplateEditor(): void { this.templateEditorMode.set(null); }
  saveTemplate(): void { if (!this.canSaveTemplate()) return; const mode = this.templateEditorMode(); const template: ReplyTemplate = { id: this.templateDraftId(), title: this.templateDraftTitle().trim(), description: this.templateDraftDescription().trim(), category: this.templateDraftCategory(), keywords: this.templateDraftKeywords().split(',').map(value => value.trim()).filter(Boolean), body: this.templateDraftBody().trim() }; this.data.saveReplyTemplate(template); this.selectedTemplate.set(template); this.templateCategory.set('all'); this.templateEditorMode.set(null); this.notify(`Đã ${mode === 'create' ? 'tạo' : 'cập nhật'} câu trả lời mẫu.`); }
  toggleEmojiPicker(): void { this.emojiPickerOpen.update(open => !open); }
  insertEmoji(emoji: string): void { const current = this.reply(); const separator = current && !/\s$/.test(current) ? ' ' : ''; const value = `${current}${separator}${emoji}`.slice(0, 2000); this.reply.set(value); this.emojiPickerOpen.set(false); if (this.replyEditor) { this.replyEditor.nativeElement.innerText = value; this.replyEditor.nativeElement.focus(); } }
  insertSelectedTemplate(): void { const template = this.selectedTemplate(); if (template) this.useTemplate(template); }

  chooseFiles(input: HTMLInputElement): void { input.click(); }
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const accepted = Array.from(input.files ?? []).filter(file => file.size <= 10 * 1024 * 1024);
    const rejected = (input.files?.length ?? 0) - accepted.length;
    const additions = accepted.map((file): Attachment => { const url = URL.createObjectURL(file); this.objectUrls.add(url); return { name: file.name, kind: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'document', url }; });
    this.pendingFiles.update(current => [...current, ...additions].slice(0, 5));
    input.value = '';
    if (additions.length) this.notify(`Đã đính kèm ${additions.length} tệp vào phản hồi.`);
    if (rejected) this.notify(`${rejected} tệp vượt quá giới hạn 10 MB và đã bị bỏ qua.`);
  }
  removePendingFile(name: string): void { const file = this.pendingFiles().find(item => item.name === name); if (file?.url) { URL.revokeObjectURL(file.url); this.objectUrls.delete(file.url); } this.pendingFiles.update(files => files.filter(item => item.name !== name)); }
  send(): void {
    const ticket = this.ticket(); const body = this.reply().trim();
    if (!ticket || !this.canSubmitReply()) return;
    if (this.replyChannel() === 'internal') {
      this.data.addInternalNote(ticket.id, body, this.pendingFiles());
      this.reply.set(''); this.pendingFiles.set([]);
      if (this.replyEditor) this.replyEditor.nativeElement.innerHTML = '';
      this.notify('Đã lưu ghi chú nội bộ; người gửi ticket không nhận được nội dung này.');
      return;
    }
    const nextStatus: Extract<TicketStatus, 'processing' | 'waiting'> = ticket.status === 'waiting' ? 'waiting' : 'processing';
    this.data.reply(ticket.id, body, nextStatus, this.pendingFiles(), this.buildEmailMetadata());
    this.reply.set(''); this.pendingFiles.set([]);
    if (this.replyEditor) this.replyEditor.nativeElement.innerHTML = '';
    this.notify(nextStatus === 'waiting' ? 'Đã gửi phản hồi; ticket tiếp tục chờ học viên.' : 'Đã gửi phản hồi; ticket tiếp tục được xử lý.');
  }

  toggleMessageMenu(id: string): void { this.messageMenuId.update(current => current === id ? null : id); }
  replyTo(message: ThreadMessage): void {
    const value = `Phản hồi ${message.sender}: `;
    this.reply.set(value); if (this.replyEditor) this.replyEditor.nativeElement.innerText = value;
    this.messageMenuId.set(null); this.replyEditor?.nativeElement.focus();
  }
  async copyMessage(message: ThreadMessage): Promise<void> { await navigator.clipboard.writeText(message.body); this.messageMenuId.set(null); this.notify('Đã sao chép nội dung tin nhắn.'); }

  openAssignment(): void {
    const ticket = this.ticket();
    if (!ticket) return;
    const currentAssignee = ticket.assignee ? this.staff().find(person => person.name === ticket.assignee) : undefined;
    this.assignmentDepartment.set(currentAssignee?.team ?? this.suggestedTeam(ticket.topic));
    this.pendingAssignee.set(ticket.assignee ?? 'auto');
    this.assignmentNote.set('');
    this.openModal('assign');
  }
  changeDepartment(value: string): void { this.assignmentDepartment.set(value); this.pendingAssignee.set(''); this.staffLoading.set(true); setTimeout(() => this.staffLoading.set(false), 200); }
  staffWorkload(name: string): number {
    const assignedInDemo = this.data.tickets().filter(item => item.assignee === name && ['unassigned', 'processing', 'waiting', 'reopened'].includes(item.status)).length;
    return assignedInDemo || this.staff().find(person => person.name === name)?.openTickets || 0;
  }
  confirmAssignee(): void {
    const ticket = this.ticket(); let assignee = this.pendingAssignee();
    if (!ticket || !assignee || this.assignmentNote().trim().length < 10) return;
    if (assignee === 'auto') assignee = [...this.filteredStaff()].sort((a, b) => this.staffWorkload(a.name) - this.staffWorkload(b.name))[0]?.name ?? '';
    if (!assignee) return;
    this.data.assignTicket(ticket.id, assignee, this.assignmentNote().trim());
    this.closeModal(); this.notify(`Đã điều chuyển ${ticket.id} cho ${assignee}; SLA gốc được giữ nguyên.`);
  }
  openEscalation(): void { this.disputeGroup.set(''); this.customDisputeType.set(''); this.customClassificationReason.set(''); this.escalationGrounds.set(''); this.openModal('escalate'); }
  escalate(): void { const ticket = this.ticket(); if (!ticket || !this.canEscalate()) return; const complaintId = this.data.escalateTicket(ticket.id, this.escalationGrounds().trim(), this.disputeGroup(), this.customDisputeType().trim(), this.customClassificationReason().trim()); this.closeModal(); void this.router.navigate(['/support/complaints', complaintId]); }
  openCloseModal(): void { if (!this.canSubmitReply()) return; this.resolutionCategory.set(''); this.internalResolutionNote.set(''); this.sendCsat.set(this.replyChannel() === 'email'); this.openModal('close'); }
  setResolutionCategory(value: string): void { this.resolutionCategory.set(value as ResolutionCategory | ''); }
  confirmClose(): void { const ticket = this.ticket(); const category = this.resolutionCategory(); if (!ticket || !category || !this.canCloseTicket()) return; this.data.resolveTicket(ticket.id, this.reply().trim(), category, this.internalResolutionNote().trim(), this.sendCsat(), this.pendingFiles(), this.replyChannel() === 'email' ? this.buildEmailMetadata() : undefined); this.closeModal(); this.reply.set(''); this.pendingFiles.set([]); if (this.replyEditor) this.replyEditor.nativeElement.innerHTML = ''; this.notify('Đã đóng ticket, lưu hồ sơ và dừng bộ đếm SLA.'); }
  openAttachment(file: Attachment): void { if (file.kind === 'image') { this.lightbox.set(file); return; } this.downloadAttachment(file); }
  downloadAttachment(file: Attachment): void { if (!file.url) { this.notify(`Tệp ${file.name} chưa có URL thật từ API.`); return; } const link = document.createElement('a'); link.href = file.url; link.download = file.name; link.rel = 'noopener'; link.click(); }
  async syncEmail(): Promise<void> { const ticket = this.ticket(); if (!ticket || ticket.emailSyncStatus === 'syncing') return; try { await this.data.syncEmailReplies(ticket.id); this.notify('Đã bóc tách email mới, mở lại ticket và đưa về đầu hàng đợi.'); } catch { this.notify('Không thể đồng bộ email. Vui lòng thử lại.'); } }
  initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]?.toUpperCase()).join(''); }
  statusLabel(status: TicketStatus): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', waiting: 'Chờ học viên phản hồi', reopened: 'Cần xử lý tiếp', closed: 'Hoàn tất' })[status]; }
  priorityLabel(priority: Priority): string { return ({ high: 'Ưu tiên cao', medium: 'Ưu tiên trung bình', low: 'Ưu tiên thấp' })[priority]; }
  requesterRoleLabel(ticket: SupportTicket): string { return ticket.requesterRole === 'instructor' ? 'Giảng viên' : 'Học viên'; }
  requesterCode(ticket: SupportTicket): string { return `${ticket.requesterRole === 'instructor' ? 'GV' : 'HV'}-${ticket.id.slice(-4)}`; }
  latestUpdate(thread: ThreadMessage[]): string { return thread.at(-1)?.sentAt ?? this.ticket()?.createdAt ?? ''; }
  workflowDate(index: number, ticket: SupportTicket): string {
    if (index > this.currentStepIndex()) return '';
    if (index === this.currentStepIndex()) return 'Hiện tại';
    const date = index === 0 ? ticket.createdAt : ticket.thread[Math.min(index - 1, ticket.thread.length - 1)]?.sentAt ?? ticket.createdAt;
    return new Date(date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  async copyTicketCode(): Promise<void> { await navigator.clipboard.writeText(this.ticketId); this.notify('Đã sao chép mã ticket.'); }
  async copyRequesterCode(): Promise<void> { const ticket = this.ticket(); if (!ticket) return; await navigator.clipboard.writeText(this.requesterCode(ticket)); this.notify('Đã sao chép mã người dùng.'); }
  private suggestedTeam(topic: string): string { if (topic.includes('Kỹ thuật') || topic.includes('Coding')) return 'Đội Kỹ thuật và Coding Lab'; if (topic.includes('Thanh toán') || topic.includes('Hoàn tiền')) return 'Đội Thanh toán'; if (topic.includes('Giảng viên') || topic.includes('Chất lượng')) return 'Đội Đào tạo và Giảng viên'; return 'Đội Chăm sóc học viên'; }
  private isEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
  private splitEmails(value: string): string[] { return value.split(/[;,]/).map(email => email.trim()).filter(Boolean); }
  private validOptionalEmails(value: string): boolean { return this.splitEmails(value).every(email => this.isEmail(email)); }
  wordCount(value: string): number { return value.trim() ? value.trim().split(/\s+/).length : 0; }
  private buildEmailMetadata(): EmailReplyMetadata { return { to: this.emailTo().trim(), cc: this.splitEmails(this.emailCc()), bcc: this.splitEmails(this.emailBcc()), subject: this.emailSubject().trim() }; }
  private templateCategoryForTopic(topic: string): ReplyTemplate['category'] { if (topic.includes('Kỹ thuật') || topic.includes('Coding')) return 'technical'; if (topic.includes('Thanh toán') || topic.includes('Hoàn tiền')) return 'payment'; return 'account'; }
  private openModal(type: Exclude<TicketModal, null>): void { this.modalOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null; this.activeModal.set(type); setTimeout(() => document.querySelector<HTMLElement>('.ticket-modal button, .ticket-modal input, .ticket-modal select, .ticket-modal textarea')?.focus()); }
  closeModal(): void { this.activeModal.set(null); setTimeout(() => this.modalOrigin?.focus()); }
  @HostListener('document:keydown.escape') closeOnEscape(): void { if (this.lightbox()) this.lightbox.set(null); else if (this.activeModal()) this.closeModal(); else this.emojiPickerOpen.set(false); }
  @HostListener('document:click', ['$event']) closeEmojiPickerOnOutsideClick(event: Event): void { if (this.emojiPickerOpen() && !(event.target as HTMLElement).closest('.emoji-picker-wrap')) this.emojiPickerOpen.set(false); }
  @HostListener('document:keydown.tab', ['$event']) trapModalFocus(domEvent: Event): void { if (!this.activeModal()) return; const event = domEvent as KeyboardEvent; const controls = document.querySelectorAll<HTMLElement>('.ticket-modal button:not([disabled]), .ticket-modal input:not([disabled]), .ticket-modal select:not([disabled]), .ticket-modal textarea:not([disabled])'); if (!controls.length) return; const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  private notify(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 3200); }
}
