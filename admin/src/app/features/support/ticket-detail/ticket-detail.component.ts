import { DatePipe } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideArrowDownUp, LucideArrowUp, LucideBold, LucideCalendarDays, LucideCheckCircle2, LucideChevronDown, LucideClock3, LucideCopy, LucideDownload, LucideEllipsis, LucideFileText, LucideImage, LucideItalic, LucideLayoutGrid, LucideLink, LucideList, LucideListOrdered, LucideMail, LucideMessageSquareText, LucidePaperclip, LucideRefreshCw, LucideReply, LucideSearch, LucideSend, LucideTag, LucideUnderline, LucideX } from '@lucide/angular';
import { Attachment, Priority, ResolutionCategory, ThreadMessage, TicketStatus } from '../models/support.models';
import { SupportDemoService } from '../services/support-demo.service';

type TicketModal = 'assign' | 'escalate' | 'templates' | 'close' | null;
type EditorCommand = 'bold' | 'italic' | 'underline' | 'createLink' | 'insertUnorderedList' | 'insertOrderedList';

interface ReplyTemplate { title: string; description: string; category: 'technical' | 'account' | 'payment'; body: string; }

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, LucideArrowDownUp, LucideArrowUp, LucideBold, LucideCalendarDays, LucideCheckCircle2, LucideChevronDown, LucideClock3, LucideCopy, LucideDownload, LucideEllipsis, LucideFileText, LucideImage, LucideItalic, LucideLayoutGrid, LucideLink, LucideList, LucideListOrdered, LucideMail, LucideMessageSquareText, LucidePaperclip, LucideRefreshCw, LucideReply, LucideSearch, LucideSend, LucideTag, LucideUnderline, LucideX],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['../support-page.css', './ticket-detail.component.css']
})
export class TicketDetailComponent {
  @ViewChild('replyEditor') private replyEditor?: ElementRef<HTMLElement>;

