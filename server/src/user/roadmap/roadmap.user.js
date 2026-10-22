import { getMongoDb } from '../db.js';

// ─── 0. Hằng Số Nghiệp Vụ & Cấu Hình Collections ────────────────────────────

export const COLLECTION_USER_ROADMAPS = 'user_roadmaps';
export const COLLECTION_ROADMAP_QUESTIONS = 'roadmap_stage_questions';
export const COLLECTION_ROADMAP_SUBMISSIONS = 'roadmap_test_submissions';

export const STATUS_NOT_STARTED = 'not_started';
export const STATUS_IN_PROGRESS = 'in_progress';
export const STATUS_REVIEW = 'review';
export const STATUS_COMPLETED = 'completed';

export const VALID_STATUSES = [
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_REVIEW,
  STATUS_COMPLETED
];

/** Hệ số làm mượt EWMA (Exponentially Weighted Moving Average) */
export const EWMA_ALPHA = 0.6;

// ─── 1. Dữ Liệu Lộ Trình Mẫu (Templates) Theo Nghề ───────────────────────────

/**
 * Định nghĩa template các giai đoạn và node kỹ năng cho từng nghề nghiệp.
 * Mỗi giai đoạn (Stage) đại diện cho một nhóm kỹ năng theo chủ đề.
 * Trong mỗi giai đoạn có các Node kỹ năng độc lập về Level và liên kết với Tag khóa học.
 */
export const CAREER_ROADMAP_TEMPLATES = {
  // 1: Frontend Developer
  1: {
    category_id: 1,
    career_name: 'Frontend Developer',
    description: 'Lộ trình phát triển chuyên sâu giao diện Web từ nền tảng đến tối ưu hiệu năng.',
    stages: [
      {
        stage_id: 'fe-stage-1',
        title: 'Giai đoạn 1: Nền tảng Web & Lập trình cơ sở',
        description: 'Làm chủ HTML, CSS, JavaScript cốt lõi và quy trình quản lý mã nguồn Git.',
        order: 1,
        nodes: [
          {
            node_id: 'fe-node-html',
            title: 'HTML5 & Semantic Markup',
            level: 'beginner',
            tags: ['HTML'],
            description: 'Nắm vững cấu trúc DOM ngữ nghĩa, SEO và khả năng tiếp cận (Accessibility).'
          },
          {
            node_id: 'fe-node-css',
            title: 'CSS3, Flexbox & Responsive Design',
            level: 'beginner',
            tags: ['CSS'],
            description: 'Bố cục hiện đại Flexbox, Grid và xây dựng giao diện tương thích đa thiết bị.'
          },
          {
            node_id: 'fe-node-js',
            title: 'JavaScript ES6+ & DOM Manipulation',
            level: 'beginner',
            tags: ['JavaScript'],
            description: 'Xử lý bất đồng bộ, Event Loop, Closures và tương tác động với DOM.'
          },
          {
            node_id: 'fe-node-git',
            title: 'Version Control với Git & GitHub',
            level: 'beginner',
            tags: ['Git'],
            description: 'Quản lý nhánh, commit, pull request và giải quyết conflict mã nguồn.'
          }
        ]
      },
      {
        stage_id: 'fe-stage-2',
        title: 'Giai đoạn 2: UI Framework & Tích hợp Dịch vụ',
        description: 'Ứng dụng ReactJS, TailwindCSS, TypeScript và kết nối REST API.',
        order: 2,
        nodes: [
          {
            node_id: 'fe-node-tailwind',
            title: 'TailwindCSS & Utility-First Styling',
            level: 'intermediate',
            tags: ['TailwindCSS'],
            description: 'Thiết kế giao diện siêu tốc với các tiện ích Utility classes hiện đại.'
          },
          {
            node_id: 'fe-node-react',
            title: 'ReactJS, Hooks & State Management',
            level: 'intermediate',
            tags: ['ReactJS'],
            description: 'Component Lifecycle, Custom Hooks, Context API và quản lý state.'
          },
          {
            node_id: 'fe-node-typescript',
            title: 'TypeScript cho Frontend',
            level: 'intermediate',
            tags: ['TypeScript'],
            description: 'Static Typing, Interfaces, Generics giúp tăng tính an toàn cho mã nguồn.'
          },
          {
            node_id: 'fe-node-api',
            title: 'REST API & Asynchronous Data Fetching',
            level: 'intermediate',
            tags: ['REST API'],
            description: 'Tương tác API với Axios/Fetch, xử lý caching, loading và retry logic.'
          }
        ]
      },
      {
        stage_id: 'fe-stage-3',
        title: 'Giai đoạn 3: Framework Nâng cao & Kiến trúc Hệ thống',
        description: 'Làm chủ SSR/SSG với Next.js và tối ưu hóa hiệu năng ứng dụng quy mô lớn.',
        order: 3,
        nodes: [
          {
            node_id: 'fe-node-nextjs',
            title: 'NextJS, SSR & Server Components',
            level: 'advanced',
            tags: ['NextJS'],
            description: 'Server-Side Rendering, App Router, Static Generation và tối ưu SEO.'
          },
          {
            node_id: 'fe-node-perf',
            title: 'Frontend Architecture & Web Performance',
            level: 'advanced',
            tags: ['ReactJS', 'TypeScript'],
            description: 'Core Web Vitals, Code Splitting, Bundle Optimization và CI/CD Frontend.'
          }
        ]
      }
    ]
  },

  // 2: Backend Developer
  2: {
    category_id: 2,
    career_name: 'Backend Developer',
    description: 'Lộ trình xây dựng hệ thống máy chủ, API bảo mật và cơ sở dữ liệu quy mô lớn.',
    stages: [
      {
        stage_id: 'be-stage-1',
        title: 'Giai đoạn 1: Lập trình Server & Cơ sở dữ liệu',
        description: 'Làm chủ Node.js/Express, thiết kế CSDL quan hệ SQL và NoSQL.',
        order: 1,
        nodes: [
          {
            node_id: 'be-node-nodejs',
            title: 'Node.js, Express & RESTful API',
            level: 'intermediate',
            tags: ['Node.js', 'JavaScript'],
            description: 'Xây dựng API đạt chuẩn, middleware, routing và xử lý lỗi tập trung.'
          },
          {
            node_id: 'be-node-sql',
            title: 'Cơ sở dữ liệu Quan hệ & Tối ưu SQL',
            level: 'intermediate',
            tags: ['SQL'],
            description: 'Thiết kế lược đồ chuẩn hóa, Indexing, Transaction và Query Tuning.'
          },
          {
            node_id: 'be-node-nosql',
            title: 'MongoDB & NoSQL Data Modeling',
            level: 'intermediate',
            tags: ['MongoDB'],
            description: 'Aggregation Pipeline, Document Validation và Sharding cơ bản.'
          }
        ]
      },
      {
        stage_id: 'be-stage-2',
        title: 'Giai đoạn 2: Caching, GraphQL & Kiến trúc Phân tán',
        description: 'Tối ưu tốc độ với Redis và thiết kế hệ thống giao tiếp linh hoạt.',
        order: 2,
        nodes: [
          {
            node_id: 'be-node-redis',
            title: 'Redis & Caching Strategy',
            level: 'intermediate',
            tags: ['Redis'],
            description: 'In-memory caching, Cache Invalidation, Rate Limiting và Pub/Sub.'
          },
          {
            node_id: 'be-node-graphql',
            title: 'GraphQL API & Schema Federation',
            level: 'intermediate',
            tags: ['GraphQL'],
            description: 'Xây dựng Query, Mutation và tối ưu truy vấn giải quyết bài toán N+1.'
          },
          {
            node_id: 'be-node-docker',
            title: 'Containerization với Docker',
            level: 'intermediate',
            tags: ['Docker'],
            description: 'Đóng gói ứng dụng, Dockerfile đa tầng và quản lý với Docker Compose.'
          }
        ]
      },
      {
        stage_id: 'be-stage-3',
        title: 'Giai đoạn 3: Microservices & Bảo mật Hệ thống',
        description: 'Thiết kế vi dịch vụ, bảo mật API và triển khai hạ tầng đám mây.',
        order: 3,
        nodes: [
          {
            node_id: 'be-node-microservices',
            title: 'Microservices & Message Broker',
            level: 'advanced',
            tags: ['REST API', 'CI/CD'],
            description: 'Event-driven Architecture, API Gateway, Service Discovery.'
          },
          {
            node_id: 'be-node-cloud',
            title: 'Bảo mật API & Triển khai Cloud (AWS)',
            level: 'advanced',
            tags: ['AWS', 'CI/CD'],
            description: 'OAuth2/JWT, OWASP Top 10, quản trị hạ tầng AWS và CI/CD tự động.'
          }
        ]
      }
    ]
  }
};

