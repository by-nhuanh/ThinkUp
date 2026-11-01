// TODO(pre-deploy): Nhớ xóa dữ liệu mock này khi thay bằng dữ liệu thật.
// Trang chủ thành viên hiện dựng theo Figma node 2950:10919 nên nội dung mẫu bám sát thiết kế.

export interface HeroSlide {
  id: string;
  greeting: string;
  name: string;
  question: string;
  quote: string;
  action: string;
  href: string;
}

export type LearningGlyph = 'react' | 'python' | 'js' | 'ts';

export interface MyLearningItem {
  id: string;
  glyph: string;
  glyphType: LearningGlyph;
  title: string;
  subtitle: string;
  tag: string;
  progress: number;
  nextLesson: string;
  href: string;
}

export interface RoadmapBanner {
  tag: string;
  title: string;
  description: string;
  action: string;
  href: string;
  progress: string;
  illustration: string;
}

export interface FeaturedCourseSeed {
  id: string;
  coverTitle: string;
  coverSubtitle: string;
  /** 'lg' dùng cho thẻ đầu tiên: tiêu đề 24/32 Extra Bold thay vì 20/28 Bold. */
  coverSize?: 'lg' | 'md';
  coverGradient: string;
  badge?: { text: string; tone: 'sale' | 'new' | 'hot' };
  title: string;
  author: string;
  level: string;
  rating: string;
  reviews: string;
  students: string;
  duration: string;
  tags: string[];
  salePrice: number;
  originalPrice: number;
  discount?: string;
}

export interface StreakDay {
  label: string;
  done: boolean;
}

export interface HeatmapStat {
  value: string;
  label: string;
}

export interface BenefitItem {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'morning',
    greeting: 'Chào buổi sáng,',
    name: 'Nguyễn Minh! 👋',
    question: 'Sẵn sàng học tập hôm nay?',
    quote: '"Học hôm nay, vững tương lai!"',
    action: 'Vào phòng học ảo',
    href: '/learning/study-room',
  },
];

export const MY_LEARNING_COURSES: MyLearningItem[] = [
  {
    id: 'reactjs',
    glyph: '⚛',
    glyphType: 'react',
    title: 'ReactJS',
    subtitle: 'từ cơ bản đến nâng cao',
    tag: 'LẬP TRÌNH',
    progress: 45,
    nextLesson: 'Bài học tiếp: State và Lifecycle\ntrong React',
    href: '/learning/reactjs',
  },
  {
    id: 'python',
    glyph: '🐍',
    glyphType: 'python',
    title: 'Python',
    subtitle: 'cho người mới bắt đầu',
    tag: 'LẬP TRÌNH',
    progress: 28,
    nextLesson: 'Bài học tiếp: Hàm (Functions)\ntrong Python',
    href: '/learning/python',
  },
  {
    id: 'javascript',
    glyph: 'JS',
    glyphType: 'js',
    title: 'JavaScript',
    subtitle: 'cơ bản cho người mới',
    tag: 'LẬP TRÌNH',
    progress: 60,
    nextLesson: 'Bài học tiếp: DOM Manipulation\nnâng cao',
    href: '/learning/javascript',
  },
  {
    id: 'javascript-dom',
    glyph: 'JS',
    glyphType: 'js',
    title: 'JavaScript',
    subtitle: 'DOM & Event Handling',
    tag: 'LẬP TRÌNH',
    progress: 60,
    nextLesson: 'Bài học tiếp: Xây dựng Todo\nApp với DOM',
    href: '/learning/javascript-dom',
  },
  {
    id: 'react-typescript',
    glyph: '⚛',
    glyphType: 'react',
    title: 'React + TypeScript',
    subtitle: 'Thực Chiến',
    tag: 'LẬP TRÌNH',
    progress: 32,
    nextLesson: 'Bài học tiếp: Props & State\nvới TypeScript',
    href: '/learning/react-typescript',
  },
];

export const ROADMAP_BANNER: RoadmapBanner = {
  tag: '✦  LỘ TRÌNH CÁ NHÂN HÓA',
  title: 'Mỗi chặng học, một bước gần hơn tới mục tiêu',
  description:
    'Bạn đã hoàn thành 60% lộ trình Frontend Developer. Tiếp tục chặng JavaScript để duy trì đà học tập.',
  action: 'Tiếp tục lộ trình của bạn  →',
  href: '/roadmap',
  progress: '60% hoàn thành  •  Chuỗi 7 ngày',
  illustration: '/assets/home/learning-journey.svg',
};

