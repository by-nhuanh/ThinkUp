// TODO(pre-deploy): Nhớ xóa danh sách khóa học đã ghi danh mock khi có API thật.
import { EnrolledCourse } from '../../models/course.model';

export const MOCK_ENROLLED_COURSES: EnrolledCourse[] = [
  {
    id: 'reactjs',
    title: 'ReactJS - Từ cơ bản đến nâng cao',
    instructor: 'Nguyễn Văn A',
    totalLessons: 45,
    completedLessons: 20,
    coverTitle: 'ReactJS',
    coverSubtitle: 'Chinh phục Frontend hiện đại',
    cover: '#0A1535',
    badge: 'HOT',
    lastStudiedAt: 'Hôm qua'
  },
  {
    id: 'python-co-ban',
    title: 'Python Cơ Bản Cho Người Mới Bắt Đầu',
    instructor: 'Trần Minh Hiếu',
    totalLessons: 15,
    completedLessons: 5,
    coverTitle: 'Python',
    coverSubtitle: 'Nền tảng lập trình vững chắc',
    cover: '#061543',
    badge: 'MỚI',
    lastStudiedAt: 'Hôm nay'
  },
  {
    id: 'python-data',
    title: 'Python for Data Science - Phân tích dữ liệu thực chiến',
    instructor: 'Lê Văn C',
    totalLessons: 60,
    completedLessons: 15,
    coverTitle: 'Python Data',
    coverSubtitle: 'Thống kê & Machine Learning',
    cover: '#1E293B',
    lastStudiedAt: '3 ngày trước'
  },
  {
    id: 'javascript-es6',
    title: 'JavaScript ES6+ - Nâng cao kỹ năng lập trình',
    instructor: 'Trần Thị B',
    totalLessons: 32,
    completedLessons: 32,
    coverTitle: 'JS ES6+',
    coverSubtitle: 'Tối ưu code chuyên nghiệp',
    cover: '#F7DF1E',
    badge: 'HOÀN THÀNH',
    lastStudiedAt: '1 tuần trước'
  }
];