// ─── 2. Ngân Hàng Câu Hỏi Mẫu Cho Bài Test Giai Đoạn (~10 câu/stage) ────────

/**
 * Bộ câu hỏi mẫu ~10 câu cho các giai đoạn (Stage Quiz), liên kết trực tiếp tới từng Node kỹ năng.
 */
export const SEED_STAGE_QUESTIONS = [
  // ── Frontend Stage 1: Nền tảng Web & Lập trình cơ sở (10 câu) ──
  {
    question_id: 'fe-s1-q1',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-html',
    question_text: 'Thẻ HTML5 nào sau đây mang tính ngữ nghĩa (semantic) phù hợp nhất để chứa nội dung chính độc lập của trang?',
    options: [
      { key: 'A', text: '<div class="main-content">' },
      { key: 'B', text: '<article>' },
      { key: 'C', text: '<span>' },
      { key: 'D', text: '<section id="main">' }
    ],
    correct_option: 'B',
    explanation: '<article> thể hiện một khối nội dung độc lập, hoàn chỉnh và có thể tái sử dụng.'
  },
  {
    question_id: 'fe-s1-q2',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-html',
    question_text: 'Thuộc tính nào của thẻ <img> là bắt buộc để hỗ trợ công cụ đọc màn hình (Accessibility) và SEO?',
    options: [
      { key: 'A', text: 'title' },
      { key: 'B', text: 'alt' },
      { key: 'C', text: 'name' },
      { key: 'D', text: 'src-set' }
    ],
    correct_option: 'B',
    explanation: 'Thuộc tính alt cung cấp văn bản thay thế khi hình ảnh không hiển thị và cho người khiếm thị.'
  },
  {
    question_id: 'fe-s1-q3',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-css',
    question_text: 'Trong CSS Flexbox, thuộc tính nào căn chỉnh các phần tử con theo trục chính (main axis)?',
    options: [
      { key: 'A', text: 'align-items' },
      { key: 'B', text: 'justify-content' },
      { key: 'C', text: 'align-content' },
      { key: 'D', text: 'flex-direction' }
    ],
    correct_option: 'B',
    explanation: 'justify-content căn chỉnh các phần tử theo trục chính (main axis).'
  },
  {
    question_id: 'fe-s1-q4',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-css',
    question_text: 'Quy tắc Box-sizing nào giúp chiều rộng (width) của phần tử bao gồm cả padding và border?',
    options: [
      { key: 'A', text: 'box-sizing: content-box;' },
      { key: 'B', text: 'box-sizing: border-box;' },
      { key: 'C', text: 'box-sizing: padding-box;' },
      { key: 'D', text: 'box-sizing: inherit;' }
    ],
    correct_option: 'B',
    explanation: 'border-box tính cả padding và border vào kích thước tổng của phần tử.'
  },
  {
    question_id: 'fe-s1-q5',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-js',
    question_text: 'Sự khác biệt căn bản giữa biến khai báo bằng `let` và `var` trong JavaScript là gì?',
    options: [
      { key: 'A', text: 'let có phạm vi function, var có phạm vi block' },
      { key: 'B', text: 'let có phạm vi block, var có phạm vi function' },
      { key: 'C', text: 'let không thể gán lại giá trị, var thì có thể' },
      { key: 'D', text: 'Cả hai hoàn toàn giống nhau' }
    ],
    correct_option: 'B',
    explanation: 'let và const tuân theo block scope {}, trong khi var tuân theo function scope.'
  },
  {
    question_id: 'fe-s1-q6',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-js',
    question_text: 'Phương thức nào biến đổi một mảng thành mảng mới với số phần tử tương đương qua một hàm callback?',
    options: [
      { key: 'A', text: 'Array.prototype.forEach()' },
      { key: 'B', text: 'Array.prototype.filter()' },
      { key: 'C', text: 'Array.prototype.map()' },
      { key: 'D', text: 'Array.prototype.reduce()' }
    ],
    correct_option: 'C',
    explanation: 'map() duyệt qua từng phần tử và trả về một mảng mới có cùng độ dài.'
  },
  {
    question_id: 'fe-s1-q7',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-js',
    question_text: 'Toán tử so sánh tuyệt đối (Strict Equality) `===` khác với `==` ở điểm nào?',
    options: [
      { key: 'A', text: 'Không ép kiểu tự động (Type Coercion)' },
      { key: 'B', text: 'Tự động ép kiểu chuỗi thành số' },
      { key: 'C', text: 'Chỉ so sánh được kiểu Object' },
      { key: 'D', text: 'Luôn trả về true nếu cả 2 là truthy' }
    ],
    correct_option: 'A',
    explanation: 'Toán tử === so sánh cả giá trị lẫn kiểu dữ liệu mà không ép kiểu.'
  },
  {
    question_id: 'fe-s1-q8',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-git',
    question_text: 'Lệnh Git nào dùng để tạo một nhánh mới và chuyển ngay sang nhánh đó?',
    options: [
      { key: 'A', text: 'git branch -b <ten_nhanh>' },
      { key: 'B', text: 'git checkout -b <ten_nhanh>' },
      { key: 'C', text: 'git switch -m <ten_nhanh>' },
      { key: 'D', text: 'git merge <ten_nhanh>' }
    ],
    correct_option: 'B',
    explanation: 'git checkout -b <name> hoặc git switch -c <name> tạo và chuyển ngay sang nhánh mới.'
  },
  {
    question_id: 'fe-s1-q9',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-git',
    question_text: 'Lệnh nào lưu tạm các thay đổi chưa commit vào bộ nhớ đệm an toàn để chuyển nhánh sạch sẽ?',
    options: [
      { key: 'A', text: 'git reset --hard' },
      { key: 'B', text: 'git stash' },
      { key: 'C', text: 'git pull --rebase' },
      { key: 'D', text: 'git revert' }
    ],
    correct_option: 'B',
    explanation: 'git stash cất giữ các thay đổi trong working directory mà chưa commit.'
  },
  {
    question_id: 'fe-s1-q10',
    stage_id: 'fe-stage-1',
    node_id: 'fe-node-html',
    question_text: 'Thẻ meta nào trong HTML5 là bắt buộc để trang web hiển thị đúng tỷ lệ trên thiết bị di động (Responsive)?',
    options: [
      { key: 'A', text: '<meta name="viewport" content="width=device-width, initial-scale=1.0">' },
      { key: 'B', text: '<meta http-equiv="X-UA-Compatible" content="IE=edge">' },
      { key: 'C', text: '<meta name="robots" content="index, follow">' },
      { key: 'D', text: '<meta charset="UTF-8">' }
    ],
    correct_option: 'A',
    explanation: 'Meta viewport điều khiển chiều rộng và mức độ thu phóng của màn hình trình duyệt.'
  },

  // ── Frontend Stage 2: UI Framework & Tích hợp Dịch vụ (10 câu) ──
  {
    question_id: 'fe-s2-q1',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-react',
    question_text: 'Hook nào trong React được sử dụng để thực hiện Side Effects (gọi API, subscriptions, tương tác DOM)?',
    options: [
      { key: 'A', text: 'useState' },
      { key: 'B', text: 'useEffect' },
      { key: 'C', text: 'useMemo' },
      { key: 'D', text: 'useCallback' }
    ],
    correct_option: 'B',
    explanation: 'useEffect xử lý các tác vụ ngoài luồng render (side effects).'
  },
  {
    question_id: 'fe-s2-q2',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-react',
    question_text: 'Quy tắc quan trọng khi cập nhật State dạng Object hoặc Array trong React là gì?',
    options: [
      { key: 'A', text: 'Trực tiếp sửa đổi thuộc tính của state (mutate)' },
      { key: 'B', text: 'Luôn tạo bản sao mới (immutable update) như dùng spread operator' },
      { key: 'C', text: 'Dùng delete để xóa trường trong state' },
      { key: 'D', text: 'Gán biến trực tiếp state.val = x' }
    ],
    correct_option: 'B',
    explanation: 'React yêu cầu tính bất biến (immutability) để so sánh nông và re-render chính xác.'
  },
  {
    question_id: 'fe-s2-q3',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-tailwind',
    question_text: 'Trong TailwindCSS, class nào căn giữa một phần tử block theo chiều ngang?',
    options: [
      { key: 'A', text: 'text-center' },
      { key: 'B', text: 'mx-auto' },
      { key: 'C', text: 'items-center' },
      { key: 'D', text: 'justify-center' }
    ],
    correct_option: 'B',
    explanation: 'mx-auto đặt margin-left: auto; margin-right: auto; để căn giữa khối.'
  },
  {
    question_id: 'fe-s2-q4',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-tailwind',
    question_text: 'Tiền tố breakpoint nào trong TailwindCSS áp dụng cho kích thước màn hình từ 768px trở lên?',
    options: [
      { key: 'A', text: 'sm:' },
      { key: 'B', text: 'md:' },
      { key: 'C', text: 'lg:' },
      { key: 'D', text: 'xl:' }
    ],
    correct_option: 'B',
    explanation: 'Mặc định breakpoint md: bắt đầu từ min-width: 768px.'
  },
  {
    question_id: 'fe-s2-q5',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-typescript',
    question_text: 'Trong TypeScript, từ khóa nào định nghĩa một kiểu dữ liệu có thể mở rộng (extend) nhiều lần?',
    options: [
      { key: 'A', text: 'type' },
      { key: 'B', text: 'interface' },
      { key: 'C', text: 'enum' },
      { key: 'D', text: 'namespace' }
    ],
    correct_option: 'B',
    explanation: 'interface có thể mở rộng và kế thừa linh hoạt thông qua declaration merging.'
  },
  {
    question_id: 'fe-s2-q6',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-typescript',
    question_text: 'Kiểu dữ liệu đặc biệt nào trong TypeScript đại diện cho giá trị có thể là bất kỳ thứ gì nhưng an toàn hơn `any`?',
    options: [
      { key: 'A', text: 'never' },
      { key: 'B', text: 'void' },
      { key: 'C', text: 'unknown' },
      { key: 'D', text: 'undefined' }
    ],
    correct_option: 'C',
    explanation: 'unknown buộc lập trình viên phải kiểm tra kiểu (type narrowing) trước khi thao tác.'
  },
  {
    question_id: 'fe-s2-q7',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-api',
    question_text: 'Phương thức HTTP nào theo tiêu chuẩn RESTful được dùng để cập nhật một phần tài nguyên?',
    options: [
      { key: 'A', text: 'PUT' },
      { key: 'B', text: 'POST' },
      { key: 'C', text: 'PATCH' },
      { key: 'D', text: 'DELETE' }
    ],
    correct_option: 'C',
    explanation: 'PATCH dùng để sửa đổi một phần, trong khi PUT thường thay thế toàn bộ tài nguyên.'
  },
  {
    question_id: 'fe-s2-q8',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-api',
    question_text: 'Mã phản hồi HTTP nào thể hiện người dùng chưa được xác thực danh tính?',
    options: [
      { key: 'A', text: '400 Bad Request' },
      { key: 'B', text: '401 Unauthorized' },
      { key: 'C', text: '403 Forbidden' },
      { key: 'D', text: '404 Not Found' }
    ],
    correct_option: 'B',
    explanation: '401 Unauthorized yêu cầu thông tin xác thực (token/cookie) hợp lệ.'
  },
  {
    question_id: 'fe-s2-q9',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-react',
    question_text: 'Hook `useCallback` chủ yếu được dùng để giải quyết vấn đề gì?',
    options: [
      { key: 'A', text: 'Lưu trữ giá trị tính toán tốn kém' },
      { key: 'B', text: 'Ghi nhớ (memoize) định nghĩa của một hàm để tránh tạo lại hàm khi re-render' },
      { key: 'C', text: 'Thay thế cho useEffect' },
      { key: 'D', text: 'Khởi tạo Redux Store' }
    ],
    correct_option: 'B',
    explanation: 'useCallback trả về một hàm được memoize qua các lần re-render.'
  },
  {
    question_id: 'fe-s2-q10',
    stage_id: 'fe-stage-2',
    node_id: 'fe-node-typescript',
    question_text: 'Toán tử Optional Chaining `?.` trong JavaScript/TypeScript có tác dụng gì?',
    options: [
      { key: 'A', text: 'Báo lỗi ngay nếu thuộc tính không tồn tại' },
      { key: 'B', text: 'Truy cập thuộc tính lồng nhau an toàn mà không quăng lỗi khi giá trị là null hoặc undefined' },
      { key: 'C', text: 'Ép kiểu thuộc tính thành boolean' },
      { key: 'D', text: 'Tạo giá trị mặc định cho biến' }
    ],
    correct_option: 'B',
    explanation: '?. trả về undefined nếu đối tượng phía trước là null hoặc undefined mà không gây runtime error.'
  },

  // ── Backend Stage 1: Lập trình Server & CSDL (10 câu) ──
  {
    question_id: 'be-s1-q1',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nodejs',
    question_text: 'Cơ chế cốt lõi giúp Node.js xử lý hàng nghìn kết nối đồng thời với mô hình đơn luồng là gì?',
    options: [
      { key: 'A', text: 'Multi-threading mặc định' },
      { key: 'B', text: 'Event Loop & Non-blocking I/O' },
      { key: 'C', text: 'Blocking Worker Pool' },
      { key: 'D', text: 'Thread Sleep' }
    ],
    correct_option: 'B',
    explanation: 'Event Loop phối hợp với thư viện libuv để thực hiện I/O bất đồng bộ phi chặn.'
  },
  {
    question_id: 'be-s1-q2',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nodejs',
    question_text: 'Thứ tự tham số chuẩn của một Error-handling Middleware trong ExpressJS là gì?',
    options: [
      { key: 'A', text: '(req, res, next)' },
      { key: 'B', text: '(err, req, res, next)' },
      { key: 'C', text: '(req, res, err)' },
      { key: 'D', text: '(err, next, req, res)' }
    ],
    correct_option: 'B',
    explanation: 'Express nhận diện middleware bắt lỗi khi khai báo đúng 4 tham số: (err, req, res, next).'
  },
  {
    question_id: 'be-s1-q3',
    stage_id: 'be-stage-1',
    node_id: 'be-node-sql',
    question_text: 'Mục đích chính của việc tạo Chỉ mục (Index) trên một cột trong cơ sở dữ liệu quan hệ là gì?',
    options: [
      { key: 'A', text: 'Tăng tốc độ ghi (INSERT/UPDATE)' },
      { key: 'B', text: 'Tăng tốc độ truy vấn đọc dữ liệu (SELECT)' },
      { key: 'C', text: 'Tiết kiệm dung lượng lưu trữ trên đĩa' },
      { key: 'D', text: 'Tự động mã hóa dữ liệu' }
    ],
    correct_option: 'B',
    explanation: 'Index sử dụng cấu trúc B-Tree giúp tìm kiếm bản ghi nhanh chóng mà không cần scan toàn bộ bảng.'
  },
  {
    question_id: 'be-s1-q4',
    stage_id: 'be-stage-1',
    node_id: 'be-node-sql',
    question_text: 'Tính chất nào trong mô hình ACID đảm bảo một giao dịch (transaction) hoặc thành công toàn bộ hoặc không có gì thay đổi?',
    options: [
      { key: 'A', text: 'Atomicity (Tính nguyên tử)' },
      { key: 'B', text: 'Consistency (Tính nhất quán)' },
      { key: 'C', text: 'Isolation (Tính cô lập)' },
      { key: 'D', text: 'Durability (Tính bền vững)' }
    ],
    correct_option: 'A',
    explanation: 'Atomicity đảm bảo "All or Nothing" trong một transaction.'
  },
  {
    question_id: 'be-s1-q5',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nosql',
    question_text: 'Toán tử nào trong MongoDB Aggregation Pipeline được dùng để nhóm các tài liệu theo một trường chung?',
    options: [
      { key: 'A', text: '$match' },
      { key: 'B', text: '$group' },
      { key: 'C', text: '$project' },
      { key: 'D', text: '$unwind' }
    ],
    correct_option: 'B',
    explanation: '$group nhóm các document theo _id xác định và tính toán các giá trị tổng hợp.'
  },
  {
    question_id: 'be-s1-q6',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nosql',
    question_text: 'Toán tử nào cập nhật mảng trong MongoDB bằng cách thêm phần tử mới chỉ khi phần tử đó chưa tồn tại?',
    options: [
      { key: 'A', text: '$push' },
      { key: 'B', text: '$addToSet' },
      { key: 'C', text: '$set' },
      { key: 'D', text: '$insert' }
    ],
    correct_option: 'B',
    explanation: '$addToSet chỉ thêm phần tử vào mảng nếu nó chưa có mặt.'
  },
  {
    question_id: 'be-s1-q7',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nodejs',
    question_text: 'Biện pháp nào hiệu quả nhất để ngăn chặn lỗ hổng SQL Injection / NoSQL Injection?',
    options: [
      { key: 'A', text: 'Nối chuỗi trực tiếp câu truy vấn với input của client' },
      { key: 'B', text: 'Sử dụng Prepared Statements / Parameterized Queries và xác thực kiểu dữ liệu đầu vào' },
      { key: 'C', text: 'Mã hóa base64 toàn bộ input trước khi truy vấn' },
      { key: 'D', text: 'Chỉ cho phép phương thức GET' }
    ],
    correct_option: 'B',
    explanation: 'Tham số hóa câu truy vấn tách biệt mã lệnh SQL/NoSQL khỏi dữ liệu người dùng.'
  },
  {
    question_id: 'be-s1-q8',
    stage_id: 'be-stage-1',
    node_id: 'be-node-sql',
    question_text: 'Kiểu JOIN nào trong SQL trả về tất cả bản ghi từ bảng bên trái và các bản ghi khớp từ bảng bên phải?',
    options: [
      { key: 'A', text: 'INNER JOIN' },
      { key: 'B', text: 'LEFT JOIN' },
      { key: 'C', text: 'RIGHT JOIN' },
      { key: 'D', text: 'FULL OUTER JOIN' }
    ],
    correct_option: 'B',
    explanation: 'LEFT JOIN giữ lại toàn bộ hàng từ bảng bên trái dù bảng bên phải có khớp hay không.'
  },
  {
    question_id: 'be-s1-q9',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nosql',
    question_text: 'Trường `_id` mặc định trong MongoDB có kiểu dữ liệu gì?',
    options: [
      { key: 'A', text: 'Auto-increment Integer' },
      { key: 'B', text: 'ObjectId (12-byte BSON type)' },
      { key: 'C', text: 'UUID v4' },
      { key: 'D', text: 'Random MD5 Hash' }
    ],
    correct_option: 'B',
    explanation: 'ObjectId gồm 12 byte chứa timestamp, machine id, process id và counter.'
  },
  {
    question_id: 'be-s1-q10',
    stage_id: 'be-stage-1',
    node_id: 'be-node-nodejs',
    question_text: 'Module cốt lõi nào trong Node.js cung cấp các chức năng mã hóa mật mã học như băm mật khẩu, HMAC, Cipher?',
    options: [
      { key: 'A', text: 'node:crypto' },
      { key: 'B', text: 'node:fs' },
      { key: 'C', text: 'node:buffer' },
      { key: 'D', text: 'node:events' }
    ],
    correct_option: 'A',
    explanation: 'Module crypto cung cấp các thuật toán mã hóa mật mã học mạnh mẽ.'
  }
];