export const FEATURED_COURSES: FeaturedCourseSeed[] = [
  {
    id: 'uiux-design',
    coverTitle: 'UI/UX Design\nToàn tập',
    coverSubtitle: '',
    coverSize: 'lg',
    coverGradient: 'linear-gradient(164deg, #0092b8 0%, #005f78 100%)',
    badge: { text: 'SALE', tone: 'sale' },
    title: 'UI/UX Design Toàn tập - Từ tư duy đến thiết kế sản phẩm',
    author: 'Phạm Thị D',
    level: 'Trung cấp',
    rating: '4.6',
    reviews: '(756)',
    students: '6,543 học viên',
    duration: '14 giờ 20 phút',
    tags: ['UI/UX', 'Figma', 'Design'],
    salePrice: 599000,
    originalPrice: 1000000,
    discount: '-40%',
  },
  {
    id: 'node-express',
    coverTitle: 'Node.js & Express',
    coverSubtitle: 'Xây dựng RESTful API\nchuyên nghiệp',
    coverGradient: 'linear-gradient(164deg, #0a1535 0%, #1a2a5e 100%)',
    badge: { text: 'NEW', tone: 'new' },
    title: 'Node.js & Express - Xây dựng RESTful API chuyên nghiệp',
    author: 'Hoàng Văn E',
    level: 'Trung cấp',
    rating: '4.5',
    reviews: '(612)',
    students: '4,321 học viên',
    duration: '16 giờ 10 phút',
    tags: ['Node.js', 'Express', 'Backend'],
    salePrice: 549000,
    originalPrice: 900000,
    discount: '-39%',
  },
  {
    id: 'docker-kubernetes',
    coverTitle: 'Docker & Kubernetes',
    coverSubtitle: 'Triển khai ứng dụng\nhiện đại',
    coverGradient: 'linear-gradient(164deg, #2a1560 0%, #4a2590 100%)',
    badge: { text: 'HOT', tone: 'hot' },
    title: 'Docker & Kubernetes - Triển khai ứng dụng hiện đại',
    author: 'Đỗ Văn F',
    level: 'Nâng cao',
    rating: '4.8',
    reviews: '(934)',
    students: '7,890 học viên',
    duration: '20 giờ 5 phút',
    tags: ['DevOps', 'Docker', 'Kubernetes'],
    salePrice: 799000,
    originalPrice: 1300000,
    discount: '-39%',
  },
  {
    id: 'nextjs',
    coverTitle: 'Next.js',
    coverSubtitle: 'Xây dựng ứng dụng\nReact toàn diện',
    coverGradient: 'linear-gradient(164deg, #0a1628 0%, #0f2a44 100%)',
    badge: { text: 'NEW', tone: 'new' },
    title: 'Next.js - Xây dựng ứng dụng React toàn diện',
    author: 'Phan Văn L',
    level: 'Nâng cao',
    rating: '4.8',
    reviews: '(822)',
    students: '8,321 học viên',
    duration: '21 giờ 30 phút',
    tags: ['Next.js', 'React', 'SSR'],
    salePrice: 699000,
    originalPrice: 1200000,
    discount: '-42%',
  },
  {
    id: 'data-sql',
    coverTitle: 'Data Analysis',
    coverSubtitle: 'with SQL',
    coverGradient: 'linear-gradient(159deg, #4c1d95 0%, #6d28d9 100%)',
    title: 'Data Analysis with SQL - Phân tích dữ liệu chuyên sâu',
    author: 'Mai Thị M',
    level: 'Trung cấp',
    rating: '4.6',
    reviews: '(587)',
    students: '4,156 học viên',
    duration: '12 giờ 10 phút',
    tags: ['SQL', 'Database', 'Data Science'],
    salePrice: 479000,
    originalPrice: 800000,
  },
];

export const STREAK_DAYS: StreakDay[] = [
  { label: 'T2', done: true },
  { label: 'T3', done: true },
  { label: 'T4', done: true },
  { label: 'T5', done: true },
  { label: 'T6', done: true },
  { label: 'T7', done: true },
  { label: 'CN', done: true },
];

export const STREAK_COUNT = 7;

export const HEATMAP_WEEKS = 28;

/** 28 tuần x 7 ngày, mức hoạt động 0-4 (0 = không học). */
export const HEATMAP_LEVELS: number[] = (() => {
  const seed = [1, 0, 2, 3, 0, 1, 4, 2, 0, 1, 1, 3, 0, 2, 4, 1, 0, 1, 2, 2, 3, 0, 1, 4, 2, 1, 0, 3];
  const levels: number[] = [];
  for (let week = 0; week < HEATMAP_WEEKS; week++) {
    for (let day = 0; day < 7; day++) {
      const base = seed[(week * 3 + day * 5) % seed.length];
      const decay = week > HEATMAP_WEEKS - 4 ? 1 : 0;
      levels.push(day === 6 && base < 2 ? 0 : Math.min(4, base + decay));
    }
  }
  return levels;
})();

export const HEATMAP_STATS: HeatmapStat[] = [
  { value: '42 ngày', label: 'Có hoạt động' },
  { value: '18,5 giờ', label: 'Tổng thời gian' },
];

export const BENEFITS: BenefitItem[] = [
  { id: 'anywhere', icon: 'monitor', title: 'Học mọi lúc, mọi nơi', subtitle: 'Trên mọi thiết bị' },
  { id: 'teachers', icon: 'graduation-cap', title: 'Giảng viên chất lượng', subtitle: 'Chuyên gia hàng đầu' },
  { id: 'community', icon: 'users', title: 'Cộng đồng học viên', subtitle: 'Hỗ trợ và chia sẻ' },
  { id: 'certificate', icon: 'award', title: 'Chứng chỉ uy tín', subtitle: 'Nâng tầm sự nghiệp' },
];



