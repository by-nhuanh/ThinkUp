import { ContentComment, ContentPost, ContentReport, ContentReview, ModerationLog } from '../../../features/content/models/content.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu mẫu này khi backend cung cấp API quản lý nội dung đã xác minh.

const at = (date: string, time: string): string => new Date(`${date}T${time}:00+07:00`).toISOString();

const EDITORIAL = { name: 'ThinkUp Team', role: 'Admin' as const };

interface PostSeed {
  title: string;
  slug: string;
  category: ContentPost['category'];
  author: string;
  role: ContentPost['authorRole'];
  status: ContentPost['status'];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
  tags: string[];
}

const POST_SEEDS: PostSeed[] = [
  {
    title: 'HTML, CSS, JavaScript là gì? Lộ trình cho người mới', slug: 'html-css-javascript-la-gi',
    category: 'Lập trình cơ bản', author: EDITORIAL.name, role: EDITORIAL.role, status: 'published', pinned: true,
    createdAt: at('2026-10-28', '08:00'), updatedAt: at('2026-11-04', '09:15'),
    excerpt: 'Giải thích ba nền tảng của lập trình web và lộ trình học 12 tuần dành cho người mới bắt đầu.',
    tags: ['html', 'css', 'javascript']
  },
  {
    title: '5 kỹ năng cần có của Business Analyst', slug: '5-ky-nang-business-analyst',
    category: 'Kinh nghiệm', author: 'Trần Quốc Bảo', role: 'Giảng viên', status: 'pending', pinned: false,
    createdAt: at('2026-11-02', '10:20'), updatedAt: at('2026-11-03', '16:42'),
    excerpt: 'Phân tích nghiệp vụ, giao tiếp, tư duy hệ thống và hai kỹ năng ít được nhắc tới.',
    tags: ['business analyst', 'kỹ năng']
  },
  {
    title: 'Git và GitHub: làm việc nhóm hiệu quả', slug: 'git-github-lam-viec-nhom',
    category: 'Tài nguyên', author: EDITORIAL.name, role: EDITORIAL.role, status: 'hidden', pinned: false,
    createdAt: at('2026-10-30', '09:00'), updatedAt: at('2026-11-03', '14:28'),
    excerpt: 'Quy trình branch, review và xử lý xung đột giúp nhóm nhiều người làm việc không lẫn code.',
    tags: ['git', 'github', 'teamwork']
  },
  {
    title: 'Xây dựng ứng dụng React đầu tiên', slug: 'ung-dung-react-dau-tien',
    category: 'Web Development', author: 'Nguyễn Minh Anh', role: 'Học viên', status: 'published', pinned: true,
    createdAt: at('2026-10-26', '09:00'), updatedAt: at('2026-11-02', '10:30'),
    excerpt: 'Từ create-vite tới component, props và state — bài thực hành của học viên khóa React.',
    tags: ['react', 'frontend']
  },
  {
    title: 'CI/CD là gì? Tự động hóa quy trình triển khai', slug: 'ci-cd-la-gi',
    category: 'DevOps', author: EDITORIAL.name, role: EDITORIAL.role, status: 'published', pinned: false,
    createdAt: at('2026-10-25', '08:00'), updatedAt: at('2026-11-01', '08:45'),
    excerpt: 'Pipeline tự động giúp giảm lỗi phát hành và rút ngắn thời gian đưa tính năng tới người dùng.',
    tags: ['ci/cd', 'devops']
  },
  {
    title: 'Tư duy thiết kế: 5 bước giải quyết vấn đề người dùng', slug: 'tu-duy-thiet-ke-5-buoc',
    category: 'Kinh nghiệm', author: 'Lê Thu Hà', role: 'Giảng viên', status: 'published', pinned: false,
    createdAt: at('2026-10-24', '09:10'), updatedAt: at('2026-10-31', '15:05'),
    excerpt: 'Empathize, Define, Ideate, Prototype và Test áp dụng vào một dự án học tập thực tế.',
    tags: ['design thinking', 'ux']
  },
  {
    title: 'Roadmap học Data Analyst trong 6 tháng', slug: 'roadmap-data-analyst-6-thang',
    category: 'Tài nguyên', author: 'Phạm Gia Huy', role: 'Giảng viên', status: 'draft', pinned: false,
    createdAt: at('2026-10-29', '11:30'), updatedAt: at('2026-10-30', '09:20'),
    excerpt: 'Bản nháp lộ trình SQL, Excel, Power BI và bài tập thực hành theo tuần.',
    tags: ['data analyst', 'roadmap']
  },
  {
    title: 'Viết CV ngành công nghệ cho người chuyển ngành', slug: 'viet-cv-nganh-cong-nghe',
    category: 'Kinh nghiệm', author: 'Nguyễn Thu Hà', role: 'Biên tập viên', status: 'rejected', pinned: false,
    createdAt: at('2026-10-27', '14:00'), updatedAt: at('2026-10-28', '10:10'),
    excerpt: 'Hướng dẫn cấu trúc CV và cách mô tả dự án cá nhân khi chưa có kinh nghiệm.',
    tags: ['cv', 'nghề nghiệp']
  },
  {
    title: 'Kiểm thử phần mềm từ A–Z: lộ trình thực chiến', slug: 'kiem-thu-phan-mem-tu-a-z',
    category: 'Web Development', author: 'Lê Thị Thu Hà', role: 'Giảng viên', status: 'published', pinned: false,
    createdAt: at('2026-10-20', '09:00'), updatedAt: at('2026-10-27', '16:00'),
    excerpt: 'Test case, automation và quy trình kiểm thử trong dự án Agile.',
    tags: ['testing', 'qa']
  },
  {
    title: 'Tối ưu hiệu năng Angular: OnPush và Signals', slug: 'toi-uu-hieu-nang-angular',
    category: 'Web Development', author: EDITORIAL.name, role: EDITORIAL.role, status: 'scheduled', pinned: false,
    createdAt: at('2026-11-01', '09:00'), updatedAt: at('2026-11-05', '11:00'),
    excerpt: 'Các kỹ thuật giảm change detection và quản lý state bằng Signals.',
    tags: ['angular', 'performance']
  },
  {
    title: 'Docker căn bản cho lập trình viên', slug: 'docker-can-ban',
    category: 'DevOps', author: 'Hoàng Việt', role: 'Giảng viên', status: 'published', pinned: false,
    createdAt: at('2026-10-18', '08:00'), updatedAt: at('2026-10-26', '13:40'),
    excerpt: 'Image, container và cách đóng gói ứng dụng Node.js bằng Dockerfile.',
    tags: ['docker', 'devops']
  },
  {
    title: 'React & TypeScript thực chiến: ghi chú học tập', slug: 'react-typescript-ghi-chu',
    category: 'Kinh nghiệm', author: 'Trần Quốc Bảo', role: 'Giảng viên', status: 'archived', pinned: false,
    createdAt: at('2026-09-12', '09:00'), updatedAt: at('2026-09-20', '09:00'),
    excerpt: 'Tổng hợp ghi chú của lớp React & TypeScript kỳ trước.',
    tags: ['react', 'typescript']
  },
  {
    title: 'SQL cho người mới: 10 truy vấn cần thuộc lòng', slug: 'sql-cho-nguoi-moi',
    category: 'Lập trình cơ bản', author: 'Phạm Gia Huy', role: 'Giảng viên', status: 'draft', pinned: false,
    createdAt: at('2026-11-03', '09:30'), updatedAt: at('2026-11-06', '10:15'),
    excerpt: 'SELECT, JOIN, GROUP BY và các truy vấn nền tảng khi làm việc với dữ liệu.',
    tags: ['sql', 'database']
  },
  {
    title: 'Học nhóm hiệu quả cùng Study Room', slug: 'hoc-nhom-hieu-qua-study-room',
    category: 'Tài nguyên', author: 'Nguyễn Thu Hà', role: 'Biên tập viên', status: 'pending', pinned: false,
    createdAt: at('2026-11-04', '13:00'), updatedAt: at('2026-11-06', '15:30'),
    excerpt: 'Cách đặt mục tiêu, chia phiên học và theo dõi tiến độ với phòng học ảo của ThinkUp.',
    tags: ['study room', 'học nhóm']
  }
];