// ─── 3. Các Hàm Tiện Ích Nghiệp Vụ Roadmap ───────────────────────────────────

/**
 * Tạo tự động lộ trình cho danh mục chưa có template cứng trong CAREER_ROADMAP_TEMPLATES
 * bằng cách truy vấn các khóa học và tags của danh mục đó từ DB.
 */
export async function generateDynamicTemplateForCategory(categoryId) {
  const db = await getMongoDb();
  const numId = Number(categoryId);

  const category = await db.collection('course_categories').findOne({
    $or: [{ category_id: numId }, { category_id: String(categoryId) }]
  });

  if (!category) return null;

  const courses = await db.collection('courses').find({
    $or: [{ category_id: numId }, { category_id: String(categoryId) }]
  }).toArray();

  const courseIds = courses.map(c => c.course_id);
  const courseTags = await db.collection('course_tags').find({
    course_id: { $in: courseIds }
  }).toArray();

  const allTags = await db.collection('tags').find().toArray();
  const tagMap = {};
  allTags.forEach(t => { tagMap[t.tag_id] = t.name; });

  const uniqueTagNames = [...new Set(courseTags.map(ct => tagMap[ct.tag_id]).filter(Boolean))];

  // Phân chia thành 3 giai đoạn chủ đề
  const stage1Tags = uniqueTagNames.slice(0, 3);
  const stage2Tags = uniqueTagNames.slice(3, 7);
  const stage3Tags = uniqueTagNames.slice(7);

  const buildNodes = (tagsList, stagePrefix, defaultLevel) => {
    if (tagsList.length === 0) {
      return [{
        node_id: `${stagePrefix}-core`,
        title: `Kỹ năng cốt lõi ${category.name}`,
        level: defaultLevel,
        tags: [category.name],
        description: `Làm chủ kiến thức nền tảng trong lĩnh vực ${category.name}.`
      }];
    }
    return tagsList.map((tag, idx) => ({
      node_id: `${stagePrefix}-node-${idx + 1}`,
      title: `Chuyên môn: ${tag}`,
      level: defaultLevel,
      tags: [tag],
      description: `Áp dụng thành thạo kỹ năng ${tag} vào công việc thực tế.`
    }));
  };

  return {
    category_id: numId,
    career_name: category.name,
    description: category.description || `Lộ trình phát triển toàn diện nghề ${category.name}.`,
    stages: [
      {
        stage_id: `cat-${numId}-stage-1`,
        title: 'Giai đoạn 1: Nền tảng Chuyên môn Cốt lõi',
        description: 'Xây dựng tư duy và kỹ năng cơ sở vững chắc cho ngành nghề.',
        order: 1,
        nodes: buildNodes(stage1Tags, `cat-${numId}-s1`, 'beginner')
      },
      {
        stage_id: `cat-${numId}-stage-2`,
        title: 'Giai đoạn 2: Kỹ năng Thực chiến & Framework',
        description: 'Áp dụng các công cụ chuyên sâu và giải quyết bài toán nghiệp vụ.',
        order: 2,
        nodes: buildNodes(stage2Tags, `cat-${numId}-s2`, 'intermediate')
      },
      {
        stage_id: `cat-${numId}-stage-3`,
        title: 'Giai đoạn 3: Nâng cao, Tối ưu & Vận hành',
        description: 'Làm chủ kiến trúc hệ thống, quản trị chất lượng và tối ưu hóa.',
        order: 3,
        nodes: buildNodes(stage3Tags, `cat-${numId}-s3`, 'advanced')
      }
    ]
  };
}

