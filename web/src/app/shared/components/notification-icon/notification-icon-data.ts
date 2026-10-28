/**
 * Hình học icon Lucide (24px, stroke) cho từng loại thông báo, chép từ @lucide/angular 1.54.0.
 * Không import runtime của thư viện icon ở đây: popover trên header nằm trong bundle đầu tiên,
 * và chỉ cần một import lucide là toàn bộ thư viện icon bị kéo vào bundle đó.
 */
import { NotificationKind } from '../../../core/models/notification.model';

export type NotificationIconTag = 'path' | 'circle' | 'ellipse' | 'rect' | 'line';

export interface NotificationIconNode {
  tag: NotificationIconTag;
  d?: string;
  cx?: string;
  cy?: string;
  r?: string;
  rx?: string;
  ry?: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  x1?: string;
  x2?: string;
  y1?: string;
  y2?: string;
}

export const NOTIFICATION_ICON_NODES: Readonly<Record<NotificationKind, readonly NotificationIconNode[]>> = {
  'progress': [
    { tag: 'path', d: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2' },
    { tag: 'path', d: 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2' },
    { tag: 'path', d: 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3' },
    { tag: 'path', d: 'M4 22h16' },
    { tag: 'path', d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z' },
    { tag: 'path', d: 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3' },
  ],
  'milestone': [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'path', d: 'M12 6v6l4 2' },
  ],
  'reminder': [
    { tag: 'path', d: 'M10.268 21a2 2 0 0 0 3.464 0' },
    { tag: 'path', d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326' },
  ],
  'quiz': [
    { tag: 'path', d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' },
    { tag: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { tag: 'path', d: 'M10 9H8' },
    { tag: 'path', d: 'M16 13H8' },
    { tag: 'path', d: 'M16 17H8' },
  ],
  'certificate': [
    { tag: 'path', d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526' },
    { tag: 'circle', cx: '12', cy: '8', r: '6' },
  ],
  'course-update': [
    { tag: 'path', d: 'M12 5v16' },
    { tag: 'path', d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z' },
  ],
  'achievement': [
    { tag: 'path', d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528' },
  ],
  'purchase': [
    { tag: 'path', d: 'm2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18' },
    { tag: 'path', d: 'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25' },
    { tag: 'circle', cx: '18', cy: '20', r: '2' },
    { tag: 'circle', cx: '8', cy: '20', r: '2' },
  ],
  'payment': [
    { tag: 'rect', rx: '2', x: '2', y: '5', width: '20', height: '14' },
    { tag: 'line', x1: '2', x2: '22', y1: '10', y2: '10' },
    { tag: 'path', d: 'M6 14h2' },
  ],
  'promotion': [
    { tag: 'line', x1: '19', x2: '5', y1: '5', y2: '19' },
    { tag: 'circle', cx: '6.5', cy: '6.5', r: '2.5' },
    { tag: 'circle', cx: '17.5', cy: '17.5', r: '2.5' },
  ],
  'voucher': [
    { tag: 'path', d: 'M12 7v14' },
    { tag: 'path', d: 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8' },
    { tag: 'path', d: 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5' },
    { tag: 'rect', rx: '1', x: '3', y: '7', width: '18', height: '4' },
  ],
  'refund': [
    { tag: 'path', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
    { tag: 'path', d: 'M3 3v5h5' },
  ],
  'login': [
    { tag: 'path', d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
  ],
  'password': [
    { tag: 'circle', cx: '12', cy: '12', r: '10' },
    { tag: 'path', d: 'm16 9-5.5 5.5L8 12' },
  ],
  'email': [
    { tag: 'path', d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' },
    { tag: 'rect', rx: '2', x: '2', y: '4', width: '20', height: '16' },
  ],
  'system': [
    { tag: 'path', d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' },
    { tag: 'circle', cx: '12', cy: '12', r: '3' },
  ],
  'alert': [
    { tag: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { tag: 'path', d: 'M12 9v4' },
    { tag: 'path', d: 'M12 17h.01' },
  ],
  'backup': [
    { tag: 'ellipse', cx: '12', cy: '5', rx: '9', ry: '3' },
    { tag: 'path', d: 'M3 12a9 3 0 0 0 5 2.69' },
    { tag: 'path', d: 'M21 9.3V5' },
    { tag: 'path', d: 'M3 5v14a9 3 0 0 0 6.47 2.88' },
    { tag: 'path', d: 'M12 12v4h4' },
    { tag: 'path', d: 'M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16' },
  ],
};
