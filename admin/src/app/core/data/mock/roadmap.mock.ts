import { Roadmap, RoadmapStudio } from '../../../features/courses/models/course.models';

// TODO(pre-deploy): Nhớ xóa dữ liệu mock lộ trình và Roadmap Studio khi backend cung cấp API.

export const MOCK_ROADMAPS: Roadmap[] = [
  {
    id: 'roadmap-fe',
    code: 'RO-FE01',
    name: 'Front-end Developer',
    industry: 'Lập trình Web',
    stages: 6,
    nodes: 28,
    learners: 18_420,
    completion: 25,
    coverage: 100,
    coverageAvg: 3.2,
    testPassed: 34,
    testTotal: 34,
    missingTests: 0,
    hidden: false
  },
  {
    id: 'roadmap-da',
    code: 'RO-DA02',
    name: 'Data Analyst',
    industry: 'Phân tích dữ liệu',
    stages: 5,
    nodes: 22,
    learners: 12_860,
    completion: 41,
    coverage: 91,
    coverageAvg: 2.8,
    testPassed: 25,
    testTotal: 27,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-pd',
    code: 'RO-PD03',
    name: 'Product Designer',
    industry: 'Thiết kế sản phẩm',
    stages: 4,
    nodes: 18,
    learners: 8_240,
    completion: 36,
    coverage: 88,
    coverageAvg: 2.4,
    testPassed: 19,
    testTotal: 22,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-mb',
    code: 'RO-MB04',
    name: 'Mobile Developer',
    industry: 'Lập trình di động',
    stages: 5,
    nodes: 24,
    learners: 5_760,
    completion: 18,
    coverage: 84,
    coverageAvg: 2.1,
    testPassed: 21,
    testTotal: 29,
    missingTests: 8,
    hidden: true
  }
];