const THUMBS = [
  '/assets/content/posts/thumb-frontend.svg', '/assets/content/posts/thumb-code.svg',
  '/assets/content/posts/thumb-study.svg', '/assets/content/posts/thumb-career.svg',
  '/assets/content/posts/thumb-ux.svg', '/assets/content/posts/thumb-news.svg'
];

export const MOCK_CONTENT_POSTS: ContentPost[] = POST_SEEDS.map((seed, index) => ({
  id: `BV-${String(index + 1).padStart(3, '0')}`,
  title: seed.title,
  slug: seed.slug,
  category: seed.category,
  author: seed.author,
  authorRole: seed.role,
  tags: seed.tags,
  status: seed.status,
  excerpt: seed.excerpt,
  body: [
    seed.excerpt,
    'Nội dung chi tiết đang được biên tập theo tiêu chuẩn nội dung của ThinkUp, bao gồm ví dụ thực tế và phần tổng kết dành cho học viên.',
    'Bạn có thể để lại bình luận hoặc gửi câu hỏi cho đội ngũ biên tập nếu cần làm rõ thêm.'
  ],
  thumbnail: THUMBS[index % THUMBS.length],
  views: 420 + index * 137,
  commentCount: (index * 7) % 24,
  createdAt: seed.createdAt,
  updatedAt: seed.updatedAt,
  scheduledAt: seed.status === 'scheduled' ? at('2026-11-12', '08:00') : undefined,
  rejectionReason: seed.status === 'rejected' ? 'Thiếu nguồn số liệu và vi phạm quy định trích dẫn.' : undefined,
  featured: index % 6 === 0,
  pinned: seed.pinned
}));

