import { ComplaintCase, FailedSearch, FaqItem, ReplyTemplate, StaffMember, SupportTicket } from '../../../features/support/models/support.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu minh họa khi backend bàn giao API Quản lý Hỗ trợ đã xác minh contract.
const now = Date.now();
const hours = (value: number) => new Date(now + value * 3_600_000).toISOString();
const daysAgo = (value: number) => new Date(now - value * 86_400_000).toISOString();

export const SUPPORT_TOPICS = ['Khiếu nại Chất lượng và Giảng viên', 'Khiếu nại Thanh toán và Hoàn tiền', 'Lỗi kỹ thuật và Coding Lab', 'Tài khoản và Bảo mật', 'Tư vấn Lộ trình và Khóa học', 'Góp ý và Vấn đề khác'] as const;
export const FAQ_CATEGORIES = ['Tài khoản và Bảo mật', 'Thanh toán và Hóa đơn', 'Khóa học và Học tập', 'Chứng chỉ', 'Kỹ thuật và Ứng dụng', 'Chính sách và Điều khoản', 'Khác'] as const;

// TODO(pre-deploy): Nhớ xóa thư viện mẫu này và tải mẫu được phân quyền từ API cơ sở tri thức nội bộ.
export const MOCK_REPLY_TEMPLATES: ReplyTemplate[] = [
  { id: 'TPL-TECH-01', title: 'Yêu cầu ảnh chụp và đoạn code', description: 'Thu thập đủ minh chứng để tái hiện lỗi', category: 'technical', keywords: ['ảnh chụp', 'đoạn code', 'minh chứng', 'syntax'], body: 'Chào {Tên học viên},\n\nBạn vui lòng bổ sung giúp ThinkUp:\n- Ảnh chụp toàn bộ màn hình có thông báo lỗi;\n- Mã bài học {Mã bài học};\n- Đoạn code đang chạy và các bước dẫn đến lỗi.\n\nSau khi nhận đủ thông tin, đội kỹ thuật sẽ tái hiện và phản hồi hướng xử lý sớm nhất.' },
  { id: 'TPL-TECH-02', title: 'Kiểm tra lỗi SyntaxError', description: 'Các bước kiểm tra cú pháp Python cơ bản', category: 'technical', keywords: ['syntaxerror', 'python', 'cú pháp', 'thụt lề'], body: 'Chào {Tên học viên},\n\nVới bài {Mã bài học}, bạn vui lòng kiểm tra dấu hai chấm, cặp dấu ngoặc, dấu nháy và mức thụt lề. Sau đó hãy chạy từng khối lệnh để xác định dòng phát sinh lỗi.\n\nNếu lỗi vẫn còn, bạn gửi lại ảnh thông báo cùng đoạn code để ThinkUp kiểm tra tiếp nhé.' },
  { id: 'TPL-TECH-03', title: 'Khởi tạo lại Coding Lab', description: 'Xử lý Lab treo hoặc không lưu kết quả', category: 'technical', keywords: ['coding lab', 'reset', 'không lưu', 'treo'], body: 'Chào {Tên học viên},\n\nBạn hãy sao lưu đoạn code hiện tại, chọn “Khởi tạo lại môi trường Lab” và mở lại bài {Mã bài học}. Sau khi môi trường tải xong, dán lại code và chạy thử từng phần. Thao tác này không ảnh hưởng đến tiến độ học đã ghi nhận.' },
  { id: 'TPL-TECH-04', title: 'Kiểm tra lỗi phát video', description: 'Loại trừ lỗi trình duyệt và kết nối mạng', category: 'technical', keywords: ['video', 'đứng hình', 'không phát', 'trình duyệt'], body: 'Chào {Tên học viên},\n\nBạn vui lòng tải lại trang, chuyển chất lượng video xuống 720p và thử bằng cửa sổ ẩn danh. Nếu đang dùng tiện ích chặn quảng cáo, hãy tạm tắt tiện ích cho ThinkUp. Nếu lỗi vẫn còn, bạn gửi tên bài học, trình duyệt và thời điểm xảy ra lỗi để đội kỹ thuật đối chiếu log.' },
  { id: 'TPL-TECH-05', title: 'Đã chuyển đội kỹ thuật', description: 'Xác nhận sự cố đang được điều tra', category: 'technical', keywords: ['đã tiếp nhận', 'điều tra', 'kỹ thuật', 'sla'], body: 'Chào {Tên học viên},\n\nThinkUp đã tiếp nhận đầy đủ thông tin và chuyển sự cố sang đội kỹ thuật. Ticket vẫn được giữ mở trong thời gian kiểm tra. Chúng tôi sẽ cập nhật kết quả ngay khi có thông tin mới; bạn không cần tạo thêm yêu cầu trùng lặp.' },
  { id: 'TPL-ACC-01', title: 'Xác minh tài khoản đăng nhập', description: 'Thu thập thông tin trước khi kiểm tra', category: 'account', keywords: ['đăng nhập', 'email', 'xác minh', 'tài khoản'], body: 'Chào {Tên học viên},\n\nĐể kiểm tra đúng tài khoản, bạn vui lòng xác nhận email đăng nhập, thời điểm truy cập thành công gần nhất và thiết bị đang sử dụng. Vì lý do bảo mật, vui lòng không gửi mật khẩu hoặc mã OTP qua ticket.' },
  { id: 'TPL-ACC-02', title: 'Không nhận được mã OTP', description: 'Hướng dẫn kiểm tra email xác thực', category: 'account', keywords: ['otp', 'mã xác thực', 'spam', 'email'], body: 'Chào {Tên học viên},\n\nBạn vui lòng kiểm tra thư mục Spam/Quảng cáo và tìm email từ ThinkUp. Mỗi mã OTP chỉ có hiệu lực trong thời gian ngắn; hãy yêu cầu mã mới và sử dụng mã gần nhất. Nếu sau 10 phút vẫn chưa nhận được, hãy phản hồi để ThinkUp kiểm tra nhật ký gửi thư.' },
  { id: 'TPL-ACC-03', title: 'Hướng dẫn đặt lại mật khẩu', description: 'Khôi phục quyền truy cập an toàn', category: 'account', keywords: ['quên mật khẩu', 'đặt lại', 'khôi phục'], body: 'Chào {Tên học viên},\n\nBạn chọn “Quên mật khẩu” tại màn hình đăng nhập, nhập đúng email tài khoản và mở liên kết đặt lại mật khẩu trong email mới nhất. Mật khẩu mới nên khác mật khẩu cũ và không dùng lại mật khẩu của dịch vụ khác.' },
  { id: 'TPL-ACC-04', title: 'Yêu cầu thay đổi email', description: 'Xác minh chủ tài khoản trước khi thay đổi', category: 'account', keywords: ['đổi email', 'email đăng nhập', 'chủ tài khoản'], body: 'Chào {Tên học viên},\n\nĐể hỗ trợ đổi email đăng nhập, bạn vui lòng cung cấp email hiện tại, email muốn thay đổi và mã đơn hàng gần nhất. Không gửi ảnh giấy tờ tùy thân khi chưa được nhân viên hướng dẫn qua kênh bảo mật.' },
  { id: 'TPL-ACC-05', title: 'Tài khoản đã được mở lại', description: 'Thông báo hoàn tất khôi phục tài khoản', category: 'account', keywords: ['mở khóa', 'khôi phục', 'hoàn tất'], body: 'Chào {Tên học viên},\n\nThinkUp đã hoàn tất kiểm tra và mở lại quyền truy cập tài khoản. Bạn vui lòng đăng nhập lại trên thiết bị tin cậy và đổi mật khẩu nếu hệ thống yêu cầu. Nếu vẫn gặp lỗi, hãy phản hồi trực tiếp trong ticket này.' },
  { id: 'TPL-PAY-01', title: 'Yêu cầu thông tin đối soát', description: 'Thu thập mã giao dịch và biên lai', category: 'payment', keywords: ['đối soát', 'mã giao dịch', 'biên lai', 'thanh toán'], body: 'Chào {Tên học viên},\n\nBạn vui lòng gửi mã đơn hàng, mã giao dịch, phương thức thanh toán và ảnh biên lai có thời gian giao dịch. Hãy che số dư và thông tin không liên quan trước khi gửi. ThinkUp sẽ đối soát với cổng thanh toán sau khi nhận đủ dữ liệu.' },
  { id: 'TPL-PAY-02', title: 'Đã trả tiền nhưng chưa có khóa học', description: 'Kiểm tra đơn và quyền truy cập', category: 'payment', keywords: ['chưa mở khóa học', 'đã trừ tiền', 'đơn hàng'], body: 'Chào {Tên học viên},\n\nThinkUp đã ghi nhận trường hợp thanh toán thành công nhưng khóa học chưa được kích hoạt. Bạn vui lòng không thanh toán lại. Hãy gửi mã đơn hàng và ảnh biên lai để chúng tôi kiểm tra trạng thái giao dịch.' },
  { id: 'TPL-PAY-03', title: 'Giao dịch bị trừ tiền hai lần', description: 'Tiếp nhận trường hợp thanh toán trùng', category: 'payment', keywords: ['trừ tiền hai lần', 'giao dịch trùng', 'hoàn tiền'], body: 'Chào {Tên học viên},\n\nBạn vui lòng gửi hai mã giao dịch và sao kê thể hiện hai khoản thanh toán. ThinkUp sẽ đối chiếu với cổng thanh toán; nếu xác nhận giao dịch trùng, khoản tiền dư sẽ được xử lý theo phương thức thanh toán ban đầu.' },
  { id: 'TPL-PAY-04', title: 'Thông báo thời gian hoàn tiền', description: 'Giải thích quy trình và thời gian dự kiến', category: 'payment', keywords: ['hoàn tiền', 'thời gian xử lý', 'ngân hàng'], body: 'Chào {Tên học viên},\n\nYêu cầu hoàn tiền đã được tiếp nhận để kiểm tra điều kiện. Sau khi được phê duyệt, thời gian tiền về phụ thuộc vào ngân hàng hoặc ví điện tử. ThinkUp sẽ cập nhật mã đối soát khi giao dịch hoàn tiền được khởi tạo.' },
  { id: 'TPL-PAY-05', title: 'Hướng dẫn yêu cầu xuất hóa đơn', description: 'Thu thập thông tin xuất hóa đơn', category: 'payment', keywords: ['hóa đơn', 'xuất hóa đơn', 'mã số thuế'], body: 'Chào {Tên học viên},\n\nBạn vui lòng cung cấp tên đơn vị, mã số thuế, địa chỉ, email nhận hóa đơn và mã đơn hàng. Hãy kiểm tra kỹ thông tin trước khi gửi vì hóa đơn đã phát hành có thể cần quy trình điều chỉnh riêng.' }
];

