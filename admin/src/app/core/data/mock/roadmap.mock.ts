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
  },
  {
    id: 'roadmap-be',
    code: 'RO-BE05',
    name: 'Back-end Developer',
    industry: 'Lập trình Web',
    stages: 6,
    nodes: 30,
    learners: 21_350,
    completion: 33,
    coverage: 96,
    coverageAvg: 3.1,
    testPassed: 38,
    testTotal: 41,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-fs',
    code: 'RO-FS06',
    name: 'Full-stack Developer',
    industry: 'Lập trình Web',
    stages: 7,
    nodes: 36,
    learners: 16_780,
    completion: 22,
    coverage: 89,
    coverageAvg: 2.9,
    testPassed: 40,
    testTotal: 47,
    missingTests: 7,
    hidden: false
  },
  {
    id: 'roadmap-do',
    code: 'RO-DO07',
    name: 'DevOps Engineer',
    industry: 'Hạ tầng & DevOps',
    stages: 5,
    nodes: 26,
    learners: 9_640,
    completion: 29,
    coverage: 93,
    coverageAvg: 2.7,
    testPassed: 28,
    testTotal: 30,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-cl',
    code: 'RO-CL08',
    name: 'Cloud Engineer',
    industry: 'Hạ tầng & DevOps',
    stages: 5,
    nodes: 24,
    learners: 7_910,
    completion: 31,
    coverage: 90,
    coverageAvg: 2.6,
    testPassed: 24,
    testTotal: 27,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-de',
    code: 'RO-DE09',
    name: 'Data Engineer',
    industry: 'Phân tích dữ liệu',
    stages: 6,
    nodes: 28,
    learners: 11_240,
    completion: 27,
    coverage: 95,
    coverageAvg: 3.0,
    testPassed: 32,
    testTotal: 34,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-ds',
    code: 'RO-DS10',
    name: 'Data Scientist',
    industry: 'Phân tích dữ liệu',
    stages: 6,
    nodes: 32,
    learners: 10_580,
    completion: 35,
    coverage: 87,
    coverageAvg: 2.8,
    testPassed: 30,
    testTotal: 36,
    missingTests: 6,
    hidden: true
  },
  {
    id: 'roadmap-ai',
    code: 'RO-AI11',
    name: 'AI Engineer',
    industry: 'Trí tuệ nhân tạo',
    stages: 6,
    nodes: 34,
    learners: 8_930,
    completion: 24,
    coverage: 84,
    coverageAvg: 2.5,
    testPassed: 27,
    testTotal: 35,
    missingTests: 8,
    hidden: false
  },
  {
    id: 'roadmap-ml',
    code: 'RO-ML12',
    name: 'Machine Learning Engineer',
    industry: 'Trí tuệ nhân tạo',
    stages: 7,
    nodes: 38,
    learners: 6_720,
    completion: 19,
    coverage: 82,
    coverageAvg: 2.4,
    testPassed: 29,
    testTotal: 38,
    missingTests: 9,
    hidden: false
  },
  {
    id: 'roadmap-ba',
    code: 'RO-BA13',
    name: 'Business Analyst',
    industry: 'Phân tích nghiệp vụ',
    stages: 4,
    nodes: 20,
    learners: 13_460,
    completion: 44,
    coverage: 92,
    coverageAvg: 2.2,
    testPassed: 20,
    testTotal: 22,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-pm',
    code: 'RO-PM14',
    name: 'Product Manager',
    industry: 'Quản lý sản phẩm',
    stages: 5,
    nodes: 22,
    learners: 9_180,
    completion: 38,
    coverage: 89,
    coverageAvg: 2.3,
    testPassed: 21,
    testTotal: 24,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-ux',
    code: 'RO-UX15',
    name: 'UX Researcher',
    industry: 'Thiết kế sản phẩm',
    stages: 4,
    nodes: 16,
    learners: 5_340,
    completion: 33,
    coverage: 94,
    coverageAvg: 2.0,
    testPassed: 16,
    testTotal: 17,
    missingTests: 1,
    hidden: false
  },
  {
    id: 'roadmap-ui',
    code: 'RO-UI16',
    name: 'UI Designer',
    industry: 'Thiết kế sản phẩm',
    stages: 4,
    nodes: 18,
    learners: 7_860,
    completion: 40,
    coverage: 96,
    coverageAvg: 2.3,
    testPassed: 18,
    testTotal: 19,
    missingTests: 1,
    hidden: false
  },
  {
    id: 'roadmap-mo',
    code: 'RO-MO17',
    name: 'Motion Designer',
    industry: 'Thiết kế sáng tạo',
    stages: 4,
    nodes: 17,
    learners: 4_210,
    completion: 26,
    coverage: 78,
    coverageAvg: 1.9,
    testPassed: 12,
    testTotal: 17,
    missingTests: 5,
    hidden: true
  },
  {
    id: 'roadmap-dm',
    code: 'RO-DM18',
    name: 'Digital Marketer',
    industry: 'Marketing số',
    stages: 5,
    nodes: 23,
    learners: 15_320,
    completion: 37,
    coverage: 90,
    coverageAvg: 2.4,
    testPassed: 24,
    testTotal: 27,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-se',
    code: 'RO-SE19',
    name: 'SEO Specialist',
    industry: 'Marketing số',
    stages: 4,
    nodes: 19,
    learners: 12_750,
    completion: 42,
    coverage: 93,
    coverageAvg: 2.2,
    testPassed: 20,
    testTotal: 22,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-cs',
    code: 'RO-CS20',
    name: 'Content Strategist',
    industry: 'Nội dung & Truyền thông',
    stages: 4,
    nodes: 18,
    learners: 8_640,
    completion: 39,
    coverage: 88,
    coverageAvg: 2.1,
    testPassed: 17,
    testTotal: 20,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-sm',
    code: 'RO-SM21',
    name: 'Social Media Manager',
    industry: 'Marketing số',
    stages: 4,
    nodes: 17,
    learners: 11_980,
    completion: 34,
    coverage: 86,
    coverageAvg: 2.0,
    testPassed: 15,
    testTotal: 19,
    missingTests: 4,
    hidden: false
  },
  {
    id: 'roadmap-qa',
    code: 'RO-QA22',
    name: 'QA Engineer',
    industry: 'Kiểm thử phần mềm',
    stages: 5,
    nodes: 25,
    learners: 9_470,
    completion: 30,
    coverage: 94,
    coverageAvg: 2.6,
    testPassed: 27,
    testTotal: 29,
    missingTests: 2,
    hidden: false
  },
  {
    id: 'roadmap-at',
    code: 'RO-AT23',
    name: 'Automation Tester',
    industry: 'Kiểm thử phần mềm',
    stages: 5,
    nodes: 27,
    learners: 6_380,
    completion: 28,
    coverage: 91,
    coverageAvg: 2.5,
    testPassed: 25,
    testTotal: 28,
    missingTests: 3,
    hidden: false
  },
  {
    id: 'roadmap-cy',
    code: 'RO-CY24',
    name: 'Cyber Security Analyst',
    industry: 'An toàn thông tin',
    stages: 6,
    nodes: 29,
    learners: 5_940,
    completion: 23,
    coverage: 85,
    coverageAvg: 2.4,
    testPassed: 22,
    testTotal: 28,
    missingTests: 6,
    hidden: true
  },
  {
    id: 'roadmap-ne',
    code: 'RO-NE25',
    name: 'Network Engineer',
    industry: 'Hạ tầng & DevOps',
    stages: 5,
    nodes: 22,
    learners: 4_870,
    completion: 32,
    coverage: 88,
    coverageAvg: 2.2,
    testPassed: 19,
    testTotal: 23,
    missingTests: 4,
    hidden: false
  },
  {
    id: 'roadmap-mg',
    code: 'RO-MG26',
    name: 'Mobile Game Developer',
    industry: 'Lập trình di động',
    stages: 5,
    nodes: 26,
    learners: 3_960,
    completion: 21,
    coverage: 80,
    coverageAvg: 2.1,
    testPassed: 18,
    testTotal: 25,
    missingTests: 7,
    hidden: false
  },
  {
    id: 'roadmap-bc',
    code: 'RO-BC27',
    name: 'Blockchain Developer',
    industry: 'Lập trình Web',
    stages: 6,
    nodes: 31,
    learners: 3_420,
    completion: 17,
    coverage: 76,
    coverageAvg: 2.0,
    testPassed: 17,
    testTotal: 27,
    missingTests: 10,
    hidden: false
  },
  {
    id: 'roadmap-tw',
    code: 'RO-TW28',
    name: 'Technical Writer',
    industry: 'Nội dung & Truyền thông',
    stages: 3,
    nodes: 14,
    learners: 6_110,
    completion: 46,
    coverage: 95,
    coverageAvg: 1.8,
    testPassed: 14,
    testTotal: 15,
    missingTests: 1,
    hidden: false
  },
  {
    id: 'roadmap-cu',
    code: 'RO-CU29',
    name: 'Customer Success Specialist',
    industry: 'Vận hành & CSKH',
    stages: 4,
    nodes: 16,
    learners: 10_260,
    completion: 41,
    coverage: 92,
    coverageAvg: 2.0,
    testPassed: 15,
    testTotal: 16,
    missingTests: 1,
    hidden: true
  },
  {
    id: 'roadmap-sa',
    code: 'RO-SA30',
    name: 'Sales Development Representative',
    industry: 'Kinh doanh & Bán hàng',
    stages: 4,
    nodes: 18,
    learners: 9_830,
    completion: 36,
    coverage: 89,
    coverageAvg: 2.1,
    testPassed: 16,
    testTotal: 19,
    missingTests: 3,
    hidden: false
  }
];