interface CommentSeed {
  author: string;
  role: ContentComment['authorRole'];
  content: string;
  contextTitle: string;
  contextType: ContentComment['contextType'];
  status: ContentComment['status'];
  safety: ContentComment['safety'];
  reportCount: number;
  likes: number;
  replies: number;
  createdAt: string;
}

const COMMENT_SEEDS: CommentSeed[] = [
  {
    author: 'Nguyễn Văn A', role: 'Học viên', content: 'Cho em hỏi đoạn này có cần làm lại từ đầu không ạ?',
    contextTitle: 'Bài 3: Quy trình Tư duy Thiết kế', contextType: 'course', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 12, replies: 2, createdAt: at('2026-11-04', '09:12')
  },
  {
    author: 'Trần Thị B', role: 'Học viên', content: 'Tham gia nhóm kiếm tiền nhanh, liên hệ qua đường dẫn bên dưới để nhận ưu đãi.',
    contextTitle: 'Lộ trình học Data Analyst', contextType: 'blog', status: 'pending', safety: 'reported',
    reportCount: 3, likes: 0, replies: 1, createdAt: at('2026-11-04', '08:55')
  },
  {
    author: 'Lê Văn C', role: 'Học viên', content: 'Nhận tài khoản khóa học giá rẻ, liên hệ tại đường dẫn lạ.',
    contextTitle: 'Bài 5: State và Props trong React', contextType: 'course', status: 'pending', safety: 'reported',
    reportCount: 5, likes: 0, replies: 0, createdAt: at('2026-11-04', '08:40')
  },
  {
    author: 'Trần Quốc Bảo', role: 'Giảng viên', content: 'Nội dung bình luận có ngôn từ xúc phạm đã được đánh dấu để kiểm duyệt.',
    contextTitle: '5 kỹ năng cần có của Business Analyst', contextType: 'blog', status: 'hidden', safety: 'reported',
    reportCount: 2, likes: 2, replies: 4, createdAt: at('2026-11-03', '16:20')
  },
  {
    author: 'Phạm Minh Tuấn', role: 'Học viên', content: 'Quảng cáo liên tục, gửi cùng một liên kết đến nhiều bài học.',
    contextTitle: 'Bài 2: Cấu trúc HTML cơ bản', contextType: 'course', status: 'spam', safety: 'reported',
    reportCount: 4, likes: 0, replies: 0, createdAt: at('2026-11-03', '14:08')
  },
  {
    author: 'Nguyễn Minh Anh', role: 'Học viên', content: 'Phần Event Loop giải thích dễ hiểu hơn nhiều tài liệu khác, cảm ơn thầy!',
    contextTitle: 'Bài 4: Bất đồng bộ trong JavaScript', contextType: 'course', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 8, replies: 1, createdAt: at('2026-11-03', '10:05')
  },
  {
    author: 'Lê Thu Hà', role: 'Giảng viên', content: 'Các bạn có thể tải file bài tập ở phần tài nguyên của bài học nhé.',
    contextTitle: 'Bài 6: Component và Props', contextType: 'course', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 15, replies: 3, createdAt: at('2026-11-02', '15:22')
  },
  {
    author: 'Đỗ Mai Linh', role: 'Học viên', content: 'Mình thấy thông tin học phí chưa chính xác, cần cập nhật lại.',
    contextTitle: 'Học phí và chính sách hoàn tiền', contextType: 'blog', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 1, replies: 2, createdAt: at('2026-11-02', '11:40')
  },
  {
    author: 'Hoàng Nam', role: 'Học viên', content: 'Có nhóm học chung không ạ? Mình muốn tham gia cùng mọi người.',
    contextTitle: 'Roadmap học Data Analyst trong 6 tháng', contextType: 'blog', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 4, replies: 1, createdAt: at('2026-11-01', '09:18')
  },
  {
    author: 'Vũ Quốc Tuấn', role: 'Học viên', content: 'Mua quyền truy cập khóa học qua link ngoài giá rẻ hơn nhiều, ai cần ib.',
    contextTitle: 'Bài 1: Giới thiệu khóa React', contextType: 'course', status: 'hidden', safety: 'blocked',
    reportCount: 6, likes: 0, replies: 0, createdAt: at('2026-10-31', '20:10')
  },
  {
    author: 'Bùi Ngọc Hân', role: 'Học viên', content: 'Link tải tài liệu bị lỗi ạ, nhờ admin kiểm tra giúp em.',
    contextTitle: 'Bài 2: Cấu trúc HTML cơ bản', contextType: 'course', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 0, replies: 1, createdAt: at('2026-10-30', '08:45')
  },
  {
    author: 'Đặng Văn Khánh', role: 'Tác giả', content: 'Cảm ơn góp ý của các bạn, mình sẽ bổ sung ví dụ trong bản cập nhật tới.',
    contextTitle: 'Git và GitHub: làm việc nhóm hiệu quả', contextType: 'blog', status: 'visible', safety: 'clean',
    reportCount: 0, likes: 6, replies: 0, createdAt: at('2026-10-29', '17:35')
  }
];

