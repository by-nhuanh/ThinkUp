import { ComplaintCase, FailedSearch, FaqItem, StaffMember, SupportTicket } from '../../../features/support/models/support.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu minh họa khi backend bàn giao API Quản lý Hỗ trợ đã xác minh contract.
const now = Date.now();
const hours = (value: number) => new Date(now + value * 3_600_000).toISOString();
const daysAgo = (value: number) => new Date(now - value * 86_400_000).toISOString();

export const SUPPORT_TOPICS = ['Khiếu nại Chất lượng và Giảng viên', 'Khiếu nại Thanh toán và Hoàn tiền', 'Lỗi kỹ thuật và Coding Lab', 'Tài khoản và Bảo mật', 'Tư vấn Lộ trình và Khóa học', 'Góp ý và Vấn đề khác'] as const;
export const FAQ_CATEGORIES = ['Tài khoản và Bảo mật', 'Thanh toán và Hóa đơn', 'Khóa học và Học tập', 'Chứng chỉ', 'Kỹ thuật và Ứng dụng', 'Chính sách và Điều khoản', 'Khác'] as const;

export const MOCK_STAFF: StaffMember[] = [
  { id: 'st-1', name: 'Gia Huy', team: 'Đội Kỹ thuật và Coding Lab', active: true, openTickets: 1 },
  { id: 'st-2', name: 'Lê Văn C', team: 'Đội Kỹ thuật và Coding Lab', active: true, openTickets: 3 },
  { id: 'st-3', name: 'Minh Anh', team: 'Đội Chăm sóc học viên', active: true, openTickets: 2 },
  { id: 'st-4', name: 'Thanh Hà', team: 'Đội Thanh toán', active: true, openTickets: 4 },
  { id: 'st-5', name: 'Quang Minh', team: 'Đội Đào tạo và Giảng viên', active: true, openTickets: 2 },
  { id: 'st-6', name: 'Hải Đăng', team: 'Ban Quản lý Cấp cao / Trưởng ca', active: true, openTickets: 1 },
  { id: 'st-6', name: 'Thu Trang', team: 'Ban Quản lý Cấp cao / Trưởng ca', active: true, openTickets: 1 },
  { id: 'st-7', name: 'Tài khoản đã khóa', team: 'Đội Kỹ thuật và Coding Lab', active: false, openTickets: 0 }
];