const STAFF_NAMES_BY_TEAM: ReadonlyArray<{ team: string; names: ReadonlyArray<string> }> = [
  { team: 'Đội Kỹ thuật và Coding Lab', names: ['Gia Huy', 'Lê Văn C', 'Đức Long', 'Hoàng Minh Tuấn', 'Trần Quốc Khánh', 'Nguyễn Hải Nam', 'Phạm Anh Khoa', 'Võ Minh Nhật', 'Đỗ Thành Đạt', 'Bùi Quang Huy', 'Lâm Tuấn Anh', 'Ngô Đức Thịnh', 'Trịnh Minh Hoàng', 'Đặng Quốc Việt', 'Mai Nhật Tân', 'Cao Hữu Phước', 'Lý Minh Trí', 'Tạ Thanh Tùng', 'Dương Gia Bảo', 'Chu Anh Dũng'] },
  { team: 'Đội Thanh toán', names: ['Thanh Hà', 'Ngọc Hân', 'Trần Thu Uyên', 'Nguyễn Mỹ Linh', 'Lê Hoài Thương', 'Phạm Ngọc Mai', 'Võ Thanh Trúc', 'Đỗ Minh Châu', 'Bùi Khánh An', 'Hoàng Diệu Anh', 'Ngô Phương Thảo', 'Đặng Hải Yến', 'Trịnh Kim Ngân', 'Mai Anh Thư', 'Lâm Bảo Ngọc', 'Cao Thanh Tâm', 'Lý Quỳnh Trang', 'Tạ Minh Hằng', 'Dương Thu Hà', 'Chu Ngọc Ánh'] },
  { team: 'Đội Chăm sóc học viên', names: ['Minh Anh', 'Bảo Trân', 'Nguyễn Thùy Dương', 'Trần Phương Nhi', 'Lê Ngọc Anh', 'Phạm Tú Uyên', 'Võ Khánh Vy', 'Đỗ Hà My', 'Bùi Gia Linh', 'Hoàng Thanh Vân', 'Ngô Thảo Nhi', 'Đặng Minh Châu', 'Trịnh Hồng Nhung', 'Mai Phương Anh', 'Lâm Thu Hiền', 'Cao Ngọc Trâm', 'Lý Ánh Dương', 'Tạ Bích Ngọc', 'Dương Thanh Thảo', 'Chu Khánh Hòa'] },
  { team: 'Đội Đào tạo và Giảng viên', names: ['Quang Minh', 'Khánh Linh', 'Nguyễn Đức Anh', 'Trần Minh Phương', 'Lê Hoàng Long', 'Phạm Thu Trang', 'Võ Anh Thư', 'Đỗ Quốc Bảo', 'Bùi Minh Tâm', 'Hoàng Gia Hân', 'Ngô Tuấn Kiệt', 'Đặng Phương Linh', 'Trịnh Quang Vinh', 'Mai Thanh Bình', 'Lâm Minh Ngọc', 'Cao Hoài Nam', 'Lý Khánh Chi', 'Tạ Đức Huy', 'Dương Bảo Châu', 'Chu Minh Khang'] },
  { team: 'Ban Quản lý Cấp cao / Trưởng ca', names: ['Hải Đăng', 'Thu Trang', 'Tuấn Kiệt', 'Nguyễn Thành Công', 'Trần Quỳnh Anh', 'Lê Minh Đức', 'Phạm Hoàng Yến', 'Võ Quốc Trung', 'Đỗ Thanh Hương', 'Bùi Anh Tuấn', 'Hoàng Minh Tài', 'Ngô Thu Thủy', 'Đặng Quốc Cường', 'Trịnh Bảo Anh', 'Mai Đức Long', 'Lâm Hải Anh', 'Cao Minh Thư', 'Lý Thành Nam', 'Tạ Ngọc Hà', 'Dương Quang Khải'] }
];

