export type TicketStatus = 'unassigned' | 'processing' | 'waiting' | 'reopened' | 'closed';
export type Priority = 'high' | 'medium' | 'low';
export type EmailSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
export type ResolutionCategory = 'code_guidance' | 'lab_fixed' | 'information_restored' | 'no_response' | 'other';
export type ComplaintStatus = 'reviewing' | 'waiting_instructor' | 'ready' | 'resolved' | 'dismissed';
export type ComplaintDecisionType = 'refund' | 'dismiss' | 'discipline';
export type FaqStatus = 'published' | 'hidden';
export type RequesterRole = 'learner' | 'instructor';

export interface Attachment { name: string; kind: 'image' | 'pdf' | 'document'; url?: string; }
export interface EmailReplyMetadata { to: string; cc: string[]; bcc: string[]; subject: string; }
export interface ThreadMessage { id: string; sender: string; role: 'learner' | 'agent' | 'system'; sentAt: string; body: string; attachments: Attachment[]; source?: 'web' | 'email' | 'internal'; internalOnly?: boolean; emailMetadata?: EmailReplyMetadata; }
export interface SupportTicket {
  id: string; learner: string; requesterRole: RequesterRole; email: string; phone: string; topic: string; summary: string;
  priority: Priority; status: TicketStatus; createdAt: string; dueAt: string; assignee?: string;
  assigneeId?: string; lessonCode?: string;
  attachments: Attachment[]; thread: ThreadMessage[]; resolvedAt?: string; linkedComplaintId?: string;
  reopenedAt?: string; emailSyncStatus?: EmailSyncStatus; emailSyncError?: string; lastEmailSyncAt?: string;
  resolutionCategory?: ResolutionCategory; internalResolutionNote?: string; sendCsat?: boolean;
}
export interface ComplaintCase {
  id: string; sourceTicketId?: string; claimant: string; respondent: string; type: string; status: ComplaintStatus;
  disputeGroup?: string; customDisputeType?: string; customClassificationReason?: string;
  amount: number; createdAt: string; dueAt: string; risk: 'standard' | 'high'; evidence: Attachment[];
  learnerStatement: string; instructorStatement?: string; course: string; orderId: string; purchasedAt: string;
  progress: number; refundEligibleUntil: string; conclusion?: string;
  sourceThread?: ThreadMessage[];
  resolution?: {
    type: ComplaintDecisionType; decidedAt: string; decidedBy: string; summary: string;
    refundMode?: 'full' | 'partial'; refundAmount?: number; instructorShare?: number; platformShare?: number;
    revokeAccess?: boolean; revokeCertificate?: boolean;
    dismissalBasis?: string; giftVoucher?: boolean; sanctions?: string[];
  };
}
export interface FaqItem {
  id: string; question: string; answer: string; category: string; keywords: string[];
  views: number; order: number; status: FaqStatus; updatedAt: string;
}
export interface FailedSearch { keyword: string; count: number; suggestedCategory: string; }
export interface StaffMember { id: string; name: string; team: string; active: boolean; openTickets: number; }
export interface PendingOperation { id: string; type: string; referenceId: string; requestedAt: string; payload: Readonly<Record<string, unknown>>; }
export type ReplyTemplateCategory = 'technical' | 'account' | 'payment';
export interface ReplyTemplate { id: string; title: string; description: string; category: ReplyTemplateCategory; body: string; keywords: string[]; }