export const MOCK_STUDIOS: RoadmapStudio[] = [
  {
    roadmapId: 'roadmap-fe',
    selectedNodeId: 'node-react-framework',
    threshold: 70,
    phases: [
      {
        id: 'phase-1',
        no: '01',
        name: 'Nền tảng Web',
        nodes: [
          {
            id: 'node-html-css', name: 'HTML & CSS', type: 'Ngôn ngữ', level: 'Cơ bản', industry: 'Lập trình Web',
            description: 'Xây dựng bố cục trang web chuẩn ngữ nghĩa và responsive.',
            outcomes: 'Semantic HTML · Flexbox · Grid', tags: ['html', 'css', 'layout']
          },
          {
            id: 'node-js-basic', name: 'JavaScript cơ bản', type: 'Ngôn ngữ', level: 'Cơ bản', industry: 'Lập trình Web',
            description: 'Nắm cú pháp, kiểu dữ liệu và DOM của JavaScript.',
            outcomes: 'Cú pháp · DOM · Event', tags: ['javascript', 'dom']
          }
        ]
      },
      {
        id: 'phase-2',
        no: '02',
        name: 'Front-end Framework',
        nodes: [
          {
            id: 'node-react-basic', name: 'React cơ bản', type: 'Framework', level: 'Cơ bản', industry: 'Lập trình Web',
            description: 'Làm quen component, JSX và luồng render của React.',
            outcomes: 'JSX · Component · Props', tags: ['react', 'jsx']
          },
          {
            id: 'node-react-framework', name: 'React – Framework', type: 'Framework', level: 'Trung cấp', industry: 'Lập trình Web',
            description: 'Làm chủ React để xây dựng giao diện web hiện đại, có khả năng tái sử dụng.',
            outcomes: 'Tạo component · Quản lý props/state · Sử dụng Hooks',
            tags: ['react', 'reactjs', 'component', 'props', 'hooks', 'virtual-dom']
          },
          {
            id: 'node-state', name: 'State management', type: 'Kỹ năng', level: 'Trung cấp', industry: 'Lập trình Web',
            description: 'Quản lý trạng thái phức tạp và chia sẻ dữ liệu giữa các thành phần.',
            outcomes: 'Context · Redux · Zustand', tags: ['state', 'redux']
          }
        ]
      },
      {
        id: 'phase-3',
        no: '03',
        name: 'Tối ưu giao diện',
        nodes: [
          {
            id: 'node-responsive', name: 'Responsive UI', type: 'Kỹ năng', level: 'Trung cấp', industry: 'Lập trình Web',
            description: 'Thiết kế giao diện thích ứng trên nhiều kích thước màn hình.',
            outcomes: 'Breakpoint · Fluid layout · Accessibility', tags: ['responsive', 'a11y']
          }
        ]
      },
      {
        id: 'phase-4',
        no: '04',
        name: 'Dự án thực tế',
        nodes: [
          {
            id: 'node-project', name: 'Portfolio project', type: 'Dự án', level: 'Nâng cao', industry: 'Lập trình Web',
            description: 'Hoàn thiện một sản phẩm web thực tế và triển khai công khai.',
            outcomes: 'Kiến trúc · Kiểm thử · Triển khai', tags: ['project', 'deploy']
          }
        ]
      }
    ],
    suggestions: [
      { id: 'sug-1', title: 'React căn bản đến nâng cao', level: 'Trung cấp', match: 96 },
      { id: 'sug-2', title: 'Xây dựng UI với React Hooks', level: 'Trung cấp', match: 91 },
      { id: 'sug-3', title: 'React & Component Architecture', level: 'Trung cấp', match: 86 },
      { id: 'sug-4', title: 'TypeScript cho React', level: 'Trung cấp', match: 78 }
    ],
    test: {
      name: 'Bài test đánh giá năng lực: React Core',
      duration: 15,
      passScore: 80,
      stage: '03 · Front-end Framework',
      questions: [
        {
          id: 'q-1',
          index: 1,
          title: '01 Trắc nghiệm · React Core',
          meta: '4 phương án · 1 đáp án đúng',
          prompt: 'Đoạn mã HTML và CSS dưới đây sẽ hiển thị kết quả như thế nào?',
          language: 'HTML / CSS',
          code: '<div class="card">ThinkUp</div>\n.card { display: flex; color: #2563EB; }\n.card { justify-content: center; }',
          answers: [
            { letter: 'A', text: 'Nội dung nằm bên trái, chữ màu đen', correct: false },
            { letter: 'B', text: 'Nội dung căn giữa, chữ màu xanh', correct: true },
            { letter: 'C', text: 'Nội dung căn giữa, chữ màu đen', correct: false },
            { letter: 'D', text: 'Không hiển thị do thiếu thuộc tính', correct: false }
          ],
          hint: 'Hãy chú ý thuộc tính display: flex và xem justify-content căn chỉnh nội dung theo hướng nào. Sau đó kiểm tra giá trị color để xác định màu chữ.',
          hintSaved: false
        }
      ]
    }
  },
  {
    roadmapId: 'roadmap-da',
    selectedNodeId: 'node-sql',
    threshold: 70,
    phases: [
      {
        id: 'phase-da-1', no: '01', name: 'Nền tảng dữ liệu', nodes: [
          {
            id: 'node-sql', name: 'SQL nền tảng', type: 'Ngôn ngữ', level: 'Cơ bản', industry: 'Phân tích dữ liệu',
            description: 'Viết truy vấn SELECT, lọc và sắp xếp dữ liệu.',
            outcomes: 'SELECT · WHERE · ORDER BY', tags: ['sql', 'select']
          }
        ]
      }
    ],
    suggestions: [
      { id: 'sug-da-1', title: 'SQL cho người mới', level: 'Cơ bản', match: 94 },
      { id: 'sug-da-2', title: 'Data Analyst với SQL', level: 'Trung cấp', match: 89 }
    ],
    test: {
      name: 'Bài test đánh giá năng lực: SQL Core',
      duration: 20,
      passScore: 75,
      stage: '01 · Nền tảng dữ liệu',
      questions: [
        {
          id: 'q-da-1', index: 1, title: '01 Trắc nghiệm · SQL Core', meta: '4 phương án · 1 đáp án đúng',
          prompt: 'Mệnh đề nào dùng để lọc dữ liệu trong câu lệnh SELECT?',
          language: 'SQL', code: 'SELECT * FROM courses\n-- lọc các khóa đang xuất bản',
          answers: [
            { letter: 'A', text: 'WHERE', correct: true },
            { letter: 'B', text: 'GROUP BY', correct: false },
            { letter: 'C', text: 'ORDER BY', correct: false },
            { letter: 'D', text: 'LIMIT', correct: false }
          ],
          hint: 'Mệnh đề này đứng sau FROM và trước GROUP BY.', hintSaved: false
        }
      ]
    }
  }
];