export const MOCK_CONTENT_COMMENTS: ContentComment[] = COMMENT_SEEDS.map((seed, index) => {
  const post = MOCK_CONTENT_POSTS[index % MOCK_CONTENT_POSTS.length];
  return {
    id: `BL-${String(index + 1).padStart(3, '0')}`,
    postId: post.id,
    postTitle: post.title,
    contextTitle: seed.contextTitle,
    contextType: seed.contextType,
    author: seed.author,
    authorRole: seed.role,
    email: `${seed.author.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '.')}@gmail.com`,
    content: seed.content,
    status: seed.status,
    safety: seed.safety,
    reportCount: seed.reportCount,
    likeCount: seed.likes,
    replyCount: seed.replies,
    createdAt: seed.createdAt,
    moderationNote: seed.status === 'hidden' ? 'Ẩn do chứa thông tin liên hệ cá nhân.' : undefined
  };
});

interface ReviewSeed {
  learner: string;
  completion: number;
  date: string;
  course: string;
  instructor: string;
  rating: number;
  nps: number;
  tags: string[];
  status: ContentReview['status'];
  replied: boolean;
}

const REVIEW_SEEDS: ReviewSeed[] = [
  { learner: 'Nguyễn Văn A', completion: 42, date: '2026-11-04', course: 'React & TypeScript thực chiến', instructor: 'Trần Quốc Bảo', rating: 2, nps: 4, tags: ['Cần thêm thực hành', 'Ví dụ chưa rõ'], status: 'approved', replied: false },
  { learner: 'Lan Anh', completion: 12, date: '2026-11-04', course: 'Python Cơ Bản Cho Người Mới Bắt Đầu', instructor: 'Trần D', rating: 1, nps: 1, tags: ['Chưa đúng kỳ vọng'], status: 'approved', replied: false },
  { learner: 'Hoàng Nam', completion: 65, date: '2026-05-20', course: 'Python Cơ Bản Cho Người Mới Bắt Đầu', instructor: 'Trần D', rating: 4, nps: 9, tags: ['Nội dung dễ hiểu', 'Tài liệu chất lượng'], status: 'approved', replied: true },
  { learner: 'Trần Minh Hà', completion: 78, date: '2026-11-03', course: 'Thiết kế giao diện với Figma', instructor: 'Lê Thu Hà', rating: 5, nps: 10, tags: ['Giảng viên tận tâm'], status: 'hidden', replied: false },
  { learner: 'Phạm Quốc Tuấn', completion: 31, date: '2026-11-03', course: 'Data Analyst với SQL', instructor: 'Phạm Gia Huy', rating: 5, nps: 6, tags: ['Cần hỗ trợ thêm'], status: 'pending', replied: false },
  { learner: 'Đỗ Mai Linh', completion: 100, date: '2026-11-02', course: 'Kiểm thử phần mềm từ A–Z', instructor: 'Lê Thị Thu Hà', rating: 5, nps: 10, tags: ['Nội dung dễ hiểu', 'Ví dụ thực tế'], status: 'approved', replied: true },
  { learner: 'Lê Hải Đăng', completion: 56, date: '2026-11-02', course: 'Node.js: Xây dựng API', instructor: 'Trần Quốc Bảo', rating: 3, nps: 7, tags: ['Tốc độ hơi nhanh'], status: 'pending', replied: false },
  { learner: 'Nguyễn Minh Anh', completion: 92, date: '2026-11-01', course: 'Lập trình ứng dụng Flutter', instructor: 'Đỗ Minh Anh', rating: 4, nps: 8, tags: ['Tài liệu chất lượng'], status: 'approved', replied: true },
  { learner: 'Vũ Thảo Nguyên', completion: 84, date: '2026-10-31', course: 'React & TypeScript thực chiến', instructor: 'Trần Quốc Bảo', rating: 5, nps: 9, tags: ['Nhiều bài thực hành'], status: 'approved', replied: true },
  { learner: 'Bùi Ngọc Hân', completion: 8, date: '2026-10-30', course: 'DevOps: CI/CD căn bản', instructor: 'Hoàng Việt', rating: 1, nps: 3, tags: ['Chưa đúng kỳ vọng'], status: 'hidden', replied: false }
];

