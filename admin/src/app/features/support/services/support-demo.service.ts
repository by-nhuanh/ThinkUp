import { Injectable, signal } from '@angular/core';
import { MOCK_COMPLAINTS, MOCK_FAILED_SEARCHES, MOCK_FAQS, MOCK_STAFF, MOCK_TICKETS } from '../../../core/data/mock/support.mock';
import { Attachment, ComplaintCase, FaqItem, FaqStatus, PendingOperation, ResolutionCategory, SupportTicket, ThreadMessage, TicketStatus } from '../models/support.models';

// TODO(pre-deploy): Nhớ xóa adapter demo và thay bằng HttpClient adapter sau khi có endpoint, schema, quyền và error contract chính thức.
@Injectable({ providedIn: 'root' })
export class SupportDemoService {
  readonly tickets = signal<SupportTicket[]>(structuredClone(MOCK_TICKETS));
  readonly complaints = signal<ComplaintCase[]>(structuredClone(MOCK_COMPLAINTS));
  readonly faqs = signal<FaqItem[]>(structuredClone(MOCK_FAQS));
  readonly staff = signal(structuredClone(MOCK_STAFF));
  readonly failedSearches = signal(structuredClone(MOCK_FAILED_SEARCHES));
  readonly pendingOperations = signal<PendingOperation[]>([]);