const _templateCache = new Map();

/**
 * Lấy danh sách template lộ trình theo CategoryId
 */
export async function getRoadmapTemplate(categoryId) {
  const numId = Number(categoryId);
  if (CAREER_ROADMAP_TEMPLATES[numId]) {
    return CAREER_ROADMAP_TEMPLATES[numId];
  }
  if (_templateCache.has(numId)) {
    return _templateCache.get(numId);
  }
  const tpl = await generateDynamicTemplateForCategory(categoryId);
  if (tpl) {
    _templateCache.set(numId, tpl);
  }
  return tpl;
}

/**
 * Khởi tạo hoặc gieo hạt bộ câu hỏi mẫu vào database nếu chưa có.
 */
export async function ensureSeedQuestions() {
  const db = await getMongoDb();
  const questionsColl = db.collection(COLLECTION_ROADMAP_QUESTIONS);

  const count = await questionsColl.countDocuments();
  if (count === 0) {
    await questionsColl.insertMany(SEED_STAGE_QUESTIONS.map(q => ({
      ...q,
      created_at: new Date()
    })));
  }
}

/**
 * QUY TẮC CỐT LÕI VỀ TRẠNG THÁI NODE (ĐẶC BIỆT LÀ TRẠNG THÁI REVIEW):
 * 1. Nếu node đang là 'review' (hoặc is_review === true):
 *    -> TUYỆT ĐỐI KHÔNG TỰ CHUYỂN VỀ 'not_started', 'in_progress' hay 'completed'.
 *    -> Trạng thái 'review' chỉ được gỡ bỏ thông qua cơ chế Flashcard (ở pha phát triển sau).
 * 2. Nếu node bị đánh rớt trong bài test (điểm bài test của node < 40%):
 *    -> Nếu trước đó đã học (in_progress hoặc completed), đánh dấu thành 'review'!
 * 3. Nếu điểm đạt:
 *    -> Score >= 80%: completed
 *    -> 40% <= Score < 80%: in_progress
 *    -> Score < 40%: not_started (nếu mới tinh) hoặc review (nếu rớt bài test)
 */