export const MOCK_TICKETS: SupportTicket[] = [
  { id: 'TK-2026-1042', learner: 'Nguyễn Văn An', email: 'an.nguyen@example.com', phone: '0901 234 567', topic: SUPPORT_TOPICS[2], summary: 'Coding Lab báo Syntax Error dù đoạn mã đã khớp với hướng dẫn của bài học.', priority: 'high', status: 'processing', createdAt: daysAgo(1), dueAt: hours(-2), assignee: 'Gia Huy', attachments: [{ name: 'coding-lab-error.png', kind: 'image' }, { name: 'source-code.pdf', kind: 'pdf' }], thread: [
    { id: 'm1', sender: 'Nguyễn Văn An', role: 'learner', sentAt: daysAgo(1), body: 'Tôi không thể chạy bài Python số 5. Coding Lab liên tục báo Syntax Error dù đã kiểm tra lại cú pháp và sao chép đúng đoạn mã trong bài.', attachments: [] },
    { id: 'm2', sender: 'Gia Huy', role: 'agent', sentAt: hours(-18), body: 'Mình đã nhận yêu cầu. Bạn vui lòng gửi ảnh toàn bộ màn hình và tệp mã nguồn để đội kỹ thuật đối chiếu.', attachments: [] },
    { id: 'm3', sender: 'Nguyễn Văn An', role: 'learner', sentAt: hours(-15), body: 'Tôi gửi kèm ảnh lỗi và tệp mã nguồn. Lỗi xuất hiện sau khi nhấn Chạy thử.', attachments: [{ name: 'coding-lab-error.png', kind: 'image' }, { name: 'source-code.pdf', kind: 'pdf' }] }
  ]},
  { id: 'TK-2026-1041', learner: 'Trần Ngọc Mai', email: 'mai.tran@example.com', phone: '0912 334 455', topic: SUPPORT_TOPICS[1], summary: 'Đã thanh toán nhưng khóa học chưa được mở trong tài khoản.', priority: 'high', status: 'unassigned', createdAt: hours(-5), dueAt: hours(19), attachments: [{ name: 'bien-lai.pdf', kind: 'pdf' }], thread: [{ id: 'm4', sender: 'Trần Ngọc Mai', role: 'learner', sentAt: hours(-5), body: 'Tôi đã thanh toán đơn hàng nhưng vẫn chưa truy cập được khóa học. Nhờ kiểm tra giúp.', attachments: [{ name: 'bien-lai.pdf', kind: 'pdf' }] }] },
  { id: 'TK-2026-1039', learner: 'Phạm Quốc Bảo', email: 'bao.pham@example.com', phone: '0988 771 122', topic: SUPPORT_TOPICS[3], summary: 'Không nhận được mã xác thực khi đăng nhập trên thiết bị mới.', priority: 'medium', status: 'reopened', createdAt: hours(-12), dueAt: hours(12), assignee: 'Minh Anh', reopenedAt: hours(-1), emailSyncStatus: 'synced', lastEmailSyncAt: hours(-1), attachments: [], thread: [{ id: 'm5', sender: 'Phạm Quốc Bảo', role: 'learner', sentAt: hours(-12), body: 'Tôi chưa nhận được mã xác thực qua email.', attachments: [] }, { id: 'm5-email', sender: 'Phạm Quốc Bảo', role: 'learner', source: 'email', sentAt: hours(-1), body: 'Tôi đã thử lại nhưng vẫn chưa nhận được mã. Nhờ ThinkUp tiếp tục kiểm tra.', attachments: [] }] },
  { id: 'TK-2026-1032', learner: 'Lê Hoàng Nam', email: 'nam.le@example.com', phone: '0933 556 778', topic: SUPPORT_TOPICS[0], summary: 'Nội dung khóa học khác với mô tả và giảng viên chưa phản hồi.', priority: 'high', status: 'processing', createdAt: daysAgo(2), dueAt: hours(-20), assignee: 'Lê Văn C', attachments: [{ name: 'mo-ta-khoa-hoc.png', kind: 'image' }], thread: [{ id: 'm6', sender: 'Lê Hoàng Nam', role: 'learner', sentAt: daysAgo(2), body: 'Nội dung nhận được khác phần mô tả khi mua khóa học.', attachments: [{ name: 'mo-ta-khoa-hoc.png', kind: 'image' }] }] },
  { id: 'TK-2026-1028', learner: 'Vũ Thanh Vy', email: 'vy.vu@example.com', phone: '0977 112 233', topic: SUPPORT_TOPICS[4], summary: 'Cần tư vấn lộ trình chuyển từ thiết kế sang Frontend.', priority: 'low', status: 'closed', createdAt: daysAgo(3), dueAt: daysAgo(2), assignee: 'Minh Anh', resolvedAt: new Date().toISOString(), attachments: [], thread: [{ id: 'm7', sender: 'Vũ Thanh Vy', role: 'learner', sentAt: daysAgo(3), body: 'Tôi cần được tư vấn lộ trình học Frontend.', attachments: [] }] },
  ...Array.from({ length: 25 }, (_, index): SupportTicket => {
    const names = ['Đặng Minh Khôi', 'Bùi Phương Linh', 'Hoàng Gia Bảo', 'Nguyễn Thảo Nhi', 'Trần Đức Anh', 'Phạm Mai Chi', 'Lê Nhật Minh', 'Võ Hải Yến', 'Đỗ Thành Công', 'Ngô Quỳnh Anh'];
    const summaries = [
      'Không truy cập được bài kiểm tra cuối chương dù đã hoàn thành toàn bộ video.',
      'Thanh toán bị trừ tiền hai lần và cần kiểm tra lịch sử giao dịch.',
      'Video bài giảng bị đứng hình khi xem ở chất lượng cao.',
      'Muốn thay đổi email đăng nhập nhưng không nhận được mã xác thực.',
      'Cần tư vấn khóa học tiếp theo sau khi hoàn thành lộ trình hiện tại.',
      'Giảng viên chưa phản hồi câu hỏi trong khu vực thảo luận.',
      'Coding Lab không lưu kết quả sau khi nộp bài thực hành.',
      'Không tải được chứng chỉ dù đã đáp ứng điều kiện hoàn thành.',
      'Voucher hợp lệ nhưng không áp dụng được tại bước thanh toán.',
      'Muốn góp ý về phụ đề và tốc độ phát của video bài giảng.'
    ];
    const statuses = ['unassigned', 'processing', 'waiting', 'closed'] as const;
    const priorities = ['high', 'medium', 'low'] as const;
    const assignees = ['Gia Huy', 'Lê Văn C', 'Minh Anh', 'Thanh Hà'];
    const learner = names[index % names.length];
    const status = statuses[index % statuses.length];
    const createdHoursAgo = 3 + index * 3;
    const isOverdue = status !== 'closed' && index % 6 === 0;
    const attachments = index === 24
      ? [{ name: 'anh-noi-dung-khoa-hoc.png', kind: 'image' as const }]
      : index % 3 === 0
      ? [{ name: `minh-chung-${index + 1}.png`, kind: 'image' as const }]
      : index % 4 === 0
        ? [{ name: `tai-lieu-${index + 1}.pdf`, kind: 'pdf' as const }]
        : [];
    // TODO(pre-deploy): Nhớ xóa chuỗi hội thoại mẫu và lấy lịch sử trao đổi thật từ API ticket detail.
    const thread = index === 24 ? [
      {
        id: 'mock-ticket-1003-learner-1',
        sender: 'Trần Đức Anh',
        role: 'learner' as const,
        sentAt: hours(-75),
        body: 'Em đăng ký khóa học vì phần giới thiệu có chuyên đề xây dựng Design System và prototype nâng cao, nhưng trong nội dung hiện tại chưa có các bài này. Em cũng đã đặt câu hỏi trong khu vực thảo luận hơn ba ngày nhưng chưa nhận được phản hồi từ giảng viên. Mong ThinkUp kiểm tra và hỗ trợ.',
        attachments: [{ name: 'anh-noi-dung-khoa-hoc.png', kind: 'image' as const }]
      },
      {
        id: 'mock-ticket-1003-system',
        sender: 'Hệ thống',
        role: 'system' as const,
        sentAt: hours(-74.98),
        body: 'Ticket đã được tạo và phân loại vào nhóm Khiếu nại Chất lượng và Giảng viên.',
        attachments: []
      },
      {
        id: 'mock-ticket-1003-agent',
        sender: 'Nguyễn Minh Vy',
        role: 'agent' as const,
        sentAt: hours(-68),
        body: 'Đã ghi nhận phản ánh của học viên. Chuyển bộ phận nội dung đối chiếu đề cương đã công bố, danh sách bài học đang phát hành và lịch sử phản hồi của giảng viên trong khu vực thảo luận.',
        attachments: []
      },
      {
        id: 'mock-ticket-1003-learner-2',
        sender: 'Trần Đức Anh',
        role: 'learner' as const,
        sentAt: hours(-51),
        body: 'Em bổ sung ảnh chụp đề cương trên trang giới thiệu khóa học và video quay màn hình danh sách bài học hiện có để ThinkUp đối chiếu.',
        attachments: [
          { name: 'de-cuong-khoa-hoc.png', kind: 'image' as const },
          { name: 'danh-sach-bai-hoc-hien-tai.mp4', kind: 'document' as const }
        ]
      }
    ] : [{
      id: `mock-message-${index + 8}`,
      sender: learner,
      role: 'learner' as const,
      sentAt: hours(-createdHoursAgo),
      body: summaries[index % summaries.length],
      attachments
    }];
    return {
      id: `TK-2026-${String(1027 - index).padStart(4, '0')}`,
      learner,
      email: `hocvien${index + 1}@example.com`,
      phone: `09${String(10000000 + index * 7919).slice(-8)}`,
      topic: SUPPORT_TOPICS[index % SUPPORT_TOPICS.length],
      summary: index === 24
        ? 'Nội dung khóa học thiếu chuyên đề đã công bố và giảng viên chưa phản hồi câu hỏi trong khu vực thảo luận.'
        : summaries[index % summaries.length],
      priority: index === 0 ? 'medium' : priorities[index % priorities.length],
      status,
      createdAt: hours(-createdHoursAgo),
      dueAt: hours(isOverdue ? -(2 + index) : Math.max(2, 24 - createdHoursAgo)),
      assignee: status === 'unassigned' ? undefined : assignees[index % assignees.length],
      resolvedAt: status === 'closed' ? hours(-(index % 8)) : undefined,
      attachments,
      thread
    };
  })
];