const REVIEW_TEXT = 'Mình đã hoàn thành phần lớn khóa học và thấy nội dung bám sát thực tế. Phần thực hành giúp mình tự tin hơn khi làm dự án. Mong trung tâm bổ sung thêm buổi hỏi đáp trực tiếp để giải đáp các câu hỏi khó.';
const INSTRUCTORS = ['Trần Quốc Bảo', 'Trần D', 'Lê Thu Hà', 'Phạm Gia Huy', 'Lê Thị Thu Hà', 'Đỗ Minh Anh', 'Hoàng Việt'];

export const MOCK_CONTENT_REVIEWS: ContentReview[] = REVIEW_SEEDS.map((seed, index) => ({
  id: `DG-${String(index + 1).padStart(3, '0')}`,
  courseId: `course-${index + 1}`,
  courseTitle: seed.course,
  instructor: seed.instructor || INSTRUCTORS[index % INSTRUCTORS.length],
  learner: seed.learner,
  learnerEmail: `${seed.learner.trim().split(/\s+/).slice(-2).join('').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')}@thinkup.vn`,
  completion: seed.completion,
  rating: seed.rating,
  nps: seed.nps,
  feedbackTags: seed.tags,
  title: seed.tags[0],
  content: REVIEW_TEXT,
  status: seed.status,
  helpfulCount: (index * 4) % 26,
  reportCount: seed.status === 'hidden' ? 1 : 0,
  createdAt: at(seed.date, index % 2 === 0 ? '09:30' : '16:10'),
  reply: seed.replied ? { content: 'Cảm ơn bạn đã chia sẻ. ThinkUp sẽ bổ sung buổi hỏi đáp trong tháng tới.', by: 'Trần Quốc Bảo', at: at(seed.date, '18:00') } : undefined,
  rejectionReason: seed.status === 'hidden' ? 'Chứa ngôn từ không phù hợp và thông tin cá nhân.' : undefined
}));

