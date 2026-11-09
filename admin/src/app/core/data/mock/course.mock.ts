import {
  ApprovalItem,
  ApprovalWorkspace,
  Course,
  CourseChapter,
  CourseFinance,
  CourseLearner
} from '../../../features/courses/models/course.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu mock khóa học khi backend cung cấp API quản lý khóa học.

const FRONTEND_CHAPTERS: CourseChapter[] = [
  { no: '01', title: 'Bắt đầu với React & TypeScript', meta: '6 bài · 2 giờ 30 phút' },
  { no: '02', title: 'Component, props và state', meta: '8 bài · 4 giờ 10 phút' },
  { no: '03', title: 'Quản lý dữ liệu và hooks', meta: '7 bài · 3 giờ 45 phút' },
  { no: '04', title: 'Kiểm thử và triển khai', meta: '5 bài · 3 giờ 20 phút' }
];

const FINANCE: CourseFinance = {
  listPrice: '1.290.000 ₫',
  instructorShare: '40%',
  platformShare: '60%',
  revenue: '1.204.680.000 ₫',
  voucher: 'THINKUP20 · giảm 20%',
  voucherActive: true
};

const BASE_LEARNERS: CourseLearner[] = [
  { name: 'Nguyễn Thu Trang', email: 'trang.nguyen@thinkup.edu.vn', progress: 82, enrolledAt: '2026-03-04T10:20:00+07:00', status: 'Đang học' },
  { name: 'Lê Quang Dũng', email: 'dung.le@thinkup.edu.vn', progress: 100, enrolledAt: '2026-02-18T09:05:00+07:00', status: 'Hoàn thành' },
  { name: 'Phạm Mai Linh', email: 'linh.pham@thinkup.edu.vn', progress: 45, enrolledAt: '2026-04-02T15:40:00+07:00', status: 'Đang học' }
];