export function determineNodeStatus(currentStatus, newScore, wasFailedInTest = false) {
  // Quy tắc người dùng: Một khi đã review thì giữ nguyên review
  if (currentStatus === STATUS_REVIEW) {
    return STATUS_REVIEW;
  }

  // Nếu bài test bị rớt mà trước đó đã học
  if (wasFailedInTest && (currentStatus === STATUS_IN_PROGRESS || currentStatus === STATUS_COMPLETED)) {
    return STATUS_REVIEW;
  }

  if (newScore >= 80) return STATUS_COMPLETED;
  if (newScore >= 40) return STATUS_IN_PROGRESS;
  if (newScore > 0) return STATUS_IN_PROGRESS;
  return STATUS_NOT_STARTED;
}

/**
 * Hàm tính tiến độ học lộ trình: (số node hoàn thành / tổng số node) * 100
 * @param {Array<object>} nodes - Danh sách nodes kỹ năng
 * @returns {{ completed_nodes: number, total_nodes: number, progress_percentage: number }}
 */
export function calculateRoadmapProgress(nodes = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return {
      completed_nodes: 0,
      total_nodes: 0,
      progress_percentage: 0
    };
  }

  const totalNodes = nodes.length;
  const completedNodes = nodes.filter(n => n && n.status === STATUS_COMPLETED).length;
  const progressPercentage = Math.round((completedNodes / totalNodes) * 100);

  return {
    completed_nodes: completedNodes,
    total_nodes: totalNodes,
    progress_percentage: progressPercentage
  };
}

// ─── 4. Các Hàm Nghiệp Vụ Chính (Services) ──────────────────────────────────

/**
 * 1. Lấy danh sách tất cả các nghề nghiệp có lộ trình học (Dựa vào 17 category)
 */
export async function getCareerRoadmapsList() {
  const db = await getMongoDb();
  const categories = await db.collection('course_categories').find().sort({ category_id: 1 }).toArray();

  const results = [];
  for (const cat of categories) {
    const numId = Number(cat.category_id);
    const hasCustom = Boolean(CAREER_ROADMAP_TEMPLATES[numId]);
    let totalStages = 3;
    let totalNodes = 10;

    if (hasCustom) {
      const customTpl = CAREER_ROADMAP_TEMPLATES[numId];
      totalStages = customTpl.stages.length;
      totalNodes = customTpl.stages.reduce((acc, s) => acc + s.nodes.length, 0);
    } else if (_templateCache.has(numId)) {
      const cachedTpl = _templateCache.get(numId);
      totalStages = cachedTpl.stages.length;
      totalNodes = cachedTpl.stages.reduce((acc, s) => acc + s.nodes.length, 0);
    }

    results.push({
      category_id: numId,
      career_name: cat.name,
      description: cat.description || `Lộ trình phát triển sự nghiệp nghề ${cat.name}`,
      total_stages: totalStages,
      total_nodes: totalNodes,
      has_custom_template: hasCustom
    });
  }

  return results.sort((a, b) => a.category_id - b.category_id);
}

/**
 * 2. Chọn và kích hoạt một lộ trình nghề nghiệp cho người dùng
 */
