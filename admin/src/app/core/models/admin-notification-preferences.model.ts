/** Browser-local notification and report preferences from the BA settings design. */

export type AdminReportFrequency = 'daily' | 'weekly' | 'monthly';
export type AdminReportFormat = 'xlsx' | 'pdf';

export interface AdminNotificationPreferences {
  /** Tab 3 — platform incident alerts. */
  emergencyAlerts: boolean;
  /** Tab 3 — scheduled email summary. */
  emailReportEnabled: boolean;
  emailReportFrequency: AdminReportFrequency;
  emailReportFormat: AdminReportFormat;
  /** Tab 4 — SLA reminder switches. */
  slaCoursePending: boolean;
  slaTicketOverdue: boolean;
}

export const DEFAULT_ADMIN_NOTIFICATION_PREFERENCES: AdminNotificationPreferences = {
  emergencyAlerts: true,
  emailReportEnabled: false,
  emailReportFrequency: 'weekly',
  emailReportFormat: 'xlsx',
  slaCoursePending: true,
  slaTicketOverdue: true
};