interface ReportSeed {
  code: string;
  type: ContentReport['type'];
  evidence: string;
  author: string;
  priorOffenses: number;
  reporter: string;
  reason: string;
  reportedAt: string;
  severity: ContentReport['severity'];
  status: ContentReport['status'];
}

const REPORT_SEEDS: ReportSeed[] = [
  { code: 'RP-2026-0182', type: 'Bình luận khóa học', evidence: '“Truy cập ngay link này để nhận quà free...”', author: 'Trần Minh K', priorOffenses: 1, reporter: 'Nguyễn Văn A', reason: 'Spam', reportedAt: at('2026-11-04', '10:15'), severity: 'critical', status: 'new' },
  { code: 'RP-2026-0181', type: 'Bài viết', evidence: '“Nội dung bài viết có dấu hiệu sao chép tài liệu khi chưa có sự cho phép.”', author: 'Phạm Gia Huy', priorOffenses: 2, reporter: 'Lê Hoàng Anh', reason: 'Vi phạm bản quyền', reportedAt: at('2026-11-04', '06:15'), severity: 'critical', status: 'processing' },
  { code: 'RP-2026-0180', type: 'Bình luận Blog', evidence: '“Bình luận có ngôn từ công kích cá nhân trong phần trao đổi của bài viết.”', author: 'Vũ Quốc Tuấn', priorOffenses: 0, reporter: 'Mai Phương', reason: 'Xúc phạm', reportedAt: at('2026-11-04', '06:00'), severity: 'medium', status: 'new' },
  { code: 'RP-2026-0179', type: 'Đánh giá', evidence: '“Mua quyền truy cập khóa học qua đường dẫn bên ngoài để nhận ưu đãi.”', author: 'Nguyễn Minh Hà', priorOffenses: 1, reporter: 'Trần Thị Hồng', reason: 'Dẫn link ngoài', reportedAt: at('2026-11-04', '07:15'), severity: 'critical', status: 'new' },
  { code: 'RP-2026-0178', type: 'Bình luận khóa học', evidence: '“Đăng lặp lại cùng một lời quảng cáo nhiều lần trong phần thảo luận bài học.”', author: 'Lê Văn C', priorOffenses: 0, reporter: 'Đỗ Mai Linh', reason: 'Quảng cáo rác', reportedAt: at('2026-11-04', '09:00'), severity: 'low', status: 'new' },
  { code: 'RP-2026-0177', type: 'Bài viết', evidence: '“Tiêu đề giật tít và nội dung không khớp với thông tin cam kết.”', author: 'Nguyễn Thu Hà', priorOffenses: 0, reporter: 'Lê Hải Đăng', reason: 'Thông tin sai lệch', reportedAt: at('2026-11-03', '16:40'), severity: 'medium', status: 'processing' },
  { code: 'RP-2026-0176', type: 'Đánh giá', evidence: '“Đánh giá có nội dung quảng cáo dịch vụ bên ngoài.”', author: 'Bùi Ngọc Hân', priorOffenses: 1, reporter: 'Nguyễn Minh Anh', reason: 'Quảng cáo rác', reportedAt: at('2026-11-03', '14:05'), severity: 'medium', status: 'resolved' },
  { code: 'RP-2026-0175', type: 'Bình luận Blog', evidence: '“Chia sẻ thông tin liên hệ cá nhân của người khác khi chưa được phép.”', author: 'Đặng Văn Khánh', priorOffenses: 0, reporter: 'Trần Thị B', reason: 'Xâm phạm quyền riêng tư', reportedAt: at('2026-11-02', '20:30'), severity: 'high', status: 'escalated' },
  { code: 'RP-2026-0174', type: 'Bình luận khóa học', evidence: '“Bình luận chỉ trích cá nhân giảng viên thay vì góp ý nội dung.”', author: 'Phạm Quốc Tuấn', priorOffenses: 0, reporter: 'Hoàng Nam', reason: 'Xúc phạm', reportedAt: at('2026-11-02', '11:12'), severity: 'medium', status: 'dismissed' },
  { code: 'RP-2026-0173', type: 'Bài viết', evidence: '“Bài viết chứa liên kết tải tài liệu không rõ nguồn gốc.”', author: 'Vũ Thảo Nguyên', priorOffenses: 0, reporter: 'Đỗ Mai Linh', reason: 'Dẫn link ngoài', reportedAt: at('2026-11-01', '09:45'), severity: 'low', status: 'resolved' }
];

