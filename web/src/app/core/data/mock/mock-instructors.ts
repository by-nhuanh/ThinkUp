// TODO(pre-deploy): Nhớ xóa dữ liệu mock giảng viên này khi có API hồ sơ giảng viên thật.
import { Instructor } from '../../models/instructor.model';

const AVATAR_TEACHING = '/assets/instructor-application/avatar-4.png';
const AVATAR_MALE = '/assets/instructor-application/avatar-2.png';
const AVATAR_FEMALE_1 = '/assets/instructor-application/avatar-1.png';
const AVATAR_FEMALE_2 = '/assets/instructor-application/avatar-3.png';

export const MOCK_INSTRUCTORS: Instructor[] = [
  {
    id: 'dang-van-anh-tai',
    name: 'Đặng Văn Anh Tài',
    title: 'Senior Frontend Tech Lead & System Architect tại Tập đoàn Công nghệ Toàn Cầu',
    bio: 'Giảng viên có hơn 7 năm kinh nghiệm thực chiến trong lĩnh vực phát triển phần mềm và xây dựng ứng dụng Web quy mô lớn. Sở trường chuyên môn gồm ReactJS, TypeScript, Next.js, Micro-frontend và kiến trúc hệ thống. Từng đảm nhiệm vai trò Tech Lead, tư vấn chiến lược và dẫn dắt đội ngũ phát triển sản phẩm.',
    location: 'Hồ Chí Minh',
    joinedAt: '03/2022',
    avatar: AVATAR_TEACHING,
    initials: 'T',
    rating: 4.9,
    reviewsCount: 2100,
    studentsCount: 12345,
    coursesCount: 15,
    experience: [
      'Tech Lead tại Unicon Technology (2020–2023)',
      'Senior Frontend Developer tại TDP Corp (2018–2020)',
      'Thạc sĩ Khoa học Máy tính, ĐH Quốc gia TP.HCM',
      'Cử nhân Công nghệ Thông tin, ĐH Bách Khoa',
    ],
    expertise: ['TypeScript', 'ReactJS', 'Next.js', 'Node.js', 'Tailwind CSS', 'Micro-frontend', 'System Architecture'],
    socials: {
      github: 'https://github.com',
      linkedin: 'https://www.linkedin.com',
    },
  },
  {
    id: 'le-van-c',
    name: 'Lê Văn C',
    title: 'Senior Data Scientist & Machine Learning Engineer',
    bio: 'Hơn 8 năm làm việc với dữ liệu lớn, xây dựng pipeline phân tích và triển khai mô hình học máy cho doanh nghiệp. Giảng viên luôn gắn lý thuyết với bài toán thực tế để học viên có thể áp dụng ngay vào công việc.',
    location: 'Hà Nội',
    joinedAt: '06/2021',
    initials: 'C',
    rating: 4.9,
    reviewsCount: 2100,
    studentsCount: 15678,
    coursesCount: 6,
    experience: [
      'Data Science Lead tại VietData Analytics (2019–nay)',
      'Machine Learning Engineer tại FPT AI Center (2016–2019)',
      'Thạc sĩ Khoa học Dữ liệu, ĐH Bách Khoa Hà Nội',
    ],
    expertise: ['Python', 'Pandas', 'Scikit-learn', 'SQL', 'Machine Learning', 'Data Visualization'],
  },
  {
    id: 'ly-thi-k',
    name: 'Lý Thị K',
    title: 'Principal Angular Engineer & Frontend Mentor',
    bio: 'Chuyên gia Angular với nhiều năm dẫn dắt các dự án enterprise quy mô lớn. Giảng viên tập trung vào tư duy kiến trúc, quản lý state và kỹ năng review code để học viên sẵn sàng làm việc trong đội ngũ chuyên nghiệp.',
    location: 'Đà Nẵng',
    joinedAt: '09/2020',
    initials: 'K',
    rating: 4.8,
    reviewsCount: 654,
    studentsCount: 4590,
    coursesCount: 4,
    experience: [
      'Principal Frontend Engineer tại VNG Corporation (2018–nay)',
      'Frontend Team Lead tại Gameloft Đà Nẵng (2015–2018)',
      'Cử nhân Khoa học Máy tính, ĐH Đà Nẵng',
    ],
    expertise: ['Angular', 'TypeScript', 'RxJS', 'NgRx', 'Testing', 'Web Performance'],
  },
  {
    id: 'phan-van-l',
    name: 'Phan Văn L',
    title: 'Fullstack Engineer & Next.js Specialist',
    bio: 'Đã xây dựng và vận hành nhiều sản phẩm SaaS bằng Next.js và Node.js. Giảng viên hướng dẫn học viên từ kiến trúc dự án, tối ưu SEO đến quy trình triển khai production.',
    location: 'Hồ Chí Minh',
    joinedAt: '01/2023',
    initials: 'L',
    rating: 4.8,
    reviewsCount: 822,
    studentsCount: 8321,
    coursesCount: 5,
    experience: [
      'Senior Fullstack Engineer tại Kobiton (2019–nay)',
      'Web Developer tại TMA Solutions (2016–2019)',
      'Cử nhân Công nghệ Thông tin, ĐH Công nghệ TP.HCM',
    ],
    expertise: ['Next.js', 'React', 'Node.js', 'SSR', 'SEO', 'Tailwind CSS'],
  },
  {
    id: 'vo-thi-g',
    name: 'Võ Thị G',
    title: 'Mobile Solution Architect (Flutter)',
    bio: 'Nhiều năm phát triển ứng dụng mobile đa nền tảng cho thị trường Việt Nam và quốc tế. Giảng viên chú trọng trải nghiệm người dùng, hiệu năng và quy trình phát hành ứng dụng lên store.',
    location: 'Cần Thơ',
    joinedAt: '11/2021',
    avatar: AVATAR_FEMALE_1,
    initials: 'G',
    rating: 4.7,
    reviewsCount: 645,
    studentsCount: 5432,
    coursesCount: 4,
    experience: [
      'Mobile Architect tại Zalo Pay (2020–nay)',
      'Flutter Developer tại VNPAY (2018–2020)',
      'Kỹ sư Phần mềm, ĐH Cần Thơ',
    ],
    expertise: ['Flutter', 'Dart', 'Firebase', 'Mobile UI', 'CI/CD', 'App Store Deployment'],
  },
  {
    id: 'ngo-van-h',
    name: 'Ngô Văn H',
    title: 'AI Research Engineer & Lecturer',
    bio: 'Nghiên cứu và triển khai các mô hình học sâu trong xử lý ngôn ngữ tự nhiên và thị giác máy tính. Giảng viên mang đến góc nhìn thực tế về dữ liệu, huấn luyện mô hình và đánh giá chất lượng AI.',
    location: 'Hà Nội',
    joinedAt: '04/2020',
    initials: 'H',
    rating: 4.9,
    reviewsCount: 1500,
    studentsCount: 11234,
    coursesCount: 7,
    experience: [
      'AI Research Engineer tại VinAI (2019–nay)',
      'Data Scientist tại Viettel Solutions (2016–2019)',
      'Tiến sĩ Khoa học Máy tính, ĐH Quốc gia Hà Nội',
    ],
    expertise: ['Python', 'PyTorch', 'NLP', 'Computer Vision', 'Deep Learning', 'MLOps'],
  },
  {
    id: 'mai-thi-m',
    name: 'Mai Thị M',
    title: 'Data Analyst Lead & SQL Mentor',
    bio: 'Hơn 6 năm phân tích dữ liệu cho các ngành thương mại điện tử và tài chính. Giảng viên giúp học viên viết truy vấn hiệu quả, đọc đúng số liệu và kể câu chuyện dữ liệu có sức thuyết phục.',
    location: 'Hồ Chí Minh',
    joinedAt: '08/2022',
    avatar: AVATAR_FEMALE_2,
    initials: 'M',
    rating: 4.7,
    reviewsCount: 587,
    studentsCount: 4156,
    coursesCount: 3,
    experience: [
      'Data Analyst Lead tại Shopee Việt Nam (2020–nay)',
      'Business Intelligence Analyst tại Ngân hàng ACB (2017–2020)',
      'Cử nhân Hệ thống Thông tin, ĐH Kinh tế TP.HCM',
    ],
    expertise: ['SQL', 'Power BI', 'Data Analysis', 'Data Modeling', 'Excel', 'Dashboard'],
  },
  {
    id: 'hoang-van-k',
    name: 'Hoàng Văn K',
    title: 'Backend Engineer & API Architect',
    bio: 'Xây dựng hệ thống backend chịu tải cao và thiết kế API cho nhiều sản phẩm fintech. Giảng viên hướng dẫn học viên từ mô hình dữ liệu, bảo mật đến kiểm thử và triển khai dịch vụ.',
    location: 'Hồ Chí Minh',
    joinedAt: '02/2023',
    initials: 'K',
    rating: 4.6,
    reviewsCount: 312,
    studentsCount: 312,
    coursesCount: 2,
    experience: [
      'Senior Backend Engineer tại MoMo (2021–nay)',
      'Backend Developer tại Tiki (2018–2021)',
      'Cử nhân Công nghệ Thông tin, ĐH Bách Khoa TP.HCM',
    ],
    expertise: ['Node.js', 'Express', 'MongoDB', 'REST API', 'Authentication', 'Docker'],
  },
  {
    id: 'nguyen-van-a',
    name: 'Nguyễn Văn A',
    title: 'Senior Frontend Engineer & UI Systems Mentor',
    bio: 'Chuyên xây dựng design system và giao diện web hiệu năng cao. Giảng viên tập trung vào nền tảng JavaScript, React và thói quen viết code dễ bảo trì cho học viên mới.',
    location: 'Hồ Chí Minh',
    joinedAt: '05/2021',
    avatar: AVATAR_MALE,
    initials: 'A',
    rating: 4.8,
    reviewsCount: 1200,
    studentsCount: 12345,
    coursesCount: 3,
    experience: [
      'Senior Frontend Engineer tại KMS Technology (2019–nay)',
      'Frontend Developer tại NashTech (2016–2019)',
      'Cử nhân Công nghệ Phần mềm, ĐH Công nghệ TP.HCM',
    ],
    expertise: ['JavaScript', 'React', 'Design System', 'Accessibility', 'CSS', 'Web Performance'],
  },
  {
    id: 'tran-thi-b',
    name: 'Trần Thị B',
    title: 'JavaScript Engineer & Frontend Trainer',
    bio: 'Có nhiều năm làm việc với các ứng dụng web tương tác và hệ thống component dùng chung. Giảng viên giúp học viên nắm chắc ES6+, bất đồng bộ và kỹ năng gỡ lỗi thực tế.',
    location: 'Hà Nội',
    joinedAt: '07/2021',
    avatar: AVATAR_FEMALE_1,
    initials: 'B',
    rating: 4.7,
    reviewsCount: 892,
    studentsCount: 8765,
    coursesCount: 2,
    experience: [
      'Frontend Engineer tại Base.vn (2020–nay)',
      'Web Developer tại VCCorp (2017–2020)',
      'Cử nhân Công nghệ Thông tin, ĐH Quốc gia Hà Nội',
    ],
    expertise: ['JavaScript', 'ES6+', 'Async Programming', 'Testing', 'Vite', 'Frontend Architecture'],
  },
  {
    id: 'tran-minh-hieu',
    name: 'Trần Minh Hiếu',
    title: 'Senior Python Developer',
    bio: 'Phát triển các dịch vụ backend bằng Python và hướng dẫn học viên xây dựng nền tảng lập trình vững chắc. Giảng viên chú trọng thực hành, đọc lỗi và tư duy giải quyết vấn đề.',
    location: 'Đà Nẵng',
    joinedAt: '10/2021',
    avatar: AVATAR_MALE,
    initials: 'H',
    rating: 4.8,
    reviewsCount: 730,
    studentsCount: 6120,
    coursesCount: 4,
    experience: [
      'Senior Python Developer tại Oriental Tech (2019–nay)',
      'Backend Developer tại Enclave (2016–2019)',
      'Kỹ sư Công nghệ Thông tin, ĐH Bách Khoa Đà Nẵng',
    ],
    expertise: ['Python', 'Django', 'FastAPI', 'PostgreSQL', 'REST API', 'Unit Testing'],
  },
  {
    id: 'le-thi-bich',
    name: 'Lê Thị Bích',
    title: 'Frontend Developer & JavaScript Mentor',
    bio: 'Đồng hành cùng học viên trong các khóa lập trình web nền tảng. Giảng viên có cách giải thích trực quan, nhiều ví dụ gần gũi và luôn khuyến khích học viên tự tay làm dự án nhỏ.',
    location: 'Hồ Chí Minh',
    joinedAt: '03/2022',
    avatar: AVATAR_FEMALE_2,
    initials: 'B',
    rating: 4.7,
    reviewsCount: 420,
    studentsCount: 3890,
    coursesCount: 3,
    experience: [
      'Frontend Developer tại ThoughtWorks Việt Nam (2021–nay)',
      'Web Developer tại CMC Global (2018–2021)',
      'Cử nhân Công nghệ Thông tin, ĐH Khoa học Tự nhiên TP.HCM',
    ],
    expertise: ['JavaScript', 'HTML/CSS', 'DOM', 'Responsive Web', 'Git', 'Problem Solving'],
  },
  {
    id: 'tran-van-cuong',
    name: 'Trần Văn Cường',
    title: 'Product Designer & UI/UX Lead',
    bio: 'Thiết kế sản phẩm số cho các ứng dụng tài chính và giáo dục. Giảng viên hướng dẫn quy trình từ nghiên cứu người dùng, wireframe đến xây dựng design system và bàn giao cho đội phát triển.',
    location: 'Hồ Chí Minh',
    joinedAt: '12/2021',
    avatar: AVATAR_MALE,
    initials: 'C',
    rating: 4.6,
    reviewsCount: 315,
    studentsCount: 2450,
    coursesCount: 2,
    experience: [
      'UI/UX Lead tại Finhay (2020–nay)',
      'Product Designer tại Topica (2017–2020)',
      'Cử nhân Thiết kế Đồ họa, ĐH Mỹ thuật TP.HCM',
    ],
    expertise: ['Figma', 'UX Research', 'Design System', 'Prototyping', 'Wireframe', 'Usability Testing'],
  },
  {
    id: 'pham-thi-dung',
    name: 'Phạm Thị Dung',
    title: 'Data Analyst & Python Instructor',
    bio: 'Làm việc với dữ liệu trong lĩnh vực giáo dục và thương mại điện tử. Giảng viên giúp học viên làm quen Python, xử lý dữ liệu và xây dựng báo cáo phục vụ ra quyết định.',
    location: 'Hà Nội',
    joinedAt: '02/2022',
    avatar: AVATAR_FEMALE_1,
    initials: 'D',
    rating: 4.8,
    reviewsCount: 260,
    studentsCount: 1980,
    coursesCount: 2,
    experience: [
      'Data Analyst tại VNPT Media (2021–nay)',
      'Business Analyst tại Viettel Post (2018–2021)',
      'Cử nhân Kinh tế lượng, ĐH Kinh tế Quốc dân',
    ],
    expertise: ['Python', 'Pandas', 'Data Cleaning', 'Statistics', 'Reporting', 'SQL'],
  },
];

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();

const INSTRUCTOR_BY_ID = new Map(MOCK_INSTRUCTORS.map(item => [item.id, item]));
const INSTRUCTOR_BY_NAME = new Map(MOCK_INSTRUCTORS.map(item => [normalize(item.name), item]));
const INSTRUCTOR_BY_SLUG = new Map(
  MOCK_INSTRUCTORS.map(item => [normalize(item.name).replace(/\s+/g, '-'), item])
);

/** Tra cứu hồ sơ giảng viên bằng id, slug hoặc tên đầy đủ (không phân biệt hoa thường/dấu tiếng Việt). */
export function findMockInstructor(ref: string | null | undefined): Instructor | null {
  if (!ref) return null;
  const direct = INSTRUCTOR_BY_ID.get(ref);
  if (direct) return direct;

  const key = normalize(ref);
  return INSTRUCTOR_BY_NAME.get(key) || INSTRUCTOR_BY_SLUG.get(key.replace(/\s+/g, '-')) || null;
}
