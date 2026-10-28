import { UserProfile, LearningStat, CurrentCourse, Achievement, RecentActivity, Certificate } from '../../models/profile.model';

// TODO(pre-deploy): Nhớ xóa dữ liệu hồ sơ, thống kê, khóa học và hoạt động mock bên dưới khi có API thật.
export const MOCK_PROFILE: UserProfile = {
  name: 'Nguyễn An Nhiên',
  firstName: 'Nhiên',
  lastName: 'Nguyễn An',
  email: 'annhien.nguyen@email.com',
  phone: '0912345621',
  headline: 'Học viên Chuyên sâu Frontend & UI/UX Design',
  location: 'Hồ Chí Minh, Việt Nam',
  joinedAt: '15/03/2022',
  avatarUrl: '/assets/profile/overview-avatar.png',
  gender: 'Nữ',
  birthDate: '15/08/2002',
  bio: 'Đam mê lập trình Web hiện đại với Angular và thiết kế trải nghiệm người dùng tối ưu.',
  facebook: 'annhien.thinkup',
  linkedin: 'annhien-nguyen',
  x: 'annhien_frontend',
  youtube: '@annhiencoding',
  github: 'annhien-dev',
  portfolio: 'annhien.dev',
  maskedEmail: 'a••••••@email.com',
  maskedPhone: '0••• ••• ••21',
};

export const MOCK_LEARNING_STATS: LearningStat[] = [
  { key: 'enrolled', value: 47, label: 'Khóa đã ghi danh', tone: 'blue' },
  { key: 'completed', value: 32, label: 'Khóa đã hoàn thành', tone: 'green' },
  { key: 'streak', value: 15, label: 'Chuỗi đạt được (ngày)', tone: 'orange' },
  { key: 'awards', value: 12, label: 'Thành tích và huy hiệu tích lũy', tone: 'sky' },
];

export const MOCK_CURRENT_COURSES: CurrentCourse[] = [
  {
    id: 'javascript',
    category: 'Lập trình',
    instructor: 'Lê Thị Bích',
    title: 'Lập trình Web với JavaScript',
    progress: 75,
    nextLesson: 'Tiếp theo: Chương 8 — Async/Await',
    image: '/assets/profile/course-javascript.png',
    href: '/main/courses',
  },
  {
    id: 'uiux',
    category: 'Thiết kế',
    instructor: 'Trần Văn Cường',
    title: 'Thiết kế Giao diện Người dùng (UI/UX)',
    progress: 50,
    nextLesson: 'Tiếp theo: Bài 12 — Hệ thống màu',
    image: '/assets/profile/course-uiux.png',
    href: '/main/courses',
  },
  {
    id: 'python',
    category: 'Dữ liệu',
    instructor: 'Phạm Thị Dung',
    title: 'Python cho Khoa học Dữ liệu',
    progress: 90,
    nextLesson: 'Tiếp theo: Bài cuối — Dự án Capstone',
    image: '/assets/profile/course-python.png',
    href: '/main/courses',
  },
];

export const MOCK_COMPLETED_COURSES: CurrentCourse[] = [
  {
    id: 'js-basic',
    category: 'Lập trình',
    instructor: 'Lê Thị Bích',
    title: 'Cơ bản về JavaScript',
    progress: 100,
    nextLesson: 'Hoàn thành ngày 03/10/2026',
    image: '/assets/profile/course-javascript.png',
    href: '/main/courses',
  },
  {
    id: 'uiux-basic',
    category: 'Thiết kế',
    instructor: 'Trần Văn Cường',
    title: 'Nguyên lý thiết kế trải nghiệm',
    progress: 100,
    nextLesson: 'Hoàn thành ngày 12/10/2026',
    image: '/assets/profile/course-uiux.png',
    href: '/main/courses',
  },
  {
    id: 'python-basic',
    category: 'Dữ liệu',
    instructor: 'Phạm Thị Dung',
    title: 'Python cơ bản',
    progress: 100,
    nextLesson: 'Hoàn thành ngày 17/10/2026',
    image: '/assets/profile/course-python.png',
    href: '/main/courses',
  },
];

export const MOCK_CERTIFICATES: Certificate[] = [
  { id: 'python', title: 'Chứng chỉ Python cơ bản', issuedAt: '17/10/2026' },
  { id: 'uiux', title: 'Thiết kế giao diện UI/UX', issuedAt: '12/10/2026' },
  { id: 'javascript', title: 'Lập trình Web với JavaScript', issuedAt: '05/10/2026' },
];

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  { key: 'excellent', title: 'Học viên xuất sắc', subtitle: 'Năm 2024', tone: 'amber' },
  { key: 'python', title: 'Chuyên gia Python', subtitle: 'Khóa 12/2023', tone: 'blue' },
  { key: 'speed', title: 'Bứt phá tốc độ', subtitle: 'Khóa 09/2023', tone: 'sky' },
  { key: 'streak', title: 'Streak 30 ngày', subtitle: 'Tháng 11/2023', tone: 'red' },
  { key: 'complete', title: 'Hoàn thành 100%', subtitle: 'Khóa 08/2023', tone: 'green' },
  { key: 'graduate', title: 'Tốt nghiệp lộ trình', subtitle: 'Khóa 05/2023', tone: 'indigo' },
];

export const MOCK_RECENT_ACTIVITIES: RecentActivity[] = [
  { key: 'start', time: 'Hôm nay, 10:30', text: 'Bắt đầu học khóa “Lập trình Web với JavaScript”', tone: 'blue' },
  { key: 'badge', time: 'Hôm qua, 15:15', text: 'Nhận huy hiệu “Chuyên gia Python”', tone: 'amber' },
  { key: 'progress', time: '2 ngày trước, 09:00', text: 'Tiến bộ 15% trong khóa “Thiết kế UI/UX”', tone: 'green' },
  { key: 'finish', time: '3 ngày trước, 17:00', text: 'Hoàn thành khóa “Cơ bản về JavaScript”', tone: 'sky' },
  { key: 'joined', time: '15/03/2022', text: 'Tham gia ThinkUp', tone: 'green' },
];

export const MOCK_ROADMAP_PROGRESS = 68;
export const MOCK_TOTAL_AWARDS = 12;
export const MOCK_TOTAL_CERTIFICATES = 7;
export const MOCK_TOTAL_COMPLETED_COURSES = 7;
