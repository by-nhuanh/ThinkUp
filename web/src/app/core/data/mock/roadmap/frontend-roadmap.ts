// TODO(pre-deploy): Nhớ xóa dữ liệu mock lộ trình Frontend khi backend trả về danh mục Node kỹ năng thật.
// Nội dung bám theo thiết kế Figma (Roadmap01/04/05) và bảng trạng thái Node trong đặc tả Roadmap.
import {
  RoadmapDetail,
  RoadmapDifficulty,
  RoadmapSkill,
  RoadmapSkillStatus,
  RoadmapStage,
  RoadmapStageIcon
} from '../../../../features/roadmap/models/roadmap.model';

const FE_COURSES = {
  base: ['javascript-es6', 'reactjs'],
  react: ['reactjs', 'nextjs'],
  ui: ['uiux-design', 'javascript-es6'],
  framework: ['nextjs', 'reactjs'],
  data: ['nodejs', 'sql-data']
};

interface SkillSeed {
  id: string;
  title: string;
  desc: string;
  summary: string;
  difficulty: RoadmapDifficulty;
  type: string;
  outcomes: string[];
  prerequisites: string[];
  next?: string | null;
  courseIds?: string[];
  status?: RoadmapSkillStatus;
  mastery?: number;
}

interface StageSeed {
  number: number;
  name: string;
  desc: string;
  icon: RoadmapStageIcon;
  tint: string;
  accent: string;
  skills: SkillSeed[];
}