export const MOCK_COMPLAINTS: ComplaintCase[] = [
  { id: 'KN-2026-0318', sourceTicketId: 'TK-2026-1032', claimant: 'Lê Hoàng Nam', respondent: 'Giảng viên Trần Minh', type: 'Chất lượng khóa học', status: 'ready', amount: 6_900_000, createdAt: daysAgo(2), dueAt: hours(1), risk: 'high', evidence: [{ name: 'mo-ta-khoa-hoc.png', kind: 'image' }, { name: 'noi-dung-thuc-te.pdf', kind: 'pdf' }], learnerStatement: 'Khóa học thiếu các nội dung cam kết và giảng viên không phản hồi trong thời hạn hỗ trợ.', instructorStatement: 'Tôi đã cập nhật các bài còn thiếu và gửi kế hoạch bổ sung.', course: 'Frontend Chuyên sâu', orderId: 'ORD-230918', purchasedAt: daysAgo(5), progress: 18, refundEligibleUntil: hours(48) },
  { id: 'KN-2026-0317', claimant: 'Đỗ Thu Trang', respondent: 'Giảng viên Nguyễn Long', type: 'Hoàn tiền', status: 'waiting_instructor', amount: 1_800_000, createdAt: daysAgo(1), dueAt: hours(8), risk: 'standard', evidence: [{ name: 'hoa-don.pdf', kind: 'pdf' }], learnerStatement: 'Nội dung không phù hợp trình độ được tư vấn.', course: 'Data Analytics Cơ bản', orderId: 'ORD-230901', purchasedAt: daysAgo(4), progress: 8, refundEligibleUntil: hours(72) },
  { id: 'KN-2026-0311', claimant: 'Ngô Hải Yến', respondent: 'Giảng viên Phạm Đức', type: 'Gian lận nội dung', status: 'reviewing', amount: 3_200_000, createdAt: daysAgo(4), dueAt: hours(-4), risk: 'high', evidence: [{ name: 'doi-chieu-noi-dung.pdf', kind: 'pdf' }], learnerStatement: 'Nội dung bài giảng có dấu hiệu sao chép.', instructorStatement: 'Tôi xác nhận nội dung được biên soạn từ tài liệu chuyên ngành và đề nghị đối chiếu chi tiết từng bài học trước khi kết luận.', course: 'UI Design Mastery', orderId: 'ORD-220811', purchasedAt: daysAgo(6), progress: 45, refundEligibleUntil: hours(12) }
];

