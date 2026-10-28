// TODO(pre-deploy): Nhớ xóa dữ liệu mock và các file JSON trong mock/roadmaps khi thay bằng dữ liệu thật.
import {
  RoadmapDetail,
  RoadmapMetaItem,
  RoadmapSkill,
  RoadmapStageIcon,
  RoadmapStage
} from '../../../features/roadmap/models/roadmap.model';
import { FRONTEND_ROADMAP, FRONTEND_CARD_TITLE } from './roadmap/frontend-roadmap';

import aiMlEngineerData from './roadmaps/ai-ml-engineer-roadmap.json';
import backendDeveloperData from './roadmaps/backend-developer-roadmap.json';
import businessAnalysisData from './roadmaps/business-analysis-roadmap.json';
import cloudEngineeringData from './roadmaps/cloud-engineering-roadmap.json';
import dataAnalysisData from './roadmaps/data-analysis-roadmap.json';
import dataEngineeringData from './roadmaps/data-engineering-roadmap.json';
import devopsEngineeringData from './roadmaps/devops-engineering-roadmap.json';
import erpConsultingData from './roadmaps/erp-consulting-roadmap.json';
import fullstackDeveloperData from './roadmaps/fullstack-developer-roadmap.json';
import mobileDeveloperData from './roadmaps/mobile-developer-roadmap.json';
import productManagementData from './roadmaps/product-management-roadmap.json';
import projectManagementData from './roadmaps/project-management-roadmap.json';
import securityEngineeringData from './roadmaps/security-engineering-roadmap.json';
import softwareTestingQaData from './roadmaps/software-testing-qa-roadmap.json';
import systemAnalysisData from './roadmaps/system-analysis-roadmap.json';
import uiUxDesignData from './roadmaps/ui-ux-design-roadmap.json';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[&/]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatTitle(rawName: string): string {
  return rawName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface RawSkill {
  name: string;
  difficulty?: string;
  skillType?: string;
  prerequisites?: string[];
  whatYouWillLearn?: string[];
  nextSkill?: {
    name?: string;
    description?: string;
  };
}

interface RawStage {
  stageId: number;
  name: string;
  description: string;
  skills: RawSkill[];
}

interface RawRoadmapJson {
  roadmap: {
    name: string;
    description: string;
  };
  stages: RawStage[];
}

interface RoadmapMetaDefinition {
  id: string;
  shortCode: string;
  color: string;
  bgColor: string;
  /** Tiêu đề thẻ trên trang danh sách (Figma dùng tên rút gọn khác H1). */
  cardTitle?: string;
  cardDesc?: string;
  data?: RawRoadmapJson;
  detail?: RoadmapDetail;
}

/** Bảng màu icon giai đoạn dùng chung, bám theo Figma Roadmap04. */
const STAGE_PALETTE: Array<{ icon: RoadmapStageIcon; tint: string; accent: string }> = [
  { icon: 'foundation', tint: '#E6F4FF', accent: '#0088E8' },
  { icon: 'code', tint: '#E6F7EE', accent: '#16A34A' },
  { icon: 'framework', tint: '#FFF4D1', accent: '#D97706' },
  { icon: 'shield', tint: '#F3ECFF', accent: '#7C3AED' },
  { icon: 'sparkles', tint: '#FFE9D6', accent: '#EA7317' },
  { icon: 'people', tint: '#FFE4EF', accent: '#EC4899' }
];

/** Gợi ý khoá học theo tên kỹ năng — chỉ dùng cho dữ liệu mock. */
const COURSE_HINTS: Array<{ match: RegExp; courseIds: string[] }> = [
  { match: /react/i, courseIds: ['reactjs'] },
  { match: /next\.?js/i, courseIds: ['nextjs'] },
  { match: /javascript|typescript|es6/i, courseIds: ['javascript-es6'] },
  { match: /angular/i, courseIds: ['angular'] },
  { match: /vue/i, courseIds: ['vuejs-3'] },
  { match: /node/i, courseIds: ['nodejs'] },
  { match: /sql|database|dữ liệu/i, courseIds: ['sql-data'] },
  { match: /python|machine learning|deep learning|ai\b/i, courseIds: ['python-data'] },
  { match: /ui|ux|design/i, courseIds: ['uiux-design'] },
  { match: /flutter|mobile/i, courseIds: ['flutter'] },
  { match: /docker|devops|cloud/i, courseIds: ['docker'] }
];

function guessCourseIds(skillName: string): string[] {
  for (const hint of COURSE_HINTS) {
    if (hint.match.test(skillName)) return hint.courseIds;
  }
  return [];
}

function buildSkill(id: string, stageId: string, raw: RawSkill): RoadmapSkill {
  const outcomes = raw.whatYouWillLearn ?? [];
  const summary =
    raw.nextSkill?.description ||
    (outcomes.length >= 2 ? outcomes.slice(0, 2).join(' ') : outcomes[0]) ||
    `Trang bị kiến thức và kỹ năng thực hành cần thiết cho ${raw.name}.`;

  return {
    id,
    title: raw.name,
    desc: outcomes[0] ?? summary,
    summary,
    status: 'not-started',
    mastery: 0,
    difficulty: (raw.difficulty as RoadmapSkill['difficulty']) ?? 'Cơ bản',
    type: raw.skillType ?? 'Kỹ năng',
    outcomes: outcomes.length ? outcomes : [summary],
    prerequisites: raw.prerequisites ?? [],
    nextSkill: raw.nextSkill?.name
      ? {
          name: raw.nextSkill.name,
          description: raw.nextSkill.description ?? `Kỹ năng kế tiếp sau ${raw.name}.`
        }
      : null,
    courseIds: guessCourseIds(raw.name),
    stageId
  };
}

function buildStage(roadmapId: string, raw: RawStage, index: number): RoadmapStage {
  const palette = STAGE_PALETTE[index % STAGE_PALETTE.length];
  const id = `${roadmapId}-stage-${raw.stageId}`;

  return {
    id,
    number: raw.stageId,
    name: raw.name,
    desc: raw.description,
    icon: palette.icon,
    tint: palette.tint,
    accent: palette.accent,
    skills: raw.skills.map((skill) => buildSkill(slugify(skill.name), id, skill))
  };
}

function buildRoadmapDetail(meta: RoadmapMetaDefinition): RoadmapDetail {
  if (meta.detail) return meta.detail;
  const raw = meta.data;
  if (!raw) throw new Error(`Thiếu dữ liệu roadmap ${meta.id}`);

  return {
    id: meta.id,
    title: formatTitle(raw.roadmap.name),
    desc: raw.roadmap.description,
    stages: raw.stages.map((stage, index) => buildStage(meta.id, stage, index))
  };
}

/**
 * Thứ tự thẻ bám theo Figma Roadmap01: 4 lộ trình nổi bật lên trước,
 * các lộ trình còn lại giữ nguyên dữ liệu JSON và xếp sau.
 */
const ROADMAP_META: RoadmapMetaDefinition[] = [
  {
    id: 'frontend-developer',
    shortCode: 'FE',
    color: '#0088E8',
    bgColor: '#E6F4FF',
    cardTitle: FRONTEND_CARD_TITLE,
    cardDesc:
      'Xây dựng website hiện đại với HTML, CSS, JavaScript, React và các công nghệ Frontend phổ biến.',
    detail: FRONTEND_ROADMAP
  },
  {
    id: 'backend-developer',
    shortCode: 'BE',
    color: '#7C3AED',
    bgColor: '#F3ECFF',
    cardTitle: 'Back-end Developer',
    cardDesc:
      'Làm chủ server, database, API và các công nghệ Back-end phổ biến như Node.js, Express, Python, SQL.',
    data: backendDeveloperData as unknown as RawRoadmapJson
  },
  {
    id: 'ai-ml-engineer',
    shortCode: 'AI',
    color: '#16A34A',
    bgColor: '#E6F7EE',
    cardTitle: 'AI Engineer',
    cardDesc:
      'Khám phá thế giới trí tuệ nhân tạo từ nền tảng Machine Learning đến Deep Learning và các ứng dụng thực tế.',
    data: aiMlEngineerData as unknown as RawRoadmapJson
  },
  {
    id: 'data-analysis',
    shortCode: 'DA',
    color: '#EA7317',
    bgColor: '#FFE9D6',
    cardTitle: 'Data Analyst',
    cardDesc:
      'Phân tích dữ liệu, trực quan hóa và đưa ra insight giá trị bằng Excel, SQL, Python và Tableau.',
    data: dataAnalysisData as unknown as RawRoadmapJson
  },
  {
    id: 'fullstack-developer',
    shortCode: 'FS',
    color: '#4F46E5',
    bgColor: '#EEF2FF',
    data: fullstackDeveloperData as unknown as RawRoadmapJson
  },
  {
    id: 'mobile-developer',
    shortCode: 'MB',
    color: '#0891B2',
    bgColor: '#E0F7FA',
    data: mobileDeveloperData as unknown as RawRoadmapJson
  },
  {
    id: 'data-engineering',
    shortCode: 'DE',
    color: '#D97706',
    bgColor: '#FEF3C7',
    data: dataEngineeringData as unknown as RawRoadmapJson
  },
  {
    id: 'devops-engineering',
    shortCode: 'DO',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    data: devopsEngineeringData as unknown as RawRoadmapJson
  },
  {
    id: 'cloud-engineering',
    shortCode: 'CE',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    data: cloudEngineeringData as unknown as RawRoadmapJson
  },
  {
    id: 'security-engineering',
    shortCode: 'SC',
    color: '#E11D48',
    bgColor: '#FFE4E6',
    data: securityEngineeringData as unknown as RawRoadmapJson
  },
  {
    id: 'ui-ux-design',
    shortCode: 'UX',
    color: '#DB2777',
    bgColor: '#FCE7F3',
    data: uiUxDesignData as unknown as RawRoadmapJson
  },
  {
    id: 'product-management',
    shortCode: 'PM',
    color: '#0D9488',
    bgColor: '#CCFBF1',
    data: productManagementData as unknown as RawRoadmapJson
  },
  {
    id: 'project-management',
    shortCode: 'PJ',
    color: '#059669',
    bgColor: '#D1FAE5',
    data: projectManagementData as unknown as RawRoadmapJson
  },
  {
    id: 'business-analysis',
    shortCode: 'BA',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    data: businessAnalysisData as unknown as RawRoadmapJson
  },
  {
    id: 'software-testing-qa',
    shortCode: 'QA',
    color: '#CA8A04',
    bgColor: '#FEF9C3',
    data: softwareTestingQaData as unknown as RawRoadmapJson
  },
  {
    id: 'system-analysis',
    shortCode: 'SA',
    color: '#64748B',
    bgColor: '#F1F5F9',
    data: systemAnalysisData as unknown as RawRoadmapJson
  },
  {
    id: 'erp-consulting',
    shortCode: 'ERP',
    color: '#9333EA',
    bgColor: '#F3E8FF',
    data: erpConsultingData as unknown as RawRoadmapJson
  }
];

export const ROADMAPS_DATA: Record<string, RoadmapDetail> = {};
export const ROADMAPS_LIST: RoadmapMetaItem[] = [];

for (const meta of ROADMAP_META) {
  const detail = buildRoadmapDetail(meta);
  ROADMAPS_DATA[meta.id] = detail;

  const skillsCount = detail.stages.reduce((sum, stage) => sum + stage.skills.length, 0);

  ROADMAPS_LIST.push({
    id: meta.id,
    title: detail.title,
    cardTitle: meta.cardTitle ?? detail.title,
    shortCode: meta.shortCode,
    color: meta.color,
    bgColor: meta.bgColor,
    desc: meta.cardDesc ?? detail.desc,
    stagesCount: detail.stages.length,
    skillsCount
  });
}