export const MOCK_COURSES: Course[] = [
  {
    id: 'THK-2025-0148',
    title: 'React & TypeScript thực chiến',
    category: 'Frontend Developer',
    level: 'Nâng cao',
    instructor: 'Nguyễn Minh Anh',
    instructorId: 'GV-2026-089',
    students: 1248,
    price: 1_290_000,
    rating: 4.9,
    reviewCount: 328,
    status: 'published',
    createdAt: '2026-04-12T14:30:00+07:00',
    updatedAt: '2026-10-24T11:22:00+07:00',
    durationHours: 42,
    description: 'Xây dựng ứng dụng hiện đại với React, TypeScript, kiểm thử và triển khai production.',
    tags: ['Frontend', 'Nâng cao', '42 giờ học'],
    curriculumSummary: '8 chương · 42 video · 12 bài đọc · 6 quiz · 3 phòng lab',
    chapters: FRONTEND_CHAPTERS,
    learners: BASE_LEARNERS,
    finance: FINANCE
  },
  {
    id: 'THK-2025-0149',
    title: 'Node.js: Xây dựng API',
    category: 'Backend Developer',
    level: 'Nâng cao',
    instructor: 'Trần Quốc Bảo',
    instructorId: 'GV-2026-090',
    students: 842,
    price: 990_000,
    rating: 4.8,
    reviewCount: 214,
    status: 'published',
    createdAt: '2026-04-10T09:42:00+07:00',
    updatedAt: '2026-10-20T16:05:00+07:00',
    durationHours: 36,
    description: 'Thiết kế REST API, xác thực, phân quyền và triển khai dịch vụ Node.js ổn định.',
    tags: ['Backend', 'Nâng cao', '36 giờ học'],
    curriculumSummary: '7 chương · 34 video · 10 bài đọc · 5 quiz · 4 phòng lab',
    chapters: [
      { no: '01', title: 'Kiến trúc ứng dụng Node.js', meta: '5 bài · 2 giờ 10 phút' },
      { no: '02', title: 'Routing, middleware và validation', meta: '7 bài · 3 giờ 30 phút' },
      { no: '03', title: 'Xác thực và phân quyền', meta: '6 bài · 3 giờ 05 phút' },
      { no: '04', title: 'Triển khai và giám sát', meta: '5 bài · 2 giờ 45 phút' }
    ],
    learners: BASE_LEARNERS,
    finance: { ...FINANCE, listPrice: '990.000 ₫', revenue: '742.560.000 ₫' }
  },
  {
    id: 'THK-2025-0150',
    title: 'Kiểm thử phần mềm từ A–Z',
    category: 'Software Tester',
    level: 'Trung cấp',
    instructor: 'Lê Thu Hà',
    instructorId: 'GV-2026-091',
    students: null,
    price: 790_000,
    rating: null,
    reviewCount: 0,
    status: 'pending',
    createdAt: '2026-04-08T16:18:00+07:00',
    updatedAt: '2026-04-08T16:18:00+07:00',
    durationHours: 28,
    description: 'Quy trình kiểm thử từ lập kế hoạch, viết test case đến tự động hóa và báo cáo lỗi.',
    tags: ['Testing', 'Trung cấp', '28 giờ học'],
    curriculumSummary: '6 chương · 24 video · 8 bài đọc · 4 quiz · 2 phòng lab',
    chapters: [
      { no: '01', title: 'Tư duy kiểm thử', meta: '4 bài · 1 giờ 50 phút' },
      { no: '02', title: 'Thiết kế test case', meta: '6 bài · 2 giờ 40 phút' },
      { no: '03', title: 'Kiểm thử API', meta: '5 bài · 2 giờ 15 phút' },
      { no: '04', title: 'Báo cáo và quản lý lỗi', meta: '4 bài · 1 giờ 45 phút' }
    ],
    learners: [],
    finance: { ...FINANCE, listPrice: '790.000 ₫', revenue: '0 ₫', voucher: 'Chưa áp dụng', voucherActive: false }
  },
  {
    id: 'THK-2025-0151',
    title: 'Data Analyst với SQL',
    category: 'Data Analyst',
    level: 'Trung cấp',
    instructor: 'Phạm Gia Huy',
    instructorId: 'GV-2026-092',
    students: 1024,
    price: 1_100_000,
    rating: 4.9,
    reviewCount: 403,
    status: 'hidden',
    createdAt: '2026-10-24T11:22:00+07:00',
    updatedAt: '2026-10-24T11:22:00+07:00',
    durationHours: 32,
    description: 'Truy vấn, làm sạch dữ liệu và trực quan hóa báo cáo phân tích với SQL.',
    tags: ['Data', 'Trung cấp', '32 giờ học'],
    curriculumSummary: '7 chương · 30 video · 9 bài đọc · 6 quiz · 3 phòng lab',
    chapters: [
      { no: '01', title: 'SQL nền tảng', meta: '6 bài · 2 giờ 20 phút' },
      { no: '02', title: 'JOIN và tổng hợp dữ liệu', meta: '7 bài · 3 giờ 10 phút' },
      { no: '03', title: 'Cửa sổ dữ liệu và CTE', meta: '5 bài · 2 giờ 35 phút' },
      { no: '04', title: 'Phân tích và báo cáo', meta: '6 bài · 3 giờ' }
    ],
    learners: BASE_LEARNERS,
    finance: { ...FINANCE, listPrice: '1.100.000 ₫', revenue: '986.700.000 ₫' }
  },
  {
    id: 'THK-2025-0152',
    title: 'Lập trình di động Flutter',
    category: 'Mobile Developer',
    level: 'Nâng cao',
    instructor: 'Đỗ Minh Anh',
    instructorId: 'GV-2026-093',
    students: 388,
    price: 890_000,
    rating: 4.6,
    reviewCount: 72,
    status: 'archived',
    createdAt: '2026-10-23T10:15:00+07:00',
    updatedAt: '2026-10-23T10:15:00+07:00',
    durationHours: 30,
    description: 'Xây dựng ứng dụng đa nền tảng với Flutter, quản lý trạng thái và phát hành store.',
    tags: ['Mobile', 'Nâng cao', '30 giờ học'],
    curriculumSummary: '6 chương · 28 video · 7 bài đọc · 5 quiz · 2 phòng lab',
    chapters: [
      { no: '01', title: 'Flutter và Dart cơ bản', meta: '5 bài · 2 giờ 05 phút' },
      { no: '02', title: 'Widget và bố cục', meta: '7 bài · 3 giờ 20 phút' },
      { no: '03', title: 'Quản lý trạng thái', meta: '6 bài · 2 giờ 55 phút' },
      { no: '04', title: 'Phát hành ứng dụng', meta: '4 bài · 1 giờ 40 phút' }
    ],
    learners: BASE_LEARNERS,
    finance: { ...FINANCE, listPrice: '890.000 ₫', revenue: '268.400.000 ₫' }
  }
];