export const MOCK_CONTENT_REPORTS: ContentReport[] = REPORT_SEEDS.map((seed, index) => ({
  id: `VP-${String(index + 1).padStart(3, '0')}`,
  code: seed.code,
  type: seed.type,
  targetId: seed.type === 'Bài viết' ? `BV-${String(index + 1).padStart(3, '0')}` : seed.type === 'Đánh giá' ? `DG-${String(index + 1).padStart(3, '0')}` : `BL-${String(index + 1).padStart(3, '0')}`,
  targetTitle: seed.evidence,
  targetAuthor: seed.author,
  priorOffenses: seed.priorOffenses,
  reportedBy: seed.reporter,
  reason: seed.reason,
  description: seed.evidence,
  evidenceSnippet: seed.evidence,
  severity: seed.severity,
  status: seed.status,
  createdAt: seed.reportedAt,
  slaDueAt: new Date(Date.parse(seed.reportedAt) + 4 * 3_600_000).toISOString(),
  assignee: seed.status === 'new' ? 'Chưa phân công' : index % 2 === 0 ? 'Nguyễn Thu Hà' : 'Trần Minh Khoa',
  evidence: [`Ảnh chụp nội dung: ${seed.code}`, 'Lịch sử chỉnh sửa của người đăng', 'Báo cáo liên quan trước đó'],
  resolutionNote: seed.status === 'resolved' ? 'Đã ẩn nội dung và gửi thông báo tới người đăng.' : undefined,
  resolvedAt: seed.status === 'resolved' ? at('2026-11-04', '12:00') : undefined
}));

export const MOCK_CONTENT_LOGS: ModerationLog[] = [
  { id: 'LOG-001', entity: 'Bài viết BV-001', action: 'Xuất bản', actor: 'ThinkUp Editorial', at: at('2026-11-04', '09:15') },
  { id: 'LOG-002', entity: 'Đánh giá DG-004', action: 'Tạm ẩn', actor: 'Trần Minh Khoa', at: at('2026-11-03', '17:20'), note: 'Chứa ngôn từ không phù hợp.' },
  { id: 'LOG-003', entity: 'Báo cáo VP-002', action: 'Đang điều tra', actor: 'Nguyễn Thu Hà', at: at('2026-11-03', '09:05'), note: 'Đã gửi yêu cầu bổ sung bằng chứng.' },
  { id: 'LOG-004', entity: 'Bình luận BL-004', action: 'Ẩn', actor: 'Nguyễn Thu Hà', at: at('2026-11-03', '16:30'), note: 'Chứa thông tin liên hệ cá nhân.' },
  { id: 'LOG-005', entity: 'Bài viết BV-010', action: 'Lên lịch', actor: 'ThinkUp Editorial', at: at('2026-11-05', '11:00') }
];