// TODO(pre-deploy): Nhớ xóa danh sách 100 nhân sự minh họa và lấy nhân sự theo bộ phận từ API phân quyền Admin.
export const MOCK_STAFF: StaffMember[] = STAFF_NAMES_BY_TEAM.flatMap((group, teamIndex) =>
  group.names.map((name, memberIndex) => ({
    id: `st-${String(teamIndex * 20 + memberIndex + 1).padStart(3, '0')}`,
    name,
    team: group.team,
    active: true,
    openTickets: (teamIndex * 2 + memberIndex) % 7
  }))
);

export const MOCK_TICKETS: SupportTicket[] = [
  { id: 'TK-2026-1042', learner: 'Nguyễn Văn An', requesterRole: 'learner', email: 'an.nguyen@example.com', phone: '0901 234 567', topic: SUPPORT_TOPICS[2], summary: 'Coding Lab báo Syntax Error dù đoạn mã đã khớp với hướng dẫn của bài học.', priority: 'high', status: 'processing', createdAt: daysAgo(1), dueAt: hours(-2), assignee: 'Gia Huy', attachments: [{ name: 'coding-lab-error.png', kind: 'image' }, { name: 'source-code.pdf', kind: 'pdf' }], thread: [
    { id: 'm1', sender: 'Nguyễn Văn An', role: 'learner', sentAt: daysAgo(1), body: 'Tôi không thể chạy bài Python số 5. Coding Lab liên tục báo Syntax Error dù đã kiểm tra lại cú pháp và sao chép đúng đoạn mã trong bài.', attachments: [] },
    { id: 'm2', sender: 'Gia Huy', role: 'agent', sentAt: hours(-18), body: 'Mình đã nhận yêu cầu. Bạn vui lòng gửi ảnh toàn bộ màn hình và tệp mã nguồn để đội kỹ thuật đối chiếu.', attachments: [] },
    { id: 'm3', sender: 'Nguyễn Văn An', role: 'learner', sentAt: hours(-15), body: 'Tôi gửi kèm ảnh lỗi và tệp mã nguồn. Lỗi xuất hiện sau khi nhấn Chạy thử.', attachments: [{ name: 'coding-lab-error.png', kind: 'image' }, { name: 'source-code.pdf', kind: 'pdf' }] }
  ]},
  { id: 'TK-2026-1041', learner: 'Trần Ngọc Mai', requesterRole: 'learner', email: 'mai.tran@example.com', phone: '0912 334 455', topic: SUPPORT_TOPICS[1], summary: 'Đã thanh toán nhưng khóa học chưa được mở trong tài khoản.', priority: 'high', status: 'unassigned', createdAt: hours(-5), dueAt: hours(19), attachments: [{ name: 'bien-lai.pdf', kind: 'pdf' }], thread: [{ id: 'm4', sender: 'Trần Ngọc Mai', role: 'learner', sentAt: hours(-5), body: 'Tôi đã thanh toán đơn hàng nhưng vẫn chưa truy cập được khóa học. Nhờ kiểm tra giúp.', attachments: [{ name: 'bien-lai.pdf', kind: 'pdf' }] }] },
  { id: 'TK-2026-1039', learner: 'Phạm Quốc Bảo', requesterRole: 'learner', email: 'bao.pham@example.com', phone: '0988 771 122', topic: SUPPORT_TOPICS[3], summary: 'Không nhận được mã xác thực khi đăng nhập trên thiết bị mới.', priority: 'medium', status: 'reopened', createdAt: hours(-12), dueAt: hours(12), assignee: 'Minh Anh', reopenedAt: hours(-1), emailSyncStatus: 'synced', lastEmailSyncAt: hours(-1), attachments: [], thread: [{ id: 'm5', sender: 'Phạm Quốc Bảo', role: 'learner', sentAt: hours(-12), body: 'Tôi chưa nhận được mã xác thực qua email.', attachments: [] }, { id: 'm5-email', sender: 'Phạm Quốc Bảo', role: 'learner', source: 'email', sentAt: hours(-1), body: 'Tôi đã thử lại nhưng vẫn chưa nhận được mã. Nhờ ThinkUp tiếp tục kiểm tra.', attachments: [] }] },
  { id: 'TK-2026-1032', learner: 'Lê Hoàng Nam', requesterRole: 'learner', email: 'nam.le@example.com', phone: '0933 556 778', topic: SUPPORT_TOPICS[0], summary: 'Nội dung khóa học khác với mô tả và giảng viên chưa phản hồi.', priority: 'high', status: 'processing', createdAt: daysAgo(2), dueAt: hours(-20), assignee: 'Lê Văn C', attachments: [{ name: 'mo-ta-khoa-hoc.png', kind: 'image' }], thread: [{ id: 'm6', sender: 'Lê Hoàng Nam', role: 'learner', sentAt: daysAgo(2), body: 'Nội dung nhận được khác phần mô tả khi mua khóa học.', attachments: [{ name: 'mo-ta-khoa-hoc.png', kind: 'image' }] }] },
  { id: 'TK-2026-1028', learner: 'Vũ Thanh Vy', requesterRole: 'learner', email: 'vy.vu@example.com', phone: '0977 112 233', topic: SUPPORT_TOPICS[4], summary: 'Cần tư vấn lộ trình chuyển từ thiết kế sang Frontend.', priority: 'low', status: 'closed', createdAt: daysAgo(3), dueAt: daysAgo(2), assignee: 'Minh Anh', resolvedAt: new Date().toISOString(), attachments: [], thread: [{ id: 'm7', sender: 'Vũ Thanh Vy', role: 'learner', sentAt: daysAgo(3), body: 'Tôi cần được tư vấn lộ trình học Frontend.', attachments: [] }] },
  ...Array.from({ length: 95 }, (_, index): SupportTicket => {
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
    const requesterRole = index % 5 === 4 ? 'instructor' as const : 'learner' as const;
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
      requesterRole,
      email: `${requesterRole === 'instructor' ? 'giangvien' : 'hocvien'}${index + 1}@example.com`,
      phone: `09${String(10000000 + index * 7919).slice(-8)}`,
      lessonCode: index % 3 === 0 ? `LESSON-${String(index + 1).padStart(3, '0')}` : undefined,
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
  { id: 'KN-2026-0316', claimant: 'Nguyễn Minh Anh', respondent: 'Giảng viên Hoàng Nam', type: 'Hoàn tiền', status: 'resolved', amount: 2_400_000, createdAt: daysAgo(6), dueAt: daysAgo(4), risk: 'standard', evidence: [{ name: 'hoa-don-0316.pdf', kind: 'pdf' }], learnerStatement: 'Khóa học không đúng cấp độ được tư vấn và học viên đề nghị hoàn tiền.', instructorStatement: 'Tôi xác nhận nội dung khóa học chưa phù hợp với nhu cầu ban đầu của học viên.', course: 'Python cho người mới', orderId: 'ORD-230816', purchasedAt: daysAgo(9), progress: 6, refundEligibleUntil: daysAgo(2), conclusion: 'Chấp thuận hoàn toàn yêu cầu hoàn tiền do nội dung tư vấn ban đầu chưa phù hợp.', resolution: { type: 'refund', decidedAt: daysAgo(3), decidedBy: 'Nguyễn Minh Vy', summary: 'Chấp thuận hoàn tiền 100%; thu hồi quyền truy cập khóa học và hủy chứng chỉ nếu đã cấp.', refundMode: 'full', refundAmount: 2_400_000, instructorShare: 1_680_000, platformShare: 720_000, revokeAccess: true, revokeCertificate: true } },
  { id: 'KN-2026-0315', claimant: 'Trần Quốc Huy', respondent: 'Giảng viên Lê Phương', type: 'Chất lượng khóa học', status: 'dismissed', amount: 1_250_000, createdAt: daysAgo(8), dueAt: daysAgo(5), risk: 'standard', evidence: [{ name: 'lich-su-hoc-0315.pdf', kind: 'pdf' }], learnerStatement: 'Học viên yêu cầu hoàn tiền vì cho rằng khóa học không có nội dung nâng cao.', instructorStatement: 'Đề cương và toàn bộ nội dung đã được công bố trước khi học viên mua khóa học.', course: 'JavaScript Nâng cao', orderId: 'ORD-230815', purchasedAt: daysAgo(18), progress: 72, refundEligibleUntil: daysAgo(11), conclusion: 'Bác bỏ khiếu nại vì học viên đã học 72% và nội dung khóa học đúng đề cương công bố.', resolution: { type: 'dismiss', decidedAt: daysAgo(4), decidedBy: 'Lê Thanh Hà', summary: 'Bác bỏ yêu cầu hoàn tiền; giữ nguyên quyền truy cập khóa học và gửi văn bản giải thích cho học viên.', dismissalBasis: 'Học viên đã học quá 20% tiến độ', giftVoucher: true } },
  { id: 'KN-2026-0314', claimant: 'Phạm Ngọc Lan', respondent: 'Giảng viên Võ Thành Đạt', type: 'Vi phạm giảng viên', status: 'resolved', amount: 4_600_000, createdAt: daysAgo(12), dueAt: daysAgo(8), risk: 'high', evidence: [{ name: 'doi-chieu-noi-dung-0314.pdf', kind: 'pdf' }, { name: 'lich-su-phan-hoi-0314.pdf', kind: 'pdf' }], learnerStatement: 'Nội dung khóa học sao chép và giảng viên không phản hồi nhiều yêu cầu hỗ trợ.', instructorStatement: 'Giảng viên thừa nhận sử dụng tài liệu chưa được cấp phép và chậm phản hồi học viên.', course: 'Digital Marketing Mastery', orderId: 'ORD-230814', purchasedAt: daysAgo(20), progress: 38, refundEligibleUntil: daysAgo(13), conclusion: 'Áp dụng kỷ luật do vi phạm bản quyền nội dung và nghĩa vụ hỗ trợ học viên.', resolution: { type: 'discipline', decidedAt: daysAgo(7), decidedBy: 'Trần Hải Đăng', summary: 'Ghi nhận một điểm cảnh cáo, tạm ẩn khóa học 14 ngày và đóng băng quyền rút tiền 30 ngày.', sanctions: ['Ghi nhận 01 điểm cảnh cáo', 'Tạm ẩn khóa học 14 ngày', 'Đóng băng quyền rút tiền 30 ngày'] } },
  { id: 'KN-2026-0311', claimant: 'Ngô Hải Yến', respondent: 'Giảng viên Phạm Đức', type: 'Gian lận nội dung', status: 'reviewing', amount: 3_200_000, createdAt: daysAgo(4), dueAt: hours(-4), risk: 'high', evidence: [{ name: 'doi-chieu-noi-dung.pdf', kind: 'pdf' }], learnerStatement: 'Nội dung bài giảng có dấu hiệu sao chép.', instructorStatement: 'Tôi xác nhận nội dung được biên soạn từ tài liệu chuyên ngành và đề nghị đối chiếu chi tiết từng bài học trước khi kết luận.', course: 'UI Design Mastery', orderId: 'ORD-220811', purchasedAt: daysAgo(6), progress: 45, refundEligibleUntil: hours(12) },
  // TODO(pre-deploy): Nhớ xóa 17 hồ sơ mô phỏng bên dưới khi API Khiếu nại & Sự cố sẵn sàng.
  ...Array.from({ length: 17 }, (_, index): ComplaintCase => {
    const claimants = ['Phạm Gia Hân', 'Trần Đức Anh', 'Nguyễn Thảo Nhi', 'Bùi Phương Linh', 'Võ Minh Quân', 'Đặng Ngọc Mai', 'Lý Hoàng Phúc', 'Hoàng Thanh Tâm', 'Đinh Thu Hà', 'Phan Quốc Bảo', 'Trương Mỹ Linh', 'Lê Minh Khang', 'Nguyễn Hải An', 'Vũ Khánh Vy', 'Đỗ Nhật Nam', 'Mai Anh Thư', 'Trần Quốc Huy'];
    const respondents = ['Giảng viên Lê Văn C', 'Bộ phận Thanh toán', 'Giảng viên Thanh Hà', 'Hệ thống ThinkUp', 'Giảng viên Minh Anh', 'Bộ phận Chăm sóc', 'Giảng viên Quang Minh'];
    const types = ['Chất lượng khóa học', 'Hoàn tiền', 'Gian lận nội dung', 'Sự cố hệ thống', 'Vi phạm giảng viên', 'Thanh toán', 'Quyền riêng tư'];
    const statuses: ComplaintCase['status'][] = ['reviewing', 'waiting_instructor', 'ready', 'resolved', 'dismissed'];
    const type = types[index % types.length];
    const evidenceCount = index % 4;
    const amount = [850_000, 1_200_000, 2_450_000, 4_800_000, 7_500_000, 0][index % 6];
    const status = statuses[index % statuses.length];
    const resolution: ComplaintCase['resolution'] = status === 'dismissed'
      ? {
          type: 'dismiss', decidedAt: daysAgo((index % 6) + 1), decidedBy: 'Lê Thanh Hà',
          summary: 'Bác bỏ khiếu nại sau khi đối chiếu điều kiện hoàn tiền, tiến độ học và các bằng chứng trong hồ sơ.',
          dismissalBasis: index % 2 === 0 ? 'Học viên đã học quá 20% tiến độ' : 'Bằng chứng không xác thực',
          giftVoucher: index % 2 === 0
        }
      : status === 'resolved' && index % 2 === 0
        ? {
            type: 'refund', decidedAt: daysAgo((index % 6) + 1), decidedBy: 'Nguyễn Minh Vy',
            summary: 'Chấp thuận bồi hoàn sau khi xác minh nội dung tư vấn và quyền lợi của học viên.',
            refundMode: index % 4 === 0 ? 'full' : 'partial', refundAmount: amount,
            instructorShare: Math.round(amount * .7), platformShare: amount - Math.round(amount * .7),
            revokeAccess: true, revokeCertificate: index % 3 === 0
          }
        : status === 'resolved'
          ? {
              type: 'discipline', decidedAt: daysAgo((index % 6) + 1), decidedBy: 'Trần Hải Đăng',
              summary: 'Áp dụng chế tài do giảng viên vi phạm nghĩa vụ phản hồi và quy chuẩn nội dung khóa học.',
              sanctions: index % 3 === 0
                ? ['Ghi nhận 01 điểm cảnh cáo', 'Tạm ẩn khóa học trong 14 ngày']
                : ['Ghi nhận 01 điểm cảnh cáo', 'Đóng băng quyền rút tiền trong 30 ngày']
            }
          : undefined;
    return {
      id: `KN-2026-${String(310 - index).padStart(4, '0')}`,
      sourceTicketId: `TK-2026-${String(1029 - index).padStart(4, '0')}`,
      claimant: claimants[index], respondent: respondents[index % respondents.length], type,
      status, amount, createdAt: daysAgo((index % 12) + 1),
      dueAt: hours(index % 5 === 0 ? -(index + 2) : (index % 18) + 2), risk: 'standard',
      evidence: Array.from({ length: evidenceCount }, (__, fileIndex) => ({ name: `bang-chung-${index + 1}-${fileIndex + 1}.pdf`, kind: 'pdf' as const })),
      learnerStatement: `Người gửi yêu cầu xác minh sự vụ ${type.toLocaleLowerCase('vi-VN')} và đề nghị ThinkUp phản hồi bằng văn bản.`,
      instructorStatement: index % 3 === 0 ? 'Bên liên quan đã gửi giải trình và đề nghị hệ thống kiểm tra dữ liệu gốc.' : undefined,
      course: ['Lập trình Web', 'UI/UX Thực chiến', 'Data Analytics', 'Digital Marketing'][index % 4],
      orderId: `ORD-${230900 + index}`, purchasedAt: daysAgo((index % 10) + 3), progress: (index * 7) % 96,
      refundEligibleUntil: hours((index % 5 + 1) * 24),
      conclusion: resolution?.summary,
      resolution
    };
  })
];

// TODO(pre-deploy): Nhớ xóa dữ liệu FAQ mẫu và thay bằng danh sách FAQ từ API quản trị nội dung.
export const MOCK_FAQS: FaqItem[] = [
  { id: 'FAQ-101', question: 'Làm thế nào để đổi mật khẩu tài khoản?', answer: 'Mở Cài đặt tài khoản, chọn Bảo mật, sau đó chọn Đổi mật khẩu và làm theo hướng dẫn xác thực.', category: FAQ_CATEGORIES[0], keywords: ['đổi mật khẩu', 'bảo mật'], views: 2840, order: 1, status: 'published', updatedAt: daysAgo(1) },
  { id: 'FAQ-105', question: 'Tôi quên email đăng nhập thì phải làm sao?', answer: 'Liên hệ bộ phận hỗ trợ và cung cấp họ tên, số điện thoại cùng thông tin giao dịch gần nhất để xác minh tài khoản.', category: FAQ_CATEGORIES[0], keywords: ['quên email', 'đăng nhập', 'xác minh'], views: 1280, order: 2, status: 'published', updatedAt: daysAgo(4) },
  { id: 'FAQ-106', question: 'Làm sao để bật xác thực hai lớp?', answer: 'Vào Cài đặt tài khoản, chọn Bảo mật, mở mục Xác thực hai lớp và quét mã QR bằng ứng dụng xác thực.', category: FAQ_CATEGORIES[0], keywords: ['2fa', 'xác thực hai lớp', 'bảo mật'], views: 845, order: 3, status: 'hidden', updatedAt: daysAgo(7) },

  { id: 'FAQ-102', question: 'Tôi có thể yêu cầu xuất hóa đơn khi nào?', answer: 'Bạn có thể yêu cầu xuất hóa đơn trong phần chi tiết đơn hàng sau khi thanh toán thành công.', category: FAQ_CATEGORIES[1], keywords: ['hóa đơn', 'thanh toán'], views: 1650, order: 1, status: 'published', updatedAt: daysAgo(2) },
  { id: 'FAQ-107', question: 'ThinkUp hỗ trợ những phương thức thanh toán nào?', answer: 'ThinkUp hỗ trợ thanh toán qua thẻ ngân hàng, chuyển khoản và các ví điện tử được hiển thị tại trang thanh toán.', category: FAQ_CATEGORIES[1], keywords: ['vnpay', 'momo', 'visa', 'chuyển khoản'], views: 2375, order: 2, status: 'published', updatedAt: daysAgo(6) },
  { id: 'FAQ-108', question: 'Bao lâu tôi nhận được tiền hoàn?', answer: 'Thời gian hoàn tiền phụ thuộc phương thức thanh toán và thường mất từ 5 đến 15 ngày làm việc sau khi yêu cầu được duyệt.', category: FAQ_CATEGORIES[1], keywords: ['hoàn tiền', 'thời gian hoàn', 'giao dịch'], views: 990, order: 3, status: 'hidden', updatedAt: daysAgo(8) },

  { id: 'FAQ-109', question: 'Tôi có thể học khóa học trong bao lâu?', answer: 'Thời hạn truy cập được ghi trong thông tin khóa học. Bạn có thể xem lại tại mục Khóa học của tôi.', category: FAQ_CATEGORIES[2], keywords: ['thời hạn học', 'truy cập khóa học'], views: 1960, order: 1, status: 'published', updatedAt: daysAgo(3) },
  { id: 'FAQ-110', question: 'Làm thế nào để đánh dấu bài học đã hoàn thành?', answer: 'Sau khi xem hết nội dung bài học, chọn Đánh dấu hoàn thành để hệ thống cập nhật tiến độ của bạn.', category: FAQ_CATEGORIES[2], keywords: ['hoàn thành bài học', 'tiến độ'], views: 1125, order: 2, status: 'published', updatedAt: daysAgo(9) },
  { id: 'FAQ-111', question: 'Tôi có thể tải tài liệu khóa học về không?', answer: 'Bạn có thể tải những tài liệu được giảng viên cho phép bằng nút Tải xuống bên dưới bài học.', category: FAQ_CATEGORIES[2], keywords: ['tải tài liệu', 'file bài học'], views: 760, order: 3, status: 'hidden', updatedAt: daysAgo(11) },

  { id: 'FAQ-103', question: 'Điều kiện để nhận chứng chỉ hoàn thành là gì?', answer: 'Hoàn thành các nội dung bắt buộc và đạt mức điểm tối thiểu được công bố trong khóa học.', category: FAQ_CATEGORIES[3], keywords: ['chứng chỉ', 'hoàn thành'], views: 930, order: 1, status: 'hidden', updatedAt: daysAgo(3) },
  { id: 'FAQ-112', question: 'Tôi tải chứng chỉ điện tử ở đâu?', answer: 'Mở trang Chứng chỉ của tôi, chọn chứng chỉ cần tải và nhấn Tải bản PDF.', category: FAQ_CATEGORIES[3], keywords: ['tải chứng chỉ', 'chứng chỉ pdf'], views: 1430, order: 2, status: 'published', updatedAt: daysAgo(5) },
  { id: 'FAQ-113', question: 'Tên trên chứng chỉ bị sai thì xử lý thế nào?', answer: 'Cập nhật họ tên trong hồ sơ và gửi yêu cầu hỗ trợ kèm giấy tờ xác minh để được cấp lại chứng chỉ.', category: FAQ_CATEGORIES[3], keywords: ['sai tên', 'cấp lại chứng chỉ'], views: 520, order: 3, status: 'published', updatedAt: daysAgo(12) },

  { id: 'FAQ-104', question: 'Ứng dụng không phát video bài giảng', answer: 'Kiểm tra kết nối mạng, cập nhật ứng dụng và thử xóa bộ nhớ đệm trước khi gửi yêu cầu hỗ trợ.', category: FAQ_CATEGORIES[4], keywords: ['video', 'ứng dụng', 'lỗi'], views: 710, order: 1, status: 'hidden', updatedAt: daysAgo(5) },
  { id: 'FAQ-114', question: 'Tại sao video bị giật hoặc giảm chất lượng?', answer: 'Kiểm tra tốc độ mạng, chọn chất lượng video thấp hơn và đóng các ứng dụng đang sử dụng nhiều băng thông.', category: FAQ_CATEGORIES[4], keywords: ['video giật', 'chất lượng video', 'mạng chậm'], views: 1185, order: 2, status: 'published', updatedAt: daysAgo(10) },
  { id: 'FAQ-115', question: 'Tôi không nhận được thông báo từ ứng dụng', answer: 'Kiểm tra quyền thông báo trong cài đặt thiết bị và bảo đảm ứng dụng ThinkUp không bị giới hạn chạy nền.', category: FAQ_CATEGORIES[4], keywords: ['thông báo', 'ứng dụng', 'quyền thiết bị'], views: 405, order: 3, status: 'published', updatedAt: daysAgo(14) },

  { id: 'FAQ-116', question: 'Tôi có được chia sẻ tài khoản cho người khác không?', answer: 'Tài khoản học tập chỉ dành cho người đăng ký và không được chia sẻ theo điều khoản sử dụng của ThinkUp.', category: FAQ_CATEGORIES[5], keywords: ['chia sẻ tài khoản', 'điều khoản'], views: 870, order: 1, status: 'published', updatedAt: daysAgo(6) },
  { id: 'FAQ-117', question: 'Chính sách bảo mật dữ liệu học viên như thế nào?', answer: 'ThinkUp chỉ thu thập và xử lý dữ liệu cần thiết theo chính sách quyền riêng tư được công bố trên hệ thống.', category: FAQ_CATEGORIES[5], keywords: ['bảo mật dữ liệu', 'quyền riêng tư'], views: 645, order: 2, status: 'published', updatedAt: daysAgo(13) },
  { id: 'FAQ-118', question: 'Khi nào tài khoản có thể bị tạm khóa?', answer: 'Tài khoản có thể bị tạm khóa khi phát hiện hành vi vi phạm điều khoản, đăng nhập bất thường hoặc có yêu cầu từ chủ tài khoản.', category: FAQ_CATEGORIES[5], keywords: ['tạm khóa', 'vi phạm', 'điều khoản'], views: 390, order: 3, status: 'hidden', updatedAt: daysAgo(15) },

  { id: 'FAQ-119', question: 'Làm thế nào để gửi góp ý cho ThinkUp?', answer: 'Mở Trung tâm hỗ trợ, chọn Gửi yêu cầu và chọn chủ đề Góp ý để gửi nội dung cho đội ngũ ThinkUp.', category: FAQ_CATEGORIES[6], keywords: ['góp ý', 'liên hệ hỗ trợ'], views: 335, order: 1, status: 'published', updatedAt: daysAgo(8) },
  { id: 'FAQ-120', question: 'Tôi có thể liên hệ hỗ trợ ngoài giờ hành chính không?', answer: 'Bạn có thể gửi yêu cầu bất cứ lúc nào. Đội ngũ hỗ trợ sẽ phản hồi theo thời gian xử lý được công bố trong Trung tâm hỗ trợ.', category: FAQ_CATEGORIES[6], keywords: ['ngoài giờ', 'liên hệ', 'hỗ trợ'], views: 280, order: 2, status: 'published', updatedAt: daysAgo(16) }
];

export const MOCK_FAILED_SEARCHES: FailedSearch[] = [
  { keyword: 'đổi email đăng nhập', count: 48, suggestedCategory: FAQ_CATEGORIES[0] },
  { keyword: 'hoàn tiền qua momo', count: 31, suggestedCategory: FAQ_CATEGORIES[1] },
  { keyword: 'tải chứng chỉ bản cứng', count: 19, suggestedCategory: FAQ_CATEGORIES[3] }
];