  private readonly data = inject(SupportDemoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly ticketId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ticket = computed(() => this.data.tickets().find(item => item.id === this.ticketId) ?? null);
  readonly staff = this.data.staff;
  readonly activeModal = signal<TicketModal>(null);
  readonly reply = signal('');
  readonly pendingFiles = signal<Attachment[]>([]);
  readonly keepOpenStatus = signal<Extract<TicketStatus, 'processing' | 'waiting'>>('waiting');
  readonly messageMenuId = signal<string | null>(null);
  readonly newestFirst = signal(true);
  readonly assignmentDepartment = signal('');
  readonly pendingAssignee = signal('');
  readonly assignmentNote = signal('');
  readonly escalationGrounds = signal('');
  readonly disputeGroup = signal('');
  readonly templateQuery = signal('');
  readonly templateCategory = signal<'all' | ReplyTemplate['category']>('all');
  readonly selectedTemplate = signal<ReplyTemplate | null>(null);
  readonly resolutionCategory = signal<ResolutionCategory | ''>('');
  readonly internalResolutionNote = signal('');
  readonly sendCsat = signal(true);
  readonly lightbox = signal<Attachment | null>(null);
  readonly toast = signal('');
  readonly workflowSteps: ReadonlyArray<{ status: TicketStatus; label: string }> = [
    { status: 'unassigned', label: 'Chờ tiếp nhận' },
    { status: 'processing', label: 'Đang xử lý' },
    { status: 'waiting', label: 'Chờ phản hồi' },
    { status: 'reopened', label: 'Cần xử lý tiếp' },
    { status: 'closed', label: 'Hoàn tất' }
  ];
  readonly replyTemplates: ReadonlyArray<ReplyTemplate> = [
    { title: 'Yêu cầu ảnh chụp và đoạn code', description: 'Thu thập thêm minh chứng', category: 'technical', body: 'Chào {Tên học viên}, bạn vui lòng bổ sung ảnh chụp toàn màn hình, mã bài học {Mã bài học} và đoạn code gây lỗi để ThinkUp kiểm tra.' },
    { title: 'Hướng dẫn SyntaxError', description: 'Kiểm tra cú pháp Python', category: 'technical', body: 'Chào {Tên học viên}, bạn vui lòng kiểm tra dấu hai chấm, thụt lề và dấu ngoặc trong bài {Mã bài học}, sau đó chạy lại từng khối lệnh.' },
    { title: 'Reset môi trường Lab', description: 'Khởi tạo lại Coding Lab', category: 'technical', body: 'Chào {Tên học viên}, hãy lưu mã nguồn, chọn Khởi tạo lại môi trường Lab và thử chạy lại bài {Mã bài học}.' },
    { title: 'Xác minh tài khoản', description: 'Thu thập thông tin đăng nhập', category: 'account', body: 'Chào {Tên học viên}, vui lòng xác nhận email đăng nhập và thời điểm gần nhất bạn truy cập thành công.' },
    { title: 'Đối soát thanh toán', description: 'Yêu cầu mã giao dịch', category: 'payment', body: 'Chào {Tên học viên}, vui lòng gửi mã giao dịch và ảnh biên lai để ThinkUp thực hiện đối soát.' }
  ];
  readonly departments = ['Đội Kỹ thuật và Coding Lab', 'Đội Thanh toán', 'Đội Chăm sóc học viên', 'Đội Đào tạo và Giảng viên', 'Ban Quản lý Cấp cao / Trưởng ca'] as const;
  readonly currentStepIndex = computed(() => this.workflowSteps.findIndex(step => step.status === (this.ticket()?.status ?? 'unassigned')));
  readonly displayedThread = computed(() => {
    const messages = this.ticket()?.thread ?? [];
    return this.newestFirst() ? [...messages].reverse() : [...messages];
  });
  readonly filteredStaff = computed(() => this.staff().filter(person => person.active && person.team === this.assignmentDepartment()));
  readonly filteredTemplates = computed(() => { const query = this.templateQuery().trim().toLocaleLowerCase('vi'); return this.replyTemplates.filter(item => (this.templateCategory() === 'all' || item.category === this.templateCategory()) && (!query || `${item.title} ${item.description} ${item.body}`.toLocaleLowerCase('vi').includes(query))); });

  slaMs(): number { const ticket = this.ticket(); return ticket ? new Date(ticket.dueAt).getTime() - Date.now() : 0; }
  sla(): string { const ms = this.slaMs(); const hours = Math.ceil(Math.abs(ms) / 3_600_000); return ms < 0 ? `Trễ ${hours} giờ` : `Còn ${hours} giờ`; }
  toggleSort(): void { this.newestFirst.update(value => !value); }
  constructor() { const ticket = this.ticket(); if (ticket?.status === 'unassigned') this.data.acceptTicket(ticket.id); }

  onEditorInput(event: Event): void { this.reply.set((event.target as HTMLElement).innerText.slice(0, 2000)); }
  format(command: EditorCommand): void {
    this.replyEditor?.nativeElement.focus();
    if (command === 'createLink') {
      const url = window.prompt('Nhập đường dẫn cần chèn:');
      if (!url) return;
      document.execCommand(command, false, url);
    } else {
      document.execCommand(command, false);
    }
    this.syncEditorValue();
  }
  useTemplate(template: ReplyTemplate): void {
    const ticket = this.ticket(); if (!ticket) return;
    const value = template.body.replaceAll('{Tên học viên}', ticket.learner).replaceAll('{Mã bài học}', ticket.id);
    this.reply.set(value);
    if (this.replyEditor) this.replyEditor.nativeElement.innerText = value;
    this.activeModal.set(null);
    this.replyEditor?.nativeElement.focus();
  }
  openTemplates(): void { this.templateQuery.set(''); this.templateCategory.set('all'); this.selectedTemplate.set(this.replyTemplates[0]); this.activeModal.set('templates'); }
  insertSelectedTemplate(): void { const template = this.selectedTemplate(); if (template) this.useTemplate(template); }

  chooseFiles(input: HTMLInputElement): void { input.click(); }
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const additions = Array.from(input.files ?? []).map((file): Attachment => ({ name: file.name, kind: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'document', url: URL.createObjectURL(file) }));
    this.pendingFiles.update(current => [...current, ...additions].slice(0, 5));
    input.value = '';
    if (additions.length) this.notify(`Đã đính kèm ${additions.length} tệp vào phản hồi.`);
  }
  removePendingFile(name: string): void { this.pendingFiles.update(files => files.filter(file => file.name !== name)); }
  send(): void {
    const ticket = this.ticket(); const body = this.reply().trim();
    if (!ticket || body.length < 3) return;
    this.data.reply(ticket.id, body, this.keepOpenStatus(), this.pendingFiles());
    this.reply.set(''); this.pendingFiles.set([]);
    if (this.replyEditor) this.replyEditor.nativeElement.innerHTML = '';
    this.notify(this.keepOpenStatus() === 'waiting' ? 'Đã gửi phản hồi và chuyển sang chờ học viên phản hồi.' : 'Đã gửi phản hồi và tiếp tục xử lý ticket.');
  }

  toggleMessageMenu(id: string): void { this.messageMenuId.update(current => current === id ? null : id); }
  replyTo(message: ThreadMessage): void {
    const value = `Phản hồi ${message.sender}: `;
    this.reply.set(value); if (this.replyEditor) this.replyEditor.nativeElement.innerText = value;
    this.messageMenuId.set(null); this.replyEditor?.nativeElement.focus();
  }
  async copyMessage(message: ThreadMessage): Promise<void> { await navigator.clipboard.writeText(message.body); this.messageMenuId.set(null); this.notify('Đã sao chép nội dung tin nhắn.'); }

