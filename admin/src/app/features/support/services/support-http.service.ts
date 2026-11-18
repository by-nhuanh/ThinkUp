import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MOCK_FAQS, MOCK_TICKETS, MOCK_COMPLAINTS } from '../../../core/data/mock/support.mock';
import { Attachment, ComplaintCase, FaqItem, FaqStatus, SupportTicket, TicketStatus } from '../models/support.models';
import { SupportDemoService } from './support-demo.service';

interface Page<T> { items?: T[]; pagination?: { total?: number; pages?: number; totalPages?: number }; }

/** Base support API adapter. The demo class remains the local fallback and supplies unchanged UI-only helpers. */
@Injectable({ providedIn: 'root' })
export class SupportHttpService extends SupportDemoService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;
  override readonly tickets = signal<SupportTicket[]>(structuredClone(MOCK_TICKETS));
  override readonly complaints = signal<ComplaintCase[]>(structuredClone(MOCK_COMPLAINTS));
  override readonly faqs = signal<FaqItem[]>(structuredClone(MOCK_FAQS));

  constructor() { super(); void this.load(); }

  async load(): Promise<void> {
    try {
      const [tickets, complaints, faqs] = await Promise.all([
        this.all<Raw>(`${this.base}/admin/support/tickets`, 'limit'),
        this.all<Raw>(`${this.base}/admin/support/complaints`, 'limit'),
        this.all<Raw>(`${this.base}/admin/support/faqs`, 'limit')
      ]);
      this.tickets.set(tickets.map(toTicket)); this.complaints.set(complaints.map(toComplaint)); this.faqs.set(faqs.map(toFaq));
    } catch { /* Per Q2, a 403 is surfaced when the user enters the page; no menu hiding or mock fallback. */ }
  }

  private async all<T>(url: string, pageParam: 'limit'): Promise<T[]> {
    const result: T[] = []; let page = 1; let pages = 1;
    do {
      const response = await firstValueFrom(this.http.get<Page<T>>(url, { params: new HttpParams().set('page', page).set(pageParam, 100) }));
      result.push(...(response.items ?? [])); pages = response.pagination?.pages ?? response.pagination?.totalPages ?? 1; page += 1;
    } while (page <= pages);
    return result;
  }

  override acceptTicket(id: string): void { void this.post(`/admin/support/tickets/${encodeURIComponent(id)}/claim`, {}); }
  override reply(id: string, body: string, status: Extract<TicketStatus, 'processing' | 'waiting'>, attachments: Attachment[] = []): void { void this.post(`/admin/support/tickets/${encodeURIComponent(id)}/reply`, { body, status, attachments }); }
  override assignTicket(id: string, assignee: string, note: string): void { void this.post(`/admin/support/tickets/${encodeURIComponent(id)}/transfer`, { assignee, note }); }
  override resolveTicket(id: string, body: string, category: string, internalNote: string, sendCsat: boolean, attachments: Attachment[] = []): void { void this.post(`/admin/support/tickets/${encodeURIComponent(id)}/resolve`, { body, category, internalNote, sendCsat, attachments }); }
  override requestInstructorExplanation(id: string, deadlineHours: 12 | 24, freezeCommission: boolean, directive: string): void { void this.post(`/admin/support/complaints/${encodeURIComponent(id)}/request-explanation`, { deadlineHours, freezeCommission, directive }); }
  override approveComplaintRefund(id: string, amount: number, revokeAccess: boolean, revokeCertificate: boolean, conclusion: string): void { void this.post(`/admin/support/complaints/${encodeURIComponent(id)}/resolve-refund`, { amount, revokeAccess, revokeCertificate, conclusion }); }
  override dismissComplaint(id: string, basis: string, explanation: string, giftVoucher: boolean): void { void this.post(`/admin/support/complaints/${encodeURIComponent(id)}/dismiss`, { basis, explanation, giftVoucher }); }
  override disciplineInstructor(id: string, sanctions: string[], decisionText: string): void { void this.post(`/admin/support/complaints/${encodeURIComponent(id)}/discipline-instructor`, { sanctions, decisionText }); }
  override saveFaq(value: FaqItem): void { void this.request(this.faqs().some(item => item.id === value.id) ? 'PUT' : 'POST', `/admin/support/faqs${this.faqs().some(item => item.id === value.id) ? `/${encodeURIComponent(value.id)}` : ''}`, { question: value.question, answer: value.answer, categoryCode: value.category, keywords: value.keywords, orderIndex: value.order, status: value.status }); }
  override setFaqStatus(id: string, status: FaqStatus): void { void this.post(`/admin/support/faqs/${encodeURIComponent(id)}/status`, { status }); }
  override deleteFaq(id: string): void { void this.request('DELETE', `/admin/support/faqs/${encodeURIComponent(id)}`); }

  private post(path: string, body: unknown): Promise<unknown> { return this.request('POST', path, body); }
  private request(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
    const request = method === 'POST' ? this.http.post(`${this.base}${path}`, body) : method === 'PUT' ? this.http.put(`${this.base}${path}`, body) : this.http.delete(`${this.base}${path}`);
    return firstValueFrom(request).then(result => { void this.load(); return result; });
  }
}

