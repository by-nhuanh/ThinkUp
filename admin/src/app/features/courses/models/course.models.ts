export type CourseStatus = 'published' | 'pending' | 'hidden' | 'archived';
export type CourseLevel = 'Cơ bản' | 'Trung cấp' | 'Nâng cao';

export interface CourseLearner {
  name: string;
  email: string;
  progress: number;
  enrolledAt: string;
  status: 'Đang học' | 'Hoàn thành' | 'Tạm dừng';
}

export interface CourseChapter {
  no: string;
  title: string;
  meta: string;
}

export interface CourseFinance {
  listPrice: string;
  instructorShare: string;
  platformShare: string;
  revenue: string;
  voucher: string;
  voucherActive: boolean;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  level: CourseLevel;
  instructor: string;
  instructorId: string;
  students: number | null;
  price: number;
  rating: number | null;
  reviewCount: number;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
  durationHours: number;
  description: string;
  tags: string[];
  curriculumSummary: string;
  chapters: CourseChapter[];
  learners: CourseLearner[];
  finance: CourseFinance;
}

export type ApprovalStatus = 'overdue' | 'due-soon' | 'remaining' | 'waiting' | 'approved';

export interface ApprovalItem {
  id: string;
  courseId: string;
  courseTitle: string;
  category: string;
  level: CourseLevel;
  instructor: string;
  instructorRole: string;
  components: string;
  resources: string;
  suggestedPrice: number;
  discount: number;
  submittedAt: string;
  slaHours: number;
  slaStatus: ApprovalStatus;
  slaLabel: string;
  slaHint: string;
  action: 'inspect' | 'history' | 'profile';
}

export type LessonKind = 'video' | 'reading' | 'quiz' | 'ide' | 'doc';

export interface WorkspaceLesson {
  id: string;
  kind: LessonKind;
  title: string;
  trial?: boolean;
}

export interface WorkspaceChapter {
  no: string;
  title: string;
  lessons: WorkspaceLesson[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface WorkspaceFile {
  id: string;
  extension: 'PDF' | 'ZIP' | 'DOCX' | 'PPTX';
  name: string;
  size: string;
  scanned: boolean;
  risky?: boolean;
}

export interface WorkspaceAnswer {
  letter: string;
  text: string;
  correct?: boolean;
}

export interface WorkspaceQuizQuestion {
  id: string;
  index: number;
  total: number;
  prompt: string;
  answers: WorkspaceAnswer[];
  correctLetter: string;
  explanation: string;
}

export interface WorkspaceTestcase {
  id: string;
  visibility: 'Public' | 'Hidden';
  input: string;
  expected: string;
  state: 'passed' | 'pending';
}

export interface ApprovalWorkspace {
  approvalId: string;
  courseId: string;
  title: string;
  level: CourseLevel;
  instructor: { name: string; role: string; initials: string; verified: boolean };
  checklist: ChecklistItem[];
  landing: {
    subtitle: string;
    price: number;
    originalPrice: number;
    discount: number;
    stats: string;
    outcomes: string[];
    requirement: string;
    categories: string[];
    subtags: string[];
    certificate: string;
    certificateNote: string;
  };
  chapters: WorkspaceChapter[];
  video: {
    title: string;
    type: string;
    progress: number;
    duration: string;
    playback: string;
    description: string;
    attachments: string;
  };
  ide: {
    title: string;
    difficulty: string;
    prompt: string;
    language: string;
    code: string;
    testcases: WorkspaceTestcase[];
    result: string;
  };
  quiz: {
    title: string;
    question: WorkspaceQuizQuestion;
  };
  files: WorkspaceFile[];
  history: Array<{ at: string; actor: string; action: string; note: string }>;
}

export interface Roadmap {
  id: string;
  code: string;
  name: string;
  industry: string;
  stages: number;
  nodes: number;
  learners: number;
  completion: number;
  coverage: number;
  coverageAvg: number;
  testPassed: number;
  testTotal: number;
  missingTests: number;
  hidden: boolean;
}

export type RoadmapNodeType = 'Framework' | 'Ngôn ngữ' | 'Công cụ' | 'Kỹ năng' | 'Dự án';

export interface RoadmapNode {
  id: string;
  name: string;
  type: RoadmapNodeType;
  level: CourseLevel;
  industry: string;
  description: string;
  outcomes: string;
  tags: string[];
}

export interface RoadmapPhase {
  id: string;
  no: string;
  name: string;
  nodes: RoadmapNode[];
}

export interface CourseSuggestion {
  id: string;
  title: string;
  level: CourseLevel;
  match: number;
}

export interface RoadmapAnswer {
  letter: string;
  text: string;
  correct: boolean;
}

export interface RoadmapQuestion {
  id: string;
  index: number;
  title: string;
  meta: string;
  prompt: string;
  language: string;
  code: string;
  answers: RoadmapAnswer[];
  hint: string;
  hintSaved: boolean;
}

export interface RoadmapTest {
  name: string;
  duration: number;
  passScore: number;
  stage: string;
  questions: RoadmapQuestion[];
}

export interface RoadmapStudio {
  roadmapId: string;
  phases: RoadmapPhase[];
  selectedNodeId: string;
  suggestions: CourseSuggestion[];
  threshold: number;
  test: RoadmapTest;
}

export interface CourseDataSource {
  courses: Course[];
  approvals: ApprovalItem[];
  roadmaps: Roadmap[];
  workspaces: ApprovalWorkspace[];
  studios: RoadmapStudio[];

  archiveCourse(id: string, reason: string, explanation: string): void;
  setCourseStatus(id: string, status: CourseStatus): void;
  approveApproval(id: string): void;
  rejectApproval(id: string, reason: string, detail: string): void;
  requestSupplement(id: string, items: string[], issueType: string, detail: string): void;
  toggleRoadmapVisibility(id: string): void;
  updateRoadmapNode(roadmapId: string, node: RoadmapNode): void;
  saveRoadmapDraft(roadmapId: string): void;
  publishRoadmap(roadmapId: string): void;
  saveRoadmapTest(roadmapId: string, test: RoadmapTest): void;
  reset(): void;
}