const STAGE_SEEDS: StageSeed[] = [
  {
    number: 1,
    name: 'Foundation',
    desc: 'Nắm vững nền tảng máy tính, internet và logic lập trình cơ bản.',
    icon: 'foundation',
    tint: '#E6F4FF',
    accent: '#0088E8',
    skills: [
      {
        id: 'computer-science-basics',
        title: 'Computer Science Basics',
        desc: 'Kiến trúc máy tính, hệ điều hành và cách dữ liệu được biểu diễn.',
        summary:
          'Trước khi viết dòng code đầu tiên, bạn cần hiểu máy tính vận hành ra sao: CPU, bộ nhớ, hệ điều hành và cách dữ liệu được mã hoá. Đây là nền tảng giúp bạn đọc hiểu lỗi, gỡ rối và học ngôn ngữ mới nhanh hơn.',
        difficulty: 'Cơ bản',
        type: 'Nền tảng',
        outcomes: [
          'Hiểu kiến trúc CPU, RAM và hệ điều hành.',
          'Phân biệt nhị phân, hex và unicode.',
          'Nắm cách trình duyệt tải và render một trang web.',
          'Tư duy logic và ước lượng độ phức tạp thuật toán.'
        ],
        prerequisites: ['Sử dụng máy tính thành thạo', 'Tư duy logic cơ bản'],
        next: 'web-foundation',
        courseIds: FE_COURSES.base,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'web-foundation',
        title: 'Web Foundation',
        desc: 'Internet, HTTP, DNS và cách trình duyệt hoạt động.',
        summary:
          'Hiểu đường đi của một request từ trình duyệt tới server giúp bạn debug nhanh và chọn đúng công cụ. Phần này đi qua DNS, HTTP/HTTPS, cookie và DevTools.',
        difficulty: 'Cơ bản',
        type: 'Nền tảng',
        outcomes: [
          'Giải thích được luồng request/response của HTTP.',
          'Phân biệt DNS, domain, hosting và CDN.',
          'Đọc hiểu status code và header quan trọng.',
          'Dùng DevTools để kiểm tra network và storage.'
        ],
        prerequisites: ['Computer Science Basics'],
        next: 'programming-basics',
        courseIds: FE_COURSES.base,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'programming-basics',
        title: 'Programming Basics',
        desc: 'Biến, kiểu dữ liệu, điều kiện, vòng lặp và hàm.',
        summary:
          'Đây là bộ từ vựng chung của mọi ngôn ngữ lập trình. Bạn sẽ luyện tư duy chia nhỏ vấn đề thành hàm, xử lý điều kiện và vòng lặp trước khi bước vào JavaScript.',
        difficulty: 'Cơ bản',
        type: 'Ngôn ngữ',
        outcomes: [
          'Khai báo biến và chọn đúng kiểu dữ liệu.',
          'Viết điều kiện, vòng lặp và hàm có tham số.',
          'Tách một bài toán lớn thành các hàm nhỏ.',
          'Đọc hiểu thông báo lỗi cơ bản.'
        ],
        prerequisites: ['Computer Science Basics'],
        next: 'algorithm-data-structure',
        courseIds: FE_COURSES.base,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'algorithm-data-structure',
        title: 'Algorithm & Data Structure',
        desc: 'Mảng, danh sách, map, sắp xếp và độ phức tạp.',
        summary:
          'Chọn đúng cấu trúc dữ liệu giúp code gọn và nhanh hơn. Bạn sẽ so sánh mảng, object, Map, Set và làm quen với Big-O qua các bài toán thường gặp ở phỏng vấn.',
        difficulty: 'Trung cấp',
        type: 'Nền tảng',
        outcomes: [
          'Chọn mảng, object, Map hay Set cho từng bài toán.',
          'Cài đặt tìm kiếm và sắp xếp cơ bản.',
          'Ước lượng độ phức tạp thời gian và bộ nhớ.',
          'Giải bài toán đếm, lọc và nhóm dữ liệu.'
        ],
        prerequisites: ['Programming Basics'],
        next: 'html-semantic',
        courseIds: FE_COURSES.base,
        status: 'completed',
        mastery: 100
      }
    ]
  },
  {
    number: 2,
    name: 'Core Frontend',
    desc: 'Xây dựng nền tảng phát triển giao diện web với HTML, CSS và JavaScript.',
    icon: 'code',
    tint: '#E6F7EE',
    accent: '#16A34A',
    skills: [
      {
        id: 'html-semantic',
        title: 'HTML & Semantic',
        desc: 'Cấu trúc trang, thẻ semantic, form và accessibility cơ bản.',
        summary:
          'HTML đúng nghĩa không chỉ để hiển thị mà còn giúp SEO, screen reader và bảo trì. Bạn sẽ luyện cấu trúc trang chuẩn, form có label và các landmark cần thiết.',
        difficulty: 'Cơ bản',
        type: 'Ngôn ngữ',
        outcomes: [
          'Dùng đúng thẻ semantic theo cấu trúc trang.',
          'Xây form có label, validation và trạng thái lỗi.',
          'Hiểu ảnh hưởng của HTML tới SEO và a11y.',
          'Tổ chức tài nguyên và meta cho từng trang.'
        ],
        prerequisites: ['Web Foundation'],
        next: 'css-engineering',
        courseIds: FE_COURSES.base,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'css-engineering',
        title: 'CSS Engineering',
        desc: 'Box model, Flexbox, Grid và cách tổ chức CSS dễ bảo trì.',
        summary:
          'CSS tốt là CSS có hệ thống. Phần này đi từ box model, Flexbox, Grid đến cách đặt tên, quản lý biến và tránh xung đột style khi dự án lớn dần.',
        difficulty: 'Trung cấp',
        type: 'Ngôn ngữ',
        outcomes: [
          'Dựng layout bằng Flexbox và Grid.',
          'Kiểm soát specificity và cascade.',
          'Tổ chức CSS theo component và token.',
          'Xử lý trạng thái hover, focus, disabled.'
        ],
        prerequisites: ['HTML & Semantic'],
        next: 'responsive-design',
        courseIds: FE_COURSES.ui,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'responsive-design',
        title: 'Responsive Design',
        desc: 'Breakpoint, layout linh hoạt và hình ảnh thích ứng.',
        summary:
          'Người dùng mở web trên rất nhiều kích thước màn hình. Bạn sẽ học cách dùng đơn vị linh hoạt, breakpoint có chủ đích và kiểm tra layout ở từng độ rộng.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng',
        outcomes: [
          'Chọn đơn vị và breakpoint hợp lý.',
          'Dựng layout co giãn không tràn ngang.',
          'Tối ưu hình ảnh và font theo thiết bị.',
          'Kiểm tra giao diện ở nhiều độ rộng.'
        ],
        prerequisites: ['CSS Engineering'],
        next: 'javascript-engineering',
        courseIds: FE_COURSES.ui,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'javascript-engineering',
        title: 'JavaScript Engineering',
        desc: 'ES6+, async/await, module và xử lý bất đồng bộ.',
        summary:
          'JavaScript hiện đại xoay quanh module, promise và async/await. Bạn sẽ luyện viết hàm thuần, xử lý lỗi và tổ chức code theo module thay vì một file dài.',
        difficulty: 'Trung cấp',
        type: 'Ngôn ngữ',
        outcomes: [
          'Dùng let/const, arrow function và destructuring.',
          'Xử lý bất đồng bộ với promise và async/await.',
          'Tách code thành module có trách nhiệm rõ ràng.',
          'Bắt và xử lý lỗi đúng chỗ.'
        ],
        prerequisites: ['Programming Basics', 'HTML & Semantic'],
        next: 'dom-events',
        courseIds: FE_COURSES.base,
        status: 'in-progress',
        mastery: 46
      },
      {
        id: 'dom-events',
        title: 'DOM Manipulation & Events',
        desc: 'Truy vấn, cập nhật DOM và quản lý event.',
        summary:
          'Hiểu DOM giúp bạn biết vì sao framework cần thiết và khi nào không cần. Bạn sẽ luyện tạo, cập nhật phần tử, event delegation và dọn dẹp listener.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng',
        outcomes: [
          'Truy vấn và cập nhật DOM an toàn.',
          'Dùng event delegation cho danh sách động.',
          'Hiểu bubbling, capturing và preventDefault.',
          'Dọn listener để tránh rò rỉ bộ nhớ.'
        ],
        prerequisites: ['JavaScript Engineering'],
        next: 'browser-apis',
        courseIds: FE_COURSES.base
      },
      {
        id: 'browser-apis',
        title: 'Browser APIs',
        desc: 'Storage, fetch, history và observer APIs.',
        summary:
          'Trình duyệt cung cấp sẵn nhiều API mạnh: lưu trữ cục bộ, gọi mạng, theo dõi phần tử. Bạn sẽ biết chọn API nào cho từng tình huống và giới hạn của chúng.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng',
        outcomes: [
          'Lưu dữ liệu với localStorage và sessionStorage.',
          'Gọi API bằng fetch và xử lý lỗi mạng.',
          'Điều hướng với History API.',
          'Theo dõi hiển thị bằng IntersectionObserver.'
        ],
        prerequisites: ['DOM Manipulation & Events'],
        next: 'react',
        courseIds: FE_COURSES.data
      }
    ]
  },
  {
    number: 3,
    name: 'Frontend Framework',
    desc: 'Thành thạo framework hiện đại và quản lý trạng thái.',
    icon: 'framework',
    tint: '#FFF4D1',
    accent: '#D97706',
    skills: [
      {
        id: 'react',
        title: 'React',
        desc: 'Component, props, state, hook và luồng render.',
        summary:
          'React là thư viện JavaScript phổ biến nhất để xây dựng giao diện người dùng hiện đại, hiệu năng cao và dễ bảo trì.',
        difficulty: 'Trung cấp',
        type: 'Framework',
        outcomes: [
          'Hiểu tư duy component trong React.',
          'Sử dụng thành thạo React Hooks (useState, useEffect, useRef...).',
          'Quản lý state và props hiệu quả.',
          'Xây dựng giao diện động và tái sử dụng component.',
          'Tích hợp routing và xử lý form trong React.',
          'Kết nối API và quản lý dữ liệu.',
          'Tối ưu hiệu năng ứng dụng React.'
        ],
        prerequisites: ['JavaScript Engineering', 'DOM Manipulation & Events'],
        next: 'nextjs',
        courseIds: FE_COURSES.react,
        status: 'completed',
        mastery: 100
      },
      {
        id: 'nextjs',
        title: 'Next.js',
        desc: 'Routing, server component và tối ưu hiệu năng với Next.js.',
        summary:
          'Next.js bổ sung routing, render phía server và tối ưu ảnh cho React. Bạn sẽ nắm khi nào dùng server component, khi nào dùng client component và cách tổ chức route.',
        difficulty: 'Trung cấp',
        type: 'Framework',
        outcomes: [
          'Tổ chức route theo App Router.',
          'Phân biệt server và client component.',
          'Tối ưu ảnh, font và metadata.',
          'Chọn chiến lược render phù hợp.'
        ],
        prerequisites: ['React'],
        next: 'state-management',
        courseIds: FE_COURSES.framework,
        status: 'in-progress',
        mastery: 45
      },
      {
        id: 'state-management',
        title: 'State Management',
        desc: 'Chia sẻ state giữa component và tránh re-render thừa.',
        summary:
          'Khi ứng dụng lớn, state rải rác sẽ nhanh chóng rối. Bạn sẽ so sánh local state, context, store và cách chọn phạm vi state hợp lý.',
        difficulty: 'Nâng cao',
        type: 'Kiến trúc',
        outcomes: [
          'Chọn phạm vi state phù hợp.',
          'Tránh prop drilling bằng context hoặc store.',
          'Giảm re-render không cần thiết.',
          'Đồng bộ state với dữ liệu từ server.'
        ],
        prerequisites: ['React'],
        next: 'react-router',
        courseIds: FE_COURSES.react,
        status: 'review',
        mastery: 52
      },
      {
        id: 'react-router',
        title: 'React Router',
        desc: 'Định tuyến SPA, nested route và bảo vệ route.',
        summary:
          'Routing quyết định trải nghiệm điều hướng. Bạn sẽ luyện nested route, route guard và cách giữ state khi quay lại trang trước.',
        difficulty: 'Trung cấp',
        type: 'Thư viện',
        outcomes: [
          'Khai báo route và nested route.',
          'Truyền và đọc tham số URL.',
          'Chặn route bằng guard.',
          'Xử lý trang 404 và loading.'
        ],
        prerequisites: ['React'],
        next: 'custom-hooks',
        courseIds: FE_COURSES.react
      },
      {
        id: 'custom-hooks',
        title: 'Custom Hooks',
        desc: 'Đóng gói logic tái sử dụng thành hook.',
        summary:
          'Custom hook là cách gọn nhất để chia sẻ logic có state. Bạn sẽ tách logic fetch, form và debounce thành hook dễ test và dễ đọc.',
        difficulty: 'Nâng cao',
        type: 'Kỹ năng',
        outcomes: [
          'Nhận biết khi nào nên tách custom hook.',
          'Đặt tên và giữ hook trong phạm vi hợp lý.',
          'Tái sử dụng logic fetch và form.',
          'Kiểm thử hook với dữ liệu giả lập.'
        ],
        prerequisites: ['React'],
        next: 'api-data-fetching',
        courseIds: FE_COURSES.react
      }
    ]
  },
  {
    number: 4,
    name: 'Professional Skills',
    desc: 'Các kỹ năng quan trọng để phát triển ứng dụng thực tế.',
    icon: 'shield',
    tint: '#F3ECFF',
    accent: '#7C3AED',
    skills: [
      {
        id: 'api-data-fetching',
        title: 'API & Data Fetching',
        desc: 'Gọi API, cache dữ liệu và xử lý trạng thái tải.',
        summary:
          'Phần lớn ứng dụng hiện đại là giao diện của dữ liệu từ API. Bạn sẽ luyện chuẩn hoá dữ liệu, cache và hiển thị đủ trạng thái loading, empty, error.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng',
        outcomes: [
          'Thiết kế lớp service gọi API có kiểu dữ liệu.',
          'Xử lý loading, empty và error.',
          'Cache và tránh gọi trùng request.',
          'Chuẩn hoá response về model của UI.'
        ],
        prerequisites: ['Next.js'],
        next: 'authentication',
        courseIds: FE_COURSES.data
      },
      {
        id: 'authentication',
        title: 'Authentication',
        desc: 'Đăng nhập, lưu token và phân quyền giao diện.',
        summary:
          'Auth sai chỗ dễ tạo lỗ hổng. Bạn sẽ học luồng đăng nhập, lưu token an toàn phía client và cách ẩn/hiện UI theo quyền.',
        difficulty: 'Trung cấp',
        type: 'Bảo mật',
        outcomes: [
          'Hiểu luồng đăng nhập và refresh token.',
          'Gắn token vào request qua interceptor.',
          'Bảo vệ route và UI theo quyền.',
          'Xử lý hết phiên đăng nhập.'
        ],
        prerequisites: ['API & Data Fetching'],
        next: 'testing',
        courseIds: FE_COURSES.data
      },
      {
        id: 'testing',
        title: 'Testing',
        desc: 'Unit test, component test và E2E cơ bản.',
        summary:
          'Test giữ cho tính năng không hỏng khi mở rộng. Bạn sẽ luyện viết test cho logic thuần, cho component và một luồng E2E quan trọng.',
        difficulty: 'Nâng cao',
        type: 'Kỹ năng',
        outcomes: [
          'Viết unit test cho hàm thuần.',
          'Test component theo hành vi người dùng.',
          'Chọn phạm vi test hợp lý.',
          'Đọc kết quả test và sửa lỗi.'
        ],
        prerequisites: ['React'],
        next: 'performance',
        courseIds: FE_COURSES.base
      },
      {
        id: 'performance',
        title: 'Performance',
        desc: 'Đo và tối ưu thời gian tải, render.',
        summary:
          'Hiệu năng là một phần của trải nghiệm. Bạn sẽ học cách đo bằng Lighthouse, đọc Core Web Vitals và tối ưu từng điểm nghẽn.',
        difficulty: 'Nâng cao',
        type: 'Kỹ năng',
        outcomes: [
          'Đọc chỉ số Core Web Vitals.',
          'Tối ưu ảnh, font và bundle.',
          'Giảm re-render và chi phí render.',
          'Đo lại sau mỗi thay đổi.'
        ],
        prerequisites: ['Testing'],
        next: 'accessibility',
        courseIds: FE_COURSES.react
      },
      {
        id: 'accessibility',
        title: 'Accessibility',
        desc: 'Bàn phím, screen reader và màu sắc tương phản.',
        summary:
          'Giao diện tốt phải dùng được với bàn phím và screen reader. Bạn sẽ luyện focus state, ARIA đúng chỗ và kiểm tra tương phản màu.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng',
        outcomes: [
          'Điều hướng hoàn toàn bằng bàn phím.',
          'Dùng ARIA đúng và tối giản.',
          'Đảm bảo tương phản màu đạt chuẩn.',
          'Kiểm tra bằng công cụ accessibility.'
        ],
        prerequisites: ['HTML & Semantic'],
        next: 'clean-architecture',
        courseIds: FE_COURSES.ui
      }
    ]
  },
  {
    number: 5,
    name: 'Advanced & Architecture',
    desc: 'Kiến trúc, mô hình thiết kế và kỹ thuật nâng cao.',
    icon: 'sparkles',
    tint: '#FFE9D6',
    accent: '#EA7317',
    skills: [
      {
        id: 'clean-architecture',
        title: 'Clean Architecture',
        desc: 'Tách tầng, phụ thuộc một chiều và ranh giới module.',
        summary:
          'Kiến trúc sạch giúp dự án sống lâu hơn. Bạn sẽ luyện tách domain, application và hạ tầng, giữ phụ thuộc một chiều và đặt ranh giới rõ ràng.',
        difficulty: 'Nâng cao',
        type: 'Kiến trúc',
        outcomes: [
          'Tách tầng theo trách nhiệm.',
          'Giữ phụ thuộc một chiều.',
          'Đặt ranh giới module rõ ràng.',
          'Refactor dần mà không phá tính năng.'
        ],
        prerequisites: ['Performance', 'Accessibility'],
        next: 'design-patterns',
        courseIds: FE_COURSES.data
      },
      {
        id: 'design-patterns',
        title: 'Design Patterns',
        desc: 'Factory, strategy, observer và áp dụng thực tế.',
        summary:
          'Pattern là lời giải đã được kiểm chứng cho các vấn đề lặp lại. Bạn sẽ học cách nhận diện vấn đề trước khi chọn pattern, tránh lạm dụng.',
        difficulty: 'Nâng cao',
        type: 'Kiến trúc',
        outcomes: [
          'Nhận diện vấn đề phù hợp với pattern.',
          'Áp dụng strategy và observer.',
          'Tránh lạm dụng pattern.',
          'Viết code dễ đọc hơn nhờ pattern.'
        ],
        prerequisites: ['Clean Architecture'],
        next: 'micro-frontend',
        courseIds: FE_COURSES.data
      },
      {
        id: 'micro-frontend',
        title: 'Micro Frontend',
        desc: 'Chia ứng dụng lớn thành nhiều phần độc lập.',
        summary:
          'Khi nhiều team cùng phát triển một giao diện, micro frontend giúp giảm phụ thuộc. Bạn sẽ so sánh module federation, iframe và web component.',
        difficulty: 'Nâng cao',
        type: 'Kiến trúc',
        outcomes: [
          'So sánh các cách chia micro frontend.',
          'Chia sẻ design system giữa các phần.',
          'Quản lý phiên bản và deploy độc lập.',
          'Tránh trùng lặp dependency.'
        ],
        prerequisites: ['Design Patterns'],
        next: 'system-design',
        courseIds: FE_COURSES.framework
      },
      {
        id: 'system-design',
        title: 'System Design',
        desc: 'Thiết kế hệ thống, cache, CDN và khả năng mở rộng.',
        summary:
          'Phỏng vấn và công việc thực tế đều cần tư duy hệ thống. Bạn sẽ luyện phân rã yêu cầu, chọn cache, CDN và bàn về đánh đổi.',
        difficulty: 'Nâng cao',
        type: 'Kiến trúc',
        outcomes: [
          'Phân rã yêu cầu thành thành phần hệ thống.',
          'Chọn cache, CDN và chiến lược scale.',
          'Bàn về đánh đổi và điểm nghẽn.',
          'Trình bày thiết kế rõ ràng.'
        ],
        prerequisites: ['Micro Frontend'],
        next: 'git-collaboration',
        courseIds: FE_COURSES.data
      }
    ]
  },
  {
    number: 6,
    name: 'Soft Skills & Career',
    desc: 'Kỹ năng mềm và định hướng phát triển sự nghiệp.',
    icon: 'people',
    tint: '#FFE4EF',
    accent: '#EC4899',
    skills: [
      {
        id: 'git-collaboration',
        title: 'Git & Collaboration',
        desc: 'Branch, pull request, review và xử lý conflict.',
        summary:
          'Làm việc nhóm hiệu quả bắt đầu từ Git. Bạn sẽ luyện branch theo tính năng, viết pull request dễ review và xử lý conflict an toàn.',
        difficulty: 'Cơ bản',
        type: 'Công cụ',
        outcomes: [
          'Tổ chức branch theo tính năng.',
          'Viết commit và pull request rõ ràng.',
          'Review code có trọng tâm.',
          'Giải quyết conflict an toàn.'
        ],
        prerequisites: ['Programming Basics'],
        next: 'agile-scrum',
        courseIds: FE_COURSES.data
      },
      {
        id: 'agile-scrum',
        title: 'Agile & Scrum',
        desc: 'Sprint, story point và phối hợp trong team.',
        summary:
          'Hiểu quy trình giúp bạn chủ động trong công việc. Bạn sẽ nắm sprint, story point, standup và cách báo cáo tiến độ trung thực.',
        difficulty: 'Cơ bản',
        type: 'Kỹ năng mềm',
        outcomes: [
          'Hiểu vòng lặp sprint và các buổi họp.',
          'Ước lượng công việc theo story point.',
          'Báo cáo tiến độ và rủi ro rõ ràng.',
          'Phối hợp với BA, QA và design.'
        ],
        prerequisites: ['Git & Collaboration'],
        next: 'technical-writing',
        courseIds: []
      },
      {
        id: 'technical-writing',
        title: 'Technical Writing',
        desc: 'Viết tài liệu, README và mô tả kỹ thuật.',
        summary:
          'Tài liệu tốt tiết kiệm thời gian cho cả team. Bạn sẽ luyện viết README, ghi chú quyết định và mô tả lỗi đủ để người khác tái hiện.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng mềm',
        outcomes: [
          'Viết README dùng được ngay.',
          'Ghi chú quyết định kỹ thuật ngắn gọn.',
          'Mô tả lỗi có bước tái hiện.',
          'Viết tài liệu API dễ tra cứu.'
        ],
        prerequisites: ['Agile & Scrum'],
        next: 'interview-skills',
        courseIds: []
      },
      {
        id: 'interview-skills',
        title: 'Interview Skills',
        desc: 'Trình bày dự án, giải bài và trả lời hành vi.',
        summary:
          'Phỏng vấn là kỹ năng có thể luyện. Bạn sẽ chuẩn bị câu chuyện dự án theo STAR, luyện live coding và cách đặt câu hỏi ngược.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng mềm',
        outcomes: [
          'Kể dự án theo cấu trúc STAR.',
          'Trình bày bài giải rõ ràng.',
          'Xử lý câu hỏi hành vi.',
          'Đặt câu hỏi ngược cho nhà tuyển dụng.'
        ],
        prerequisites: ['Technical Writing'],
        next: 'portfolio-building',
        courseIds: []
      },
      {
        id: 'portfolio-building',
        title: 'Portfolio Building',
        desc: 'Chọn dự án, viết case study và deploy portfolio.',
        summary:
          'Portfolio là bằng chứng năng lực thay cho lời giới thiệu. Bạn sẽ chọn 3 dự án tiêu biểu, viết case study và deploy một trang giới thiệu gọn gàng.',
        difficulty: 'Trung cấp',
        type: 'Kỹ năng mềm',
        outcomes: [
          'Chọn dự án thể hiện đúng năng lực.',
          'Viết case study theo vấn đề - giải pháp.',
          'Trình bày code và demo rõ ràng.',
          'Deploy và chia sẻ portfolio.'
        ],
        prerequisites: ['Interview Skills'],
        next: null,
        courseIds: FE_COURSES.ui
      }
    ]
  }
];