const DETAILED_STUDIOS: RoadmapStudio[] = [
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

const DETAILED_ROADMAP_IDS = new Set(DETAILED_STUDIOS.map((studio) => studio.roadmapId));

/** Sinh cấu hình Studio tối thiểu để mọi lộ trình trong danh sách đều mở được trang biên tập. */
function buildStudio(roadmap: Roadmap): RoadmapStudio {
  const slug = roadmap.code.toLowerCase();
  const industry = roadmap.industry.toLowerCase();
  return {
    roadmapId: roadmap.id,
    selectedNodeId: `${slug}-advanced`,
    threshold: 70,
    phases: [
      {
        id: `${slug}-phase-1`,
        no: '01',
        name: 'Nền tảng',
        nodes: [
          {
            id: `${slug}-foundation`,
            name: `${roadmap.name} cơ bản`,
            type: 'Ngôn ngữ',
            level: 'Cơ bản',
            industry: roadmap.industry,
            description: `Nắm kiến thức nền tảng để bắt đầu lộ trình ${roadmap.name}.`,
            outcomes: 'Thuật ngữ · Quy trình · Tư duy nghề',
            tags: ['nền tảng', industry]
          }
        ]
      },
      {
        id: `${slug}-phase-2`,
        no: '02',
        name: 'Kỹ năng chuyên môn',
        nodes: [
          {
            id: `${slug}-advanced`,
            name: `${roadmap.name} chuyên sâu`,
            type: 'Kỹ năng',
            level: 'Trung cấp',
            industry: roadmap.industry,
            description: `Thực hành kỹ năng chuyên môn của ${roadmap.name} trên tình huống thực tế.`,
            outcomes: 'Phân tích · Thực hành · Đánh giá',
            tags: ['chuyên môn', industry]
          },
          {
            id: `${slug}-tooling`,
            name: `Công cụ & quy trình ${roadmap.industry}`,
            type: 'Công cụ',
            level: 'Trung cấp',
            industry: roadmap.industry,
            description: 'Sử dụng công cụ và quy trình chuẩn của nghề trong công việc hằng ngày.',
            outcomes: 'Công cụ · Quy trình · Cộng tác',
            tags: ['công cụ', 'quy trình']
          }
        ]
      },
      {
        id: `${slug}-phase-3`,
        no: '03',
        name: 'Dự án thực tế',
        nodes: [
          {
            id: `${slug}-project`,
            name: `Dự án ${roadmap.industry}`,
            type: 'Dự án',
            level: 'Nâng cao',
            industry: roadmap.industry,
            description: `Hoàn thiện một dự án thực tế theo chuẩn ${roadmap.name}.`,
            outcomes: 'Kiến trúc · Kiểm thử · Triển khai',
            tags: ['dự án', 'deploy']
          }
        ]
      }
    ],
    suggestions: [
      { id: `${slug}-sug-1`, title: `Nhập môn ${roadmap.name}`, level: 'Cơ bản', match: 94 },
      { id: `${slug}-sug-2`, title: `${roadmap.name} thực chiến`, level: 'Trung cấp', match: 88 },
      { id: `${slug}-sug-3`, title: `Dự án ${roadmap.industry}`, level: 'Nâng cao', match: 81 }
    ],
    test: {
      name: `Bài test đánh giá năng lực: ${roadmap.name}`,
      duration: 15,
      passScore: 75,
      stage: '02 · Kỹ năng chuyên môn',
      questions: [
        {
          id: `${slug}-q1`,
          index: 1,
          title: '01 Trắc nghiệm · Kiến thức nghề',
          meta: '4 phương án · 1 đáp án đúng',
          prompt: `Trong lộ trình ${roadmap.name}, bước nào nên thực hiện đầu tiên?`,
          language: 'Tổng hợp',
          code: '// Bắt đầu với kiến thức nền tảng',
          answers: [
            { letter: 'A', text: 'Học công cụ chuyên sâu trước khi nắm nền tảng', correct: false },
            { letter: 'B', text: 'Nắm nền tảng và quy trình cốt lõi của nghề', correct: true },
            { letter: 'C', text: 'Bỏ qua bài kiểm tra đánh giá năng lực', correct: false },
            { letter: 'D', text: 'Chỉ làm dự án mà không học lý thuyết', correct: false }
          ],
          hint: 'Hãy chọn bước giúp xây nền kiến thức vững trước khi đi sâu.',
          hintSaved: false
        }
      ]
    }
  };
}

export const MOCK_STUDIOS: RoadmapStudio[] = [
  ...DETAILED_STUDIOS,
  ...MOCK_ROADMAPS.filter((roadmap) => !DETAILED_ROADMAP_IDS.has(roadmap.id)).map(buildStudio)
];