export const MOCK_APPROVALS: ApprovalItem[] = [
  {
    id: 'AP-2026-0841',
    courseId: 'KH-PY01',
    courseTitle: 'Python Cơ Bản Cho Người Mới Bắt Đầu',
    category: 'Backend Developer',
    level: 'Cơ bản',
    instructor: 'Trần Minh Hiếu',
    instructorRole: 'Senior Python Developer',
    components: 'Thông tin chung',
    resources: '40 bài · 12 video\n15 IDE · 8 quiz · 5 doc',
    suggestedPrice: 599_000,
    discount: 40,
    submittedAt: '2026-04-12T14:30:00+07:00',
    slaHours: 54,
    slaStatus: 'overdue',
    slaLabel: '54h · Quá hạn',
    slaHint: 'Cần xử lý gấp',
    action: 'inspect'
  },
  {
    id: 'AP-2026-0842',
    courseId: 'KH-DK02',
    courseTitle: 'Docker & Kubernetes căn bản',
    category: 'DevOps',
    level: 'Nâng cao',
    instructor: 'Nguyễn Gia Phúc',
    instructorRole: 'DevOps Engineer',
    components: 'Video / Bài đọc',
    resources: '32 bài · 10 video\n12 IDE · 6 quiz',
    suggestedPrice: 899_000,
    discount: 20,
    submittedAt: '2026-04-13T09:42:00+07:00',
    slaHours: 41,
    slaStatus: 'due-soon',
    slaLabel: '41h · Sắp hạn',
    slaHint: 'Ưu tiên tiếp nhận',
    action: 'inspect'
  },
  {
    id: 'AP-2026-0843',
    courseId: 'KH-UX03',
    courseTitle: 'UX Research thực hành',
    category: 'Product Design',
    level: 'Trung cấp',
    instructor: 'Hoàng Minh Trang',
    instructorRole: 'Product Designer',
    components: 'Quiz & tài liệu',
    resources: '28 bài · 14 video\n8 bài đọc · 4 doc',
    suggestedPrice: 790_000,
    discount: 0,
    submittedAt: '2026-04-12T16:18:00+07:00',
    slaHours: 19,
    slaStatus: 'remaining',
    slaLabel: '19h còn lại',
    slaHint: 'Theo tiến độ',
    action: 'inspect'
  },
  {
    id: 'AP-2026-0844',
    courseId: 'KH-DA04',
    courseTitle: 'Data Analyst với SQL',
    category: 'Data Analyst',
    level: 'Trung cấp',
    instructor: 'Phạm Gia Huy',
    instructorRole: 'Data Analyst',
    components: 'Bài tập lập trình (IDE)',
    resources: '36 bài · 11 video · 9 IDE\n8 quiz',
    suggestedPrice: 1_190_000,
    discount: 15,
    submittedAt: '2026-10-24T11:22:00+07:00',
    slaHours: 0,
    slaStatus: 'waiting',
    slaLabel: 'Chờ GV sửa',
    slaHint: 'Đã gửi yêu cầu bổ sung',
    action: 'history'
  },
  {
    id: 'AP-2026-0845',
    courseId: 'KH-JS05',
    courseTitle: 'JavaScript hiện đại',
    category: 'Frontend Developer',
    level: 'Cơ bản',
    instructor: 'Lê Thu Hà',
    instructorRole: 'Frontend Developer',
    components: 'Thông tin chung',
    resources: '24 bài · 9 video · 8 IDE\n5 quiz',
    suggestedPrice: 690_000,
    discount: 30,
    submittedAt: '2026-10-23T10:15:00+07:00',
    slaHours: 0,
    slaStatus: 'approved',
    slaLabel: 'Đã duyệt',
    slaHint: 'Hoàn tất 23/10/2026',
    action: 'profile'
  }
];

const CHECKLIST = [
  { id: 'video', label: 'Video đạt chất lượng & bản quyền', done: true },
  { id: 'ide', label: 'Code IDE đủ test case, mẫu chạy đạt', done: true },
  { id: 'docs', label: 'Tài liệu đính kèm an toàn', done: false },
  { id: 'price', label: 'Giá bán & cấp độ phù hợp', done: false },
  { id: 'content', label: 'Nội dung chính xác, phù hợp', done: false }
];

const PYTHON_CHAPTERS = [
  {
    no: '01',
    title: 'Giới thiệu Python',
    lessons: [
      { id: 'py-1-1', kind: 'video' as const, title: 'Bắt đầu học Python', trial: true },
      { id: 'py-1-2', kind: 'reading' as const, title: 'Bài đọc Cài đặt môi trường' },
      { id: 'py-1-3', kind: 'quiz' as const, title: 'Kiến thức cơ bản' }
    ]
  },
  {
    no: '02',
    title: 'Kiểu dữ liệu & biến',
    lessons: [
      { id: 'py-2-1', kind: 'video' as const, title: 'Biến và kiểu dữ liệu' },
      { id: 'py-2-2', kind: 'ide' as const, title: 'Code IDE · Thực hành 01' },
      { id: 'py-2-3', kind: 'doc' as const, title: 'Tài liệu · Bảng tham chiếu' }
    ]
  },
  {
    no: '03',
    title: 'Cấu trúc điều khiển',
    lessons: [
      { id: 'py-3-1', kind: 'ide' as const, title: 'Code IDE · Câu lệnh điều kiện' },
      { id: 'py-3-2', kind: 'quiz' as const, title: 'If / else' },
      { id: 'py-3-3', kind: 'video' as const, title: 'Vòng lặp', trial: true }
    ]
  },
  { no: '04', title: 'Hàm và module', lessons: [] },
  { no: '05', title: 'Lập trình hướng đối tượng', lessons: [] },
  { no: '06', title: 'Dự án cuối khóa', lessons: [] }
];