type Raw = Record<string, unknown>;
const text = (row: Raw, ...keys: string[]): string => String(keys.map(key => row[key]).find(value => value != null) ?? '');
const number = (row: Raw, ...keys: string[]): number => Number(keys.map(key => row[key]).find(value => value != null) ?? 0);
const attachments = (value: unknown): Attachment[] => Array.isArray(value) ? value.map(item => ({ name: text(item as Raw, 'name', 'filename'), kind: 'document' as const, url: text(item as Raw, 'url') || undefined })) : [];
function toTicket(row: Raw): SupportTicket { return { id: text(row, 'id', 'ticketCode', 'ticket_code'), learner: text(row, 'learner', 'fullName', 'full_name'), requesterRole: row['requesterRole'] === 'instructor' ? 'instructor' : 'learner', email: text(row, 'email', 'contactEmail', 'contact_email'), phone: text(row, 'phone'), topic: text(row, 'topic'), summary: text(row, 'summary', 'message'), priority: text(row, 'priority') as SupportTicket['priority'] || 'medium', status: text(row, 'status') as SupportTicket['status'] || 'unassigned', createdAt: text(row, 'createdAt', 'created_at'), dueAt: text(row, 'dueAt', 'response_due_at'), assignee: text(row, 'assignee') || undefined, assigneeId: text(row, 'assigneeId', 'assignee_id') || undefined, attachments: attachments(row['attachments']), thread: [] }; }
function toComplaint(row: Raw): ComplaintCase { return { id: text(row, 'id', 'complaintCode', 'complaint_code'), sourceTicketId: text(row, 'sourceTicketId'), claimant: text(row, 'claimant', 'claimantName'), respondent: text(row, 'respondent', 'respondentName'), type: text(row, 'type', 'disputeType', 'dispute_type'), status: text(row, 'status') as ComplaintCase['status'] || 'reviewing', amount: number(row, 'amount'), createdAt: text(row, 'createdAt', 'created_at'), dueAt: text(row, 'dueAt', 'due_at'), risk: row['risk'] === 'high' || row['isHighRisk'] === true ? 'high' : 'standard', evidence: attachments(row['evidence']), learnerStatement: text(row, 'learnerStatement'), course: text(row, 'course'), orderId: text(row, 'orderId'), purchasedAt: text(row, 'purchasedAt'), progress: number(row, 'progress'), refundEligibleUntil: text(row, 'refundEligibleUntil') }; }
function toFaq(row: Raw): FaqItem { return { id: text(row, 'id', '_id'), question: text(row, 'question'), answer: text(row, 'answer'), category: text(row, 'categoryCode', 'category_code', 'category'), keywords: Array.isArray(row['keywords']) ? row['keywords'].map(String) : [], views: number(row, 'views', 'viewsCount', 'views_count'), order: number(row, 'order', 'orderIndex', 'order_index'), status: text(row, 'status') as FaqStatus || 'published', updatedAt: text(row, 'updatedAt', 'updated_at') }; }