export async function selectUserRoadmap(userId, categoryId) {
  if (!userId) {
    const err = new Error('Thiếu thông tin người dùng.');
    err.status = 401;
    throw err;
  }

  const numId = Number(categoryId);
  if (!numId || isNaN(numId)) {
    const err = new Error('category_id không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const template = await getRoadmapTemplate(numId);
  if (!template) {
    const err = new Error('Không tìm thấy lộ trình nghề nghiệp tương ứng.');
    err.status = 404;
    throw err;
  }

  const db = await getMongoDb();
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);

  // Hủy active các roadmap trước đó của user (nếu có)
  await roadmapsColl.updateMany(
    { user_id: String(userId), is_active: true },
    { $set: { is_active: false, updated_at: new Date() } }
  );

  // Kiểm tra xem user đã từng tạo roadmap cho category này chưa
  let userRoadmap = await roadmapsColl.findOne({
    user_id: String(userId),
    category_id: numId
  });

  if (!userRoadmap) {
    // Khởi tạo danh sách các node với trạng thái ban đầu not_started
    const initialNodes = [];
    template.stages.forEach(stage => {
      stage.nodes.forEach(node => {
        initialNodes.push({
          node_id: node.node_id,
          stage_id: stage.stage_id,
          title: node.title,
          level: node.level,
          tags: node.tags || [],
          status: STATUS_NOT_STARTED,
          score: 0,
          is_review: false,
          last_quiz_score: null,
          course_score: null,
          updated_at: new Date()
        });
      });
    });

    userRoadmap = {
      user_id: String(userId),
      category_id: numId,
      career_name: template.career_name,
      current_stage_id: template.stages[0]?.stage_id || null,
      nodes: initialNodes,
      progress_percentage: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    const insertResult = await roadmapsColl.insertOne(userRoadmap);
    userRoadmap._id = insertResult.insertedId;
  } else {
    // Kích hoạt lại roadmap hiện có
    await roadmapsColl.updateOne(
      { _id: userRoadmap._id },
      { $set: { is_active: true, updated_at: new Date() } }
    );
    userRoadmap.is_active = true;
  }

  return userRoadmap;
}

/**
 * 3. Lấy thông tin lộ trình hiện tại của người dùng
 */
export async function getMyRoadmap(userId) {
  if (!userId) {
    const err = new Error('Thiếu thông tin người dùng.');
    err.status = 401;
    throw err;
  }

  const db = await getMongoDb();
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);

  // Tìm roadmap đang active hoặc roadmap mới nhất
  const userRoadmap = await roadmapsColl.findOne(
    { user_id: String(userId), is_active: true },
    { sort: { updated_at: -1 } }
  );

  if (!userRoadmap) {
    return {
      has_roadmap: false,
      message: 'Người dùng chưa kích hoạt lộ trình học nào.'
    };
  }

  const template = await getRoadmapTemplate(userRoadmap.category_id);

  // Gắn trạng thái node hiện tại vào cấu trúc template stage để trả về cây kỹ năng trực quan
  const nodeMap = {};
  (userRoadmap.nodes || []).forEach(n => { nodeMap[n.node_id] = n; });

  const enrichedStages = (template?.stages || []).map(stage => {
    const enrichedNodes = stage.nodes.map(node => {
      const userNode = nodeMap[node.node_id] || {};
      return {
        ...node,
        status: userNode.status || STATUS_NOT_STARTED,
        score: userNode.score || 0,
        is_review: Boolean(userNode.is_review || userNode.status === STATUS_REVIEW),
        last_quiz_score: userNode.last_quiz_score ?? null,
        course_score: userNode.course_score ?? null,
        updated_at: userNode.updated_at || null
      };
    });

    const stageProg = calculateRoadmapProgress(enrichedNodes);
    const reviewNodes = enrichedNodes.filter(n => n.status === STATUS_REVIEW).length;

    return {
      stage_id: stage.stage_id,
      title: stage.title,
      description: stage.description,
      order: stage.order,
      progress_percentage: stageProg.progress_percentage,
      total_nodes: stageProg.total_nodes,
      completed_nodes: stageProg.completed_nodes,
      review_nodes: reviewNodes,
      nodes: enrichedNodes
    };
  });

  const overall = calculateRoadmapProgress(userRoadmap.nodes || []);

  return {
    has_roadmap: true,
    roadmap_id: userRoadmap._id,
    category_id: userRoadmap.category_id,
    career_name: userRoadmap.career_name,
    current_stage_id: userRoadmap.current_stage_id,
    overall_progress: overall.progress_percentage,
    progress_percentage: overall.progress_percentage, // Tiện ích hỗ trợ truy xuất đồng bộ
    total_nodes: overall.total_nodes,
    completed_nodes: overall.completed_nodes,
    stages: enrichedStages,
    raw_nodes: userRoadmap.nodes
  };
}

/**
 * 4. Lấy bộ câu hỏi (~10 câu) cho bài test giai đoạn.
 * Quan trọng: Không trả về `correct_option` và `explanation` để chống gian lận.
 */
export async function getStageTestQuestions(stageId) {
  if (!stageId) {
    const err = new Error('Thiếu stageId.');
    err.status = 400;
    throw err;
  }

  await ensureSeedQuestions();
  const db = await getMongoDb();
  const questionsColl = db.collection(COLLECTION_ROADMAP_QUESTIONS);

  let questions = await questionsColl.find({ stage_id: String(stageId) }).toArray();

  // Nếu stage này chưa có câu hỏi trong database, tạo 10 câu hỏi suy luận dựa trên node của stage
  if (questions.length === 0) {
    // Tìm stage trong các template
    let foundStage = null;
    for (const key of Object.keys(CAREER_ROADMAP_TEMPLATES)) {
      const t = CAREER_ROADMAP_TEMPLATES[key];
      const s = t.stages.find(st => st.stage_id === stageId);
      if (s) { foundStage = s; break; }
    }

    if (foundStage && foundStage.nodes?.length > 0) {
      const generated = [];
      const nodes = foundStage.nodes;
      for (let i = 0; i < 10; i++) {
        const node = nodes[i % nodes.length];
        generated.push({
          question_id: `${stageId}-gen-q${i + 1}`,
          stage_id: stageId,
          node_id: node.node_id,
          question_text: `Câu hỏi đánh giá năng lực ${i + 1}: Hãy xác định kỹ thuật chính xác nhất liên quan đến "${node.title}"?`,
          options: [
            { key: 'A', text: `Áp dụng chuẩn phương pháp cho ${node.title}` },
            { key: 'B', text: `Thực hiện cấu hình sai phạm vi của ${node.title}` },
            { key: 'C', text: `Bỏ qua kiểm tra ràng buộc của ${node.title}` },
            { key: 'D', text: `Không khuyến nghị sử dụng ${node.title}` }
          ],
          correct_option: 'A',
          explanation: `Lựa chọn A là thực hành chuẩn mực cho kỹ năng ${node.title}.`,
          created_at: new Date()
        });
      }
      await questionsColl.insertMany(generated);
      questions = generated;
    }
  }

  // Giới hạn khoảng 10 câu hỏi và ẩn đáp án
  const safeQuestions = questions.slice(0, 10).map(q => ({
    question_id: q.question_id,
    stage_id: q.stage_id,
    node_id: q.node_id,
    question_text: q.question_text,
    options: q.options
  }));

  return {
    stage_id: stageId,
    total_questions: safeQuestions.length,
    questions: safeQuestions
  };
}

/**
 * 5. Chấm bài test giai đoạn, phân rã kết quả theo từng Node kỹ năng,
 * tính điểm EWMA và cập nhật trạng thái Node theo quy tắc nghiêm ngặt.
 */
export async function submitStageTest(userId, stageId, answers = []) {
  if (!userId) {
    const err = new Error('Thiếu thông tin người dùng.');
    err.status = 401;
    throw err;
  }

  if (!stageId) {
    const err = new Error('Thiếu stageId.');
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    const err = new Error('Danh sách câu trả lời không hợp lệ hoặc đang rỗng.');
    err.status = 400;
    throw err;
  }

  await ensureSeedQuestions();
  const db = await getMongoDb();
  const questionsColl = db.collection(COLLECTION_ROADMAP_QUESTIONS);
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);
  const submissionsColl = db.collection(COLLECTION_ROADMAP_SUBMISSIONS);

  // Tìm các câu hỏi gốc trong DB có đáp án đúng
  const questionIds = answers.map(a => a.question_id);
  const rawQuestions = await questionsColl.find({ question_id: { $in: questionIds } }).toArray();
  const questionMap = {};
  rawQuestions.forEach(q => { questionMap[q.question_id] = q; });

  let totalCorrect = 0;
  const detailedAnswers = [];
  // Thống kê phân rã theo Node: { [node_id]: { correct: 0, total: 0 } }
  const nodeBreakdown = {};

  answers.forEach(userAns => {
    const original = questionMap[userAns.question_id];
    if (!original) return;

    const isCorrect = String(userAns.selected_option).trim().toUpperCase() === String(original.correct_option).trim().toUpperCase();
    if (isCorrect) totalCorrect++;

    const nodeId = original.node_id || 'unknown';
    if (!nodeBreakdown[nodeId]) {
      nodeBreakdown[nodeId] = { correct: 0, total: 0 };
    }
    nodeBreakdown[nodeId].total++;
    if (isCorrect) {
      nodeBreakdown[nodeId].correct++;
    }

    detailedAnswers.push({
      question_id: original.question_id,
      node_id: nodeId,
      selected_option: userAns.selected_option,
      correct_option: original.correct_option,
      is_correct: isCorrect,
      explanation: original.explanation || ''
    });
  });

  const totalGraded = detailedAnswers.length;
  const overallPercentage = totalGraded > 0 ? Math.round((totalCorrect / totalGraded) * 100) : 0;

  // Lấy roadmap của user để cập nhật Node
  const userRoadmap = await roadmapsColl.findOne({
    user_id: String(userId),
    is_active: true
  });

  const nodeResults = {};

  if (userRoadmap && Array.isArray(userRoadmap.nodes)) {
    const updatedNodes = userRoadmap.nodes.map(node => {
      const breakdown = nodeBreakdown[node.node_id];
      if (!breakdown) {
        // Node này không có câu hỏi trong bài test hiện tại, giữ nguyên
        return node;
      }

      const nodeQuizScore = Math.round((breakdown.correct / breakdown.total) * 100);
      const wasFailedInTest = nodeQuizScore < 40;

      // Tính điểm EWMA nếu trước đó đã có điểm
      let finalNodeScore = nodeQuizScore;
      if (typeof node.score === 'number' && node.score > 0) {
        finalNodeScore = Math.round(EWMA_ALPHA * nodeQuizScore + (1 - EWMA_ALPHA) * node.score);
      }

      // Xác định trạng thái mới dựa trên quy tắc bảo toàn review
      let nextStatus = determineNodeStatus(node.status, finalNodeScore, wasFailedInTest);
      let isReviewFlag = node.is_review || nextStatus === STATUS_REVIEW;

      // Nếu đã mang cờ review thì trạng thái bắt buộc là review
      if (isReviewFlag) {
        nextStatus = STATUS_REVIEW;
      }

      nodeResults[node.node_id] = {
        title: node.title,
        correct: breakdown.correct,
        total: breakdown.total,
        quiz_score: nodeQuizScore,
        new_overall_score: finalNodeScore,
        old_status: node.status,
        new_status: nextStatus,
        is_review: isReviewFlag
      };

      return {
        ...node,
        score: finalNodeScore,
        status: nextStatus,
        is_review: isReviewFlag,
        last_quiz_score: nodeQuizScore,
        updated_at: new Date()
      };
    });

    const progressStats = calculateRoadmapProgress(updatedNodes);

    // Cập nhật lại vào cơ sở dữ liệu
    await roadmapsColl.updateOne(
      { _id: userRoadmap._id },
      {
        $set: {
          nodes: updatedNodes,
          progress_percentage: progressStats.progress_percentage,
          updated_at: new Date()
        }
      }
    );
  }

  // Lưu lịch sử bài test
  const submissionRecord = {
    user_id: String(userId),
    stage_id: stageId,
    total_questions: totalGraded,
    correct_count: totalCorrect,
    score_percentage: overallPercentage,
    node_breakdown: nodeResults,
    submitted_at: new Date()
  };

  const insertSub = await submissionsColl.insertOne(submissionRecord);

  return {
    submission_id: insertSub.insertedId,
    stage_id: stageId,
    total_questions: totalGraded,
    correct_count: totalCorrect,
    score_percentage: overallPercentage,
    passed: overallPercentage >= 70,
    node_breakdown: nodeResults,
    detailed_results: detailedAnswers
  };
}

