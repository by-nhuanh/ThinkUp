export type TicketStatus = 'unassigned' | 'processing' | 'waiting' | 'reopened' | 'closed';
export type Priority = 'high' | 'medium' | 'low';
export type EmailSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
export type ResolutionCategory = 'code_guidance' | 'lab_fixed' | 'information_restored' | 'no_response';
export type ComplaintStatus = 'reviewing' | 'waiting_instructor' | 'ready' | 'resolved' | 'dismissed';
export type FaqStatus = 'published' | 'hidden';

export interface Attachment { name: string; kind: 'image' | 'pdf' | 'document'; url?: string; }
export interface ThreadMessage { id: string; sender: string; role: 'learner' | 'agent' | 'system'; sentAt: string; body: string; attachments: Attachment[]; source?: 'web' | 'email' | 'internal'; internalOnly?: boolean; }
export interface SupportTicket {
  id: string; learner: string; email: string; phone: string; topic: string; summary: string;
  priority: Priority; status: TicketStatus; createdAt: string; dueAt: string; assignee?: string;
  attachments: Attachment[]; thread: ThreadMessage[]; resolvedAt?: string; linkedComplaintId?: string;
  reopenedAt?: string; emailSyncStatus?: EmailSyncStatus; emailSyncError?: string; lastEmailSyncAt?: string;
  resolutionCategory?: ResolutionCategory; internalResolutionNote?: string; sendCsat?: boolean;
}
export interface ComplaintCase {
  id: string; sourceTicketId?: string; claimant: string; respondent: string; type: string; status: ComplaintStatus;
  amount: number; createdAt: string; dueAt: string; risk: 'standard' | 'high'; evidence: Attachment[];
  learnerStatement: string; instructorStatement?: string; course: string; orderId: string; purchasedAt: string;
  progress: number; refundEligibleUntil: string; conclusion?: string;
}
export interface FaqItem {
  id: string; question: string; answer: string; category: string; keywords: string[];
  views: number; order: number; status: FaqStatus; updatedAt: string;
}
export interface FailedSearch { keyword: string; count: number; suggestedCategory: string; }
export interface StaffMember { id: string; name: string; team: string; active: boolean; openTickets: number; }
export interface PendingOperation { id: string; type: string; referenceId: string; requestedAt: string; payload: Readonly<Record<string, unknown>>; }