  acceptTicket(id: string): void {
    const ticket = this.tickets().find(item => item.id === id); if (!ticket || ticket.assignee) return;
    const team = this.suggestedTeam(ticket.topic);
    const assignee = this.staff().filter(item => item.active && item.team === team).sort((a, b) => a.openTickets - b.openTickets)[0]
      ?? this.staff().filter(item => item.active).sort((a, b) => a.openTickets - b.openTickets)[0];
    if (!assignee) return;
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, assignee: assignee.name, status: 'processing' } : item));
    this.queue('ticket_accept', id, { assignee: assignee.name, automatic: true });
  }
  reply(id: string, body: string, status: Extract<TicketStatus, 'processing' | 'waiting'>, attachments: Attachment[] = []): void {
    // TODO(pre-deploy): Nhớ thay tệp mock bằng kết quả upload từ API trước khi gửi phản hồi thật.
    const message: ThreadMessage = { id: crypto.randomUUID(), sender: 'Gia Huy', role: 'agent', sentAt: new Date().toISOString(), body, attachments };
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, status, thread: [...item.thread, message] } : item));
    this.queue('ticket_reply', id, { status, body, attachments });
  }
  resolveTicket(id: string, body: string, category: ResolutionCategory, internalNote: string, sendCsat: boolean, attachments: Attachment[] = []): void {
    const resolvedAt = new Date().toISOString();
    const message: ThreadMessage = { id: crypto.randomUUID(), sender: 'Gia Huy', role: 'agent', sentAt: resolvedAt, body, attachments };
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, status: 'closed', resolvedAt, resolutionCategory: category, internalResolutionNote: internalNote, sendCsat, thread: [...item.thread, message] } : item));
    this.queue('ticket_resolution', id, { body, category, internalNote, sendCsat, attachments });
  }
  assignTicket(id: string, assignee: string, note: string): void {
    const ticket = this.tickets().find(item => item.id === id); const previous = ticket?.assignee ?? 'Chưa gán';
    const systemNote: ThreadMessage = { id: crypto.randomUUID(), sender: 'Hệ thống', role: 'system', source: 'internal', internalOnly: true, sentAt: new Date().toISOString(), body: `Admin ${previous} đã bàn giao ticket cho ${assignee}. Ghi chú: ${note}`, attachments: [] };
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, assignee, status: 'processing', thread: [...item.thread, { ...systemNote, source: 'internal', internalOnly: true }] } : item));
    this.queue('ticket_assignment', id, { assignee, note, preserveOriginalSla: true, notifyByBellAndEmail: true });
  }
  escalateTicket(id: string, grounds: string, disputeGroup: string): string {
    const ticket = this.tickets().find(item => item.id === id); if (!ticket) return '';
    const complaintId = `CP-${new Date().getFullYear()}-${String(this.complaints().length + 319).padStart(4, '0')}`;
    const complaint: ComplaintCase = { id: complaintId, sourceTicketId: ticket.id, claimant: ticket.learner, respondent: 'Chờ xác định', type: disputeGroup, status: 'reviewing', amount: 0, createdAt: new Date().toISOString(), dueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), risk: 'high', evidence: ticket.attachments, learnerStatement: ticket.summary, course: 'Chờ đối soát', orderId: 'Chờ đối soát', purchasedAt: ticket.createdAt, progress: 0, refundEligibleUntil: ticket.createdAt };
    this.complaints.update(items => [complaint, ...items]); this.tickets.update(items => items.map(item => item.id === id ? { ...item, linkedComplaintId: complaintId } : item)); this.queue('ticket_escalation', id, { complaintId, grounds, disputeGroup, preserveHistory: true, notifySupervisor: true }); return complaintId;
  }
  async syncEmailReplies(id: string): Promise<void> {
    const ticket = this.tickets().find(item => item.id === id); if (!ticket) return;
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, emailSyncStatus: 'syncing', emailSyncError: undefined } : item));
    await new Promise(resolve => setTimeout(resolve, 450));
    const sentAt = new Date().toISOString();
    const message: ThreadMessage = { id: crypto.randomUUID(), sender: ticket.learner, role: 'learner', source: 'email', sentAt, body: 'Tôi phản hồi qua email để bổ sung thông tin. Nhờ ThinkUp tiếp tục kiểm tra giúp.', attachments: [] };
    this.tickets.update(items => items.map(item => item.id === id ? { ...item, status: 'reopened', reopenedAt: sentAt, emailSyncStatus: 'synced', lastEmailSyncAt: sentAt, thread: [...item.thread, message] } : item));
    this.queue('ticket_email_sync', id, { parsed: true, quotesRemoved: true, reopened: true });
  }
  requestInstructorExplanation(id: string, deadlineHours: 12 | 24, freezeCommission: boolean, directive: string): void {
    this.complaints.update(items => items.map(item => item.id === id ? { ...item, status: 'waiting_instructor' } : item));
    this.queue('complaint_explanation', id, { deadlineHours, freezeCommission, directive, notifyByBellAndEmail: true });
  }
  approveComplaintRefund(id: string, amount: number, revokeAccess: boolean, revokeCertificate: boolean, conclusion: string): void {
    this.complaints.update(items => items.map(item => item.id === id ? { ...item, status: 'resolved', conclusion } : item));
    this.queue('complaint_refund', id, { amount, instructorShare: Math.round(amount * .7), platformShare: amount - Math.round(amount * .7), revokeAccess, revokeCertificate, requiresPaymentGatewayConfirmation: true });
  }
  dismissComplaint(id: string, basis: string, explanation: string, giftVoucher: boolean): void {
    this.complaints.update(items => items.map(item => item.id === id ? { ...item, status: 'dismissed', conclusion: explanation } : item));
    this.queue('complaint_dismissal', id, { basis, explanation, giftVoucher, releaseFrozenFunds: true, preserveLearningAccess: true });
  }
  disciplineInstructor(id: string, sanctions: string[], decisionText: string): void {
    this.complaints.update(items => items.map(item => item.id === id ? { ...item, status: 'resolved', conclusion: decisionText } : item));
    this.queue('complaint_discipline', id, { sanctions, decisionText, requiresInstructorAndWalletServices: true, persistAuditLog: true });
  }
  saveFaq(value: FaqItem): void {
    this.faqs.update(items => {
      const previous = items.find(item => item.id === value.id);
      const withoutCurrent = items.filter(item => item.id !== value.id);
      const normalizedPreviousCategory = previous && previous.category !== value.category
        ? this.normalizeFaqOrders(withoutCurrent, previous.category)
        : withoutCurrent;
      return this.insertFaqAtOrder(normalizedPreviousCategory, value);
    });
    this.queue('faq_save', value.id, { value });
  }
  reorderFaq(id: string, order: number): void {
    this.faqs.update(items => {
      const current = items.find(item => item.id === id); if (!current) return items;
      return this.insertFaqAtOrder(items.filter(item => item.id !== id), { ...current, order, updatedAt: new Date().toISOString() });
    });
    this.queue('faq_reorder', id, { order });
  }
  setFaqStatus(id: string, status: FaqStatus): void { this.faqs.update(items => items.map(item => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item)); this.queue('faq_status', id, { status }); }
  deleteFaq(id: string): void {
    this.faqs.update(items => {
      const current = items.find(item => item.id === id); if (!current) return items;
      return this.normalizeFaqOrders(items.filter(item => item.id !== id), current.category);
    });
    this.queue('faq_delete', id, {});
  }
  requestComplaintAction(id: string, type: string, payload: Readonly<Record<string, unknown>>): void { this.queue(type, id, payload); }
  private queue(type: string, referenceId: string, payload: Readonly<Record<string, unknown>>): void { this.pendingOperations.update(items => [{ id: crypto.randomUUID(), type, referenceId, requestedAt: new Date().toISOString(), payload }, ...items]); }
  private insertFaqAtOrder(items: FaqItem[], value: FaqItem): FaqItem[] {
    const categoryItems = items.filter(item => item.category === value.category).sort((a, b) => a.order - b.order);
    const otherItems = items.filter(item => item.category !== value.category);
    const index = Math.max(0, Math.min(categoryItems.length, Math.trunc(value.order) - 1));
    categoryItems.splice(index, 0, value);
    return [...otherItems, ...categoryItems.map((item, position) => ({ ...item, order: position + 1 }))];
  }
  private normalizeFaqOrders(items: FaqItem[], category: string): FaqItem[] {
    let position = 0;
    return items.map(item => item.category === category ? { ...item, order: ++position } : item);
  }
  private suggestedTeam(topic: string): string {
    if (topic.includes('Kỹ thuật') || topic.includes('Coding')) return 'Đội Kỹ thuật và Coding Lab';
    if (topic.includes('Thanh toán') || topic.includes('Hoàn tiền')) return 'Đội Thanh toán';
    if (topic.includes('Giảng viên') || topic.includes('Chất lượng')) return 'Đội Đào tạo và Giảng viên';
    return 'Đội Chăm sóc học viên';
  }
}