/**
 * 6. Đồng bộ tiến độ các khóa học đã mua vào các Node của Roadmap.
 * Tính trọng số hoàn thành khóa học tương ứng với các Tag kỹ năng của Node.
 */
export async function syncCourseProgressToRoadmap(userId) {
  if (!userId) {
    const err = new Error('Thiếu thông tin người dùng.');
    err.status = 401;
    throw err;
  }

  const db = await getMongoDb();
  const roadmapsColl = db.collection(COLLECTION_USER_ROADMAPS);

  const userRoadmap = await roadmapsColl.findOne({
    user_id: String(userId),
    is_active: true
  });

  if (!userRoadmap) {
    const err = new Error('Người dùng chưa kích hoạt lộ trình học nào để đồng bộ.');
    err.status = 404;
    throw err;
  }

  // 1. Tìm các khóa học người dùng đã ghi danh (enrollments)
  const enrollments = await db.collection('user_enrollments').find({
    $or: [{ user_id: String(userId) }, { user_id: Number(userId) }]
  }).toArray();

  if (enrollments.length === 0) {
    return {
      synced: false,
      message: 'Người dùng chưa ghi danh khóa học nào, không có tiến độ để đồng bộ.',
      synced_nodes: []
    };
  }

  // 2. Lấy tags của từng khóa học đã mua
  const courseIds = enrollments.map(e => e.course_id);
  const courseTags = await db.collection('course_tags').find({
    $or: [
      { course_id: { $in: courseIds } },
      { course_id: { $in: courseIds.map(String) } },
      { course_id: { $in: courseIds.map(Number).filter(n => !isNaN(n)) } }
    ]
  }).toArray();

  const allTags = await db.collection('tags').find().toArray();
  const tagIdToName = {};
  allTags.forEach(t => { tagIdToName[t.tag_id] = t.name; });

  // Map: course_id -> list of tag names
  const courseTagMap = {};
  courseTags.forEach(ct => {
    const cId = String(ct.course_id);
    if (!courseTagMap[cId]) courseTagMap[cId] = [];
    const tagName = tagIdToName[ct.tag_id];
    if (tagName) courseTagMap[cId].push(tagName.toLowerCase());
  });

  // Map: course_id -> progress percentage (0 - 100)
  const courseProgressMap = {};
  enrollments.forEach(e => {
    const cId = String(e.course_id);
    const progress = Math.min(100, Math.max(0, Number(e.progress_percentage) || 0));
    courseProgressMap[cId] = progress;
  });

  // 3. Duyệt qua tất cả các roadmap của người dùng để cập nhật tiến độ theo tag
  const allUserRoadmaps = await roadmapsColl.find({
    user_id: String(userId)
  }).toArray();

  const syncRoadmapsList = allUserRoadmaps.length > 0 ? allUserRoadmaps : [userRoadmap];
  const allSyncedRoadmapsProgress = [];
  const syncedNodesLog = [];

  for (const roadmapDoc of syncRoadmapsList) {
    const updatedNodes = (roadmapDoc.nodes || []).map(node => {
      const nodeTags = (node.tags || []).map(t => String(t).toLowerCase());
      if (nodeTags.length === 0) return node;

      // Tìm các khóa học đã mua có chứa ít nhất một tag của node
      const matchingCoursesProgress = [];
      for (const [cId, tags] of Object.entries(courseTagMap)) {
        const hasMatch = tags.some(t => nodeTags.includes(t));
        if (hasMatch) {
          matchingCoursesProgress.push(courseProgressMap[cId] || 0);
        }
      }

      if (matchingCoursesProgress.length === 0) return node;

      // Điểm trung bình từ các khóa học liên quan
      const avgCourseProgress = Math.round(
        matchingCoursesProgress.reduce((a, b) => a + b, 0) / matchingCoursesProgress.length
      );

      // Tính điểm tổng hợp: nếu chưa có bài quiz thì lấy trực tiếp điểm khóa học;
      // nếu đã có bài quiz thì kết hợp 50% quiz + 50% khóa học
      let combinedScore = avgCourseProgress;
      if (typeof node.last_quiz_score === 'number' && node.last_quiz_score !== null) {
        combinedScore = Math.round(0.5 * node.last_quiz_score + 0.5 * avgCourseProgress);
      }

      // Bảo toàn trạng thái review: Nếu node đang ở trạng thái review thì giữ nguyên review
      let nextStatus = determineNodeStatus(node.status, combinedScore, false);
      if (node.is_review || node.status === STATUS_REVIEW) {
        nextStatus = STATUS_REVIEW;
      }

      if (roadmapDoc.is_active) {
        syncedNodesLog.push({
          node_id: node.node_id,
          title: node.title,
          matched_courses: matchingCoursesProgress.length,
          avg_course_progress: avgCourseProgress,
          old_score: node.score,
          new_score: combinedScore,
          old_status: node.status,
          new_status: nextStatus
        });
      }

      return {
        ...node,
        course_score: avgCourseProgress,
        score: combinedScore,
        status: nextStatus,
        updated_at: new Date()
      };
    });

    const progressStats = calculateRoadmapProgress(updatedNodes);

    await roadmapsColl.updateOne(
      { _id: roadmapDoc._id },
      {
        $set: {
          nodes: updatedNodes,
          progress_percentage: progressStats.progress_percentage,
          updated_at: new Date()
        }
      }
    );

    allSyncedRoadmapsProgress.push({
      category_id: roadmapDoc.category_id,
      career_name: roadmapDoc.career_name,
      is_active: Boolean(roadmapDoc.is_active),
      ...progressStats
    });
  }

  const activeRoadmapStats = allSyncedRoadmapsProgress.find(r => r.is_active) || allSyncedRoadmapsProgress[0] || {};

  return {
    synced: true,
    message: `Đã đồng bộ tiến độ từ ${enrollments.length} khóa học vào lộ trình học.`,
    total_enrolled_courses: enrollments.length,
    active_roadmap_progress: activeRoadmapStats,
    all_roadmaps_progress: allSyncedRoadmapsProgress,
    synced_nodes: syncedNodesLog
  };
}