  openAssignment(): void { const ticket = this.ticket(); if (!ticket) return; this.assignmentDepartment.set(this.suggestedTeam(ticket.topic)); this.pendingAssignee.set('auto'); this.assignmentNote.set(''); this.activeModal.set('assign'); }
  changeDepartment(value: string): void { this.assignmentDepartment.set(value); this.pendingAssignee.set(''); }
  confirmAssignee(): void {
    const ticket = this.ticket(); let assignee = this.pendingAssignee();
    if (!ticket || !assignee || this.assignmentNote().trim().length < 10) return;
    if (assignee === 'auto') assignee = [...this.filteredStaff()].sort((a, b) => a.openTickets - b.openTickets)[0]?.name ?? '';
    if (!assignee) return;
    this.data.assignTicket(ticket.id, assignee, this.assignmentNote().trim());
    this.activeModal.set(null); this.notify(`Đã điều chuyển ${ticket.id} cho ${assignee}; SLA gốc được giữ nguyên.`);
  }
  openEscalation(): void { this.disputeGroup.set(''); this.escalationGrounds.set(''); this.activeModal.set('escalate'); }
  escalate(): void { const ticket = this.ticket(); if (!ticket || !this.disputeGroup() || this.escalationGrounds().trim().length < 20) return; const complaintId = this.data.escalateTicket(ticket.id, this.escalationGrounds().trim(), this.disputeGroup()); this.activeModal.set(null); void this.router.navigate(['/support/complaints', complaintId]); }
  openCloseModal(): void { if (this.reply().trim().length < 3) return; this.resolutionCategory.set(''); this.internalResolutionNote.set(''); this.sendCsat.set(true); this.activeModal.set('close'); }
  confirmClose(): void { const ticket = this.ticket(); const category = this.resolutionCategory(); if (!ticket || !category) return; this.data.resolveTicket(ticket.id, this.reply().trim(), category, this.internalResolutionNote().trim(), this.sendCsat(), this.pendingFiles()); this.activeModal.set(null); this.reply.set(''); this.pendingFiles.set([]); if (this.replyEditor) this.replyEditor.nativeElement.innerHTML = ''; this.notify('Đã đóng ticket, lưu hồ sơ và dừng bộ đếm SLA.'); }
  openAttachment(file: Attachment): void { if (file.kind === 'image') { this.lightbox.set(file); return; } this.downloadAttachment(file); }
  downloadAttachment(file: Attachment): void { if (!file.url) { this.notify(`Tệp ${file.name} chưa có URL thật từ API.`); return; } const link = document.createElement('a'); link.href = file.url; link.download = file.name; link.rel = 'noopener'; link.click(); }
  async syncEmail(): Promise<void> { const ticket = this.ticket(); if (!ticket || ticket.emailSyncStatus === 'syncing') return; try { await this.data.syncEmailReplies(ticket.id); this.notify('Đã bóc tách email mới, mở lại ticket và đưa về đầu hàng đợi.'); } catch { this.notify('Không thể đồng bộ email. Vui lòng thử lại.'); } }
  initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]?.toUpperCase()).join(''); }
  statusLabel(status: TicketStatus): string { return ({ unassigned: 'Chờ tiếp nhận', processing: 'Đang xử lý', waiting: 'Chờ học viên phản hồi', reopened: 'Cần xử lý tiếp', closed: 'Hoàn tất' })[status]; }
  priorityLabel(priority: Priority): string { return ({ high: 'Ưu tiên cao', medium: 'Ưu tiên trung bình', low: 'Ưu tiên thấp' })[priority]; }
  latestUpdate(thread: ThreadMessage[]): string { return thread.at(-1)?.sentAt ?? this.ticket()?.createdAt ?? ''; }
  async copyStudentCode(): Promise<void> { await navigator.clipboard.writeText(`HV-${this.ticketId.slice(-4)}`); this.notify('Đã sao chép mã học viên.'); }
  showMoreActions(): void { this.notify('Không có thao tác bổ sung khả dụng cho trạng thái hiện tại.'); }
  private syncEditorValue(): void { if (this.replyEditor) this.reply.set(this.replyEditor.nativeElement.innerText.slice(0, 2000)); }
  private suggestedTeam(topic: string): string { if (topic.includes('Kỹ thuật') || topic.includes('Coding')) return 'Đội Kỹ thuật và Coding Lab'; if (topic.includes('Thanh toán') || topic.includes('Hoàn tiền')) return 'Đội Thanh toán'; if (topic.includes('Giảng viên') || topic.includes('Chất lượng')) return 'Đội Đào tạo và Giảng viên'; return 'Đội Chăm sóc học viên'; }
  private notify(message: string): void { this.toast.set(message); setTimeout(() => this.toast.set(''), 3200); }
}