export const MOCK_WORKSPACES: ApprovalWorkspace[] = MOCK_APPROVALS.map((approval, index) => ({
  approvalId: approval.id,
  courseId: approval.courseId,
  title: approval.courseTitle,
  level: approval.level,
  instructor: {
    name: approval.instructor,
    role: approval.instructorRole,
    initials: approval.instructor.split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase(),
    verified: true
  },
  checklist: CHECKLIST.map(item => ({ ...item, done: index === 0 ? item.done : item.id !== 'content' })),
  landing: {
    subtitle: 'Học Python từ nền tảng đến xây dựng dự án đầu tiên. Phù hợp cho người mới bắt đầu.',
    price: approval.suggestedPrice,
    originalPrice: Math.round(approval.suggestedPrice / (1 - approval.discount / 100)),
    discount: approval.discount,
    stats: '40 bài học · 8h 45m · Chứng chỉ hoàn thành',
    outcomes: [
      'Viết chương trình Python và xử lý dữ liệu cơ bản',
      'Sử dụng điều kiện, vòng lặp, hàm và module',
      'Tổ chức mã theo hướng đối tượng',
      'Hoàn thành một dự án Python đầu tiên'
    ],
    requirement: 'Không yêu cầu kinh nghiệm lập trình trước đó.',
    categories: ['Backend Developer'],
    subtags: ['Python', 'Programming', 'Beginner'],
    certificate: 'Python Fundamentals',
    certificateNote: 'Phôi chứng chỉ mẫu · Hiển thị tên khóa học, học viên và ngày hoàn thành.'
  },
  chapters: PYTHON_CHAPTERS,
  video: {
    title: 'Bài giảng 01 · Bắt đầu học Python',
    type: 'VIDEO · 18 PHÚT',
    progress: 37,
    duration: '18:06',
    playback: '06:42 / 18:06',
    description: 'Giới thiệu môi trường Python, trình thông dịch và cách chạy chương trình đầu tiên.',
    attachments: 'Python_setup_guide.pdf · 2.4 MB'
  },
  ide: {
    title: 'Thực hành 01 · Kiểm tra số chẵn lẻ',
    difficulty: 'Cơ bản',
    prompt: 'Viết hàm is_even(n) trả về True nếu n là số chẵn, ngược lại trả về False.',
    language: 'Python 3.11',
    code: 'def is_even(n):\n    if n % 2 == 0:\n        return True\n    return False\n\nprint(is_even(4))',
    testcases: [
      { id: 'tc-1', visibility: 'Public', input: 'n=4', expected: 'Kết quả: True', state: 'passed' },
      { id: 'tc-2', visibility: 'Public', input: 'n=7', expected: 'Kết quả: False', state: 'passed' },
      { id: 'tc-3', visibility: 'Hidden', input: 'n=0', expected: 'Kết quả: True', state: 'pending' }
    ],
    result: 'Tất cả testcase mẫu đạt · 42 ms · 18 MB'
  },
  quiz: {
    title: 'Quiz 01 · Kiến thức cơ bản về Python',
    question: {
      id: 'q-1',
      index: 1,
      total: 8,
      prompt: 'Kiểu dữ liệu nào dùng để lưu một chuỗi ký tự trong Python?',
      answers: [
        { letter: 'A', text: 'int' },
        { letter: 'B', text: 'str', correct: true },
        { letter: 'C', text: 'float' },
        { letter: 'D', text: 'bool' }
      ],
      correctLetter: 'B',
      explanation: 'Kiểu str biểu diễn chuỗi văn bản. Đáp án có giải thích để học viên hiểu khái niệm.'
    }
  },
  files: [
    { id: 'f-1', extension: 'PDF', name: 'Python_Quick_Guide.pdf', size: '2.4 MB', scanned: true },
    { id: 'f-2', extension: 'ZIP', name: 'Source_Code.zip', size: '1.8 MB', scanned: false, risky: true },
    { id: 'f-3', extension: 'DOCX', name: 'Lesson_Notes.docx', size: '640 KB', scanned: true },
    { id: 'f-4', extension: 'PPTX', name: 'Python_Overview.pptx', size: '4.2 MB', scanned: true }
  ],
  history: [
    { at: '2026-04-12T14:30:00+07:00', actor: 'Trần Minh Hiếu', action: 'Gửi yêu cầu duyệt', note: 'Gửi hồ sơ khóa học lần đầu.' },
    { at: '2026-04-12T15:10:00+07:00', actor: 'Hệ thống', action: 'Kiểm tra tự động', note: 'Video và tài liệu đạt kiểm tra định dạng.' }
  ]
}));