/**
 * 7. Lấy lịch sử làm bài test của người dùng
 */
export async function getUserSubmissionHistory(userId, stageId = null) {
  if (!userId) {
    const err = new Error('Thiếu thông tin người dùng.');
    err.status = 401;
    throw err;
  }

  const db = await getMongoDb();
  const query = { user_id: String(userId) };
  if (stageId) query.stage_id = String(stageId);

  return await db.collection(COLLECTION_ROADMAP_SUBMISSIONS)
    .find(query)
    .sort({ submitted_at: -1 })
    .toArray();
}

// ─── 5. Router Cho Express ──────────────────────────────────────────────────

/**
 * Khởi tạo Router gắn vào hệ thống ThinkUp Server
 * @param {object} express - Thư viện express
 * @param {Function} requireAuth - Middleware xác thực JWT
 */
export function createRoadmapRouter(express, requireAuth) {
  const router = express.Router();

  /**
   * GET /api/user/roadmap/careers
   * Danh sách nghề nghiệp và tổng quan lộ trình
   */
  router.get('/careers', async (req, res, next) => {
    try {
      const data = await getCareerRoadmapsList();
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/roadmap/template/:categoryId
   * Lấy cấu trúc chi tiết các giai đoạn và node của nghề
   */
  router.get('/template/:categoryId', async (req, res, next) => {
    try {
      const data = await getRoadmapTemplate(req.params.categoryId);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cấu trúc lộ trình cho nghề này.'
        });
      }
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/user/roadmap/select
   * Chọn/kích hoạt lộ trình nghề nghiệp
   */
  router.post('/select', requireAuth, async (req, res, next) => {
    try {
      const { category_id } = req.body || {};
      const data = await selectUserRoadmap(req.userId, category_id);
      res.json({
        success: true,
        message: `Đã kích hoạt lộ trình nghề ${data.career_name} thành công.`,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/roadmap/my-roadmap
   * Lấy lộ trình hiện tại của user cùng toàn bộ node và trạng thái
   */
  router.get('/my-roadmap', requireAuth, async (req, res, next) => {
    try {
      const data = await getMyRoadmap(req.userId);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/roadmap/stage-test/:stageId
   * Lấy bộ câu hỏi (~10 câu) cho bài test giai đoạn (ẩn đáp án)
   */
  router.get('/stage-test/:stageId', requireAuth, async (req, res, next) => {
    try {
      const data = await getStageTestQuestions(req.params.stageId);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/user/roadmap/stage-test/:stageId/submit
   * Nộp bài test giai đoạn, chấm điểm phân rã, cập nhật EWMA và trạng thái Node
   */
  router.post('/stage-test/:stageId/submit', requireAuth, async (req, res, next) => {
    try {
      const { answers } = req.body || {};
      const result = await submitStageTest(req.userId, req.params.stageId, answers);
      res.json({
        success: true,
        message: 'Chấm bài kiểm tra giai đoạn thành công.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/user/roadmap/sync-course
   * Đồng bộ tiến độ từ các khóa học đã mua vào các Node roadmap
   */
  router.post('/sync-course', requireAuth, async (req, res, next) => {
    try {
      const result = await syncCourseProgressToRoadmap(req.userId);
      res.json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/user/roadmap/history
   * Xem lịch sử các lần làm bài test giai đoạn
   */
  router.get('/history', requireAuth, async (req, res, next) => {
    try {
      const { stage_id } = req.query || {};
      const data = await getUserSubmissionHistory(req.userId, stage_id);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