export const MOCK_FAQS: FaqItem[] = [
  { id: 'FAQ-101', question: 'Làm thế nào để đổi mật khẩu tài khoản?', answer: 'Mở Cài đặt tài khoản, chọn Bảo mật, sau đó chọn Đổi mật khẩu và làm theo hướng dẫn xác thực.', category: FAQ_CATEGORIES[0], keywords: ['đổi mật khẩu', 'bảo mật'], views: 2840, order: 1, status: 'published', updatedAt: daysAgo(1) },
  { id: 'FAQ-102', question: 'Tôi có thể yêu cầu xuất hóa đơn khi nào?', answer: 'Bạn có thể yêu cầu xuất hóa đơn trong phần chi tiết đơn hàng sau khi thanh toán thành công.', category: FAQ_CATEGORIES[1], keywords: ['hóa đơn', 'thanh toán'], views: 1650, order: 1, status: 'published', updatedAt: daysAgo(2) },
  { id: 'FAQ-103', question: 'Điều kiện để nhận chứng chỉ hoàn thành là gì?', answer: 'Hoàn thành các nội dung bắt buộc và đạt mức điểm tối thiểu được công bố trong khóa học.', category: FAQ_CATEGORIES[3], keywords: ['chứng chỉ', 'hoàn thành'], views: 930, order: 1, status: 'hidden', updatedAt: daysAgo(3) },
  { id: 'FAQ-104', question: 'Ứng dụng không phát video bài giảng', answer: 'Kiểm tra kết nối mạng, cập nhật ứng dụng và thử xóa bộ nhớ đệm trước khi gửi yêu cầu hỗ trợ.', category: FAQ_CATEGORIES[4], keywords: ['video', 'ứng dụng', 'lỗi'], views: 710, order: 2, status: 'hidden', updatedAt: daysAgo(5) }
];

export const MOCK_FAILED_SEARCHES: FailedSearch[] = [
  { keyword: 'đổi email đăng nhập', count: 48, suggestedCategory: FAQ_CATEGORIES[0] },
  { keyword: 'hoàn tiền qua momo', count: 31, suggestedCategory: FAQ_CATEGORIES[1] },
  { keyword: 'tải chứng chỉ bản cứng', count: 19, suggestedCategory: FAQ_CATEGORIES[3] }
];