const SKILL_TITLES = new Map(
  STAGE_SEEDS.flatMap((stage) => stage.skills.map((skill) => [skill.id, skill.title] as const))
);

function buildSkill(stageId: string, seed: SkillSeed): RoadmapSkill {
  return {
    id: seed.id,
    title: seed.title,
    desc: seed.desc,
    summary: seed.summary,
    status: seed.status ?? 'not-started',
    mastery: seed.mastery ?? 0,
    difficulty: seed.difficulty,
    type: seed.type,
    outcomes: seed.outcomes,
    prerequisites: seed.prerequisites,
    nextSkill: seed.next
      ? {
          name: SKILL_TITLES.get(seed.next) ?? seed.next,
          description: 'Kỹ năng kế tiếp trong lộ trình Frontend Developer.'
        }
      : null,
    courseIds: seed.courseIds ?? [],
    stageId
  };
}

function buildStage(seed: StageSeed): RoadmapStage {
  const id = `fe-stage-${seed.number}`;
  const stage: RoadmapStage = {
    id,
    number: seed.number,
    name: seed.name,
    desc: seed.desc,
    icon: seed.icon,
    tint: seed.tint,
    accent: seed.accent,
    skills: []
  };
  stage.skills = seed.skills.map((skill) => buildSkill(id, skill));
  return stage;
}

export const FRONTEND_ROADMAP: RoadmapDetail = {
  id: 'frontend-developer',
  title: 'Frontend Developer',
  desc: 'Lộ trình học từ cơ bản đến nâng cao để trở thành Frontend Developer chuyên nghiệp.',
  stages: STAGE_SEEDS.map(buildStage)
};

/** Tiêu đề thẻ hiển thị ở trang danh sách (khác H1 ở trang chi tiết theo thiết kế Figma). */
export const FRONTEND_CARD_TITLE = 'Front-end Developer';
