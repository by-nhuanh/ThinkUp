export interface UserProfile {
  name: string;
  email: string;
  headline: string;
  location: string;
  joinedAt: string;
  avatarUrl: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  birthDate?: string;
  bio?: string;
  language?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  x?: string;
  youtube?: string;
  github?: string;
  portfolio?: string;
  phone?: string;
  maskedEmail?: string;
  maskedPhone?: string;
  provider?: string;
  emailLocked?: boolean;
}

export interface LearningStat {
  key: string;
  value: number;
  label: string;
  tone: 'blue' | 'green' | 'orange' | 'sky' | string;
}

export interface CurrentCourse {
  id: string;
  category: string;
  instructor: string;
  title: string;
  progress: number;
  nextLesson: string;
  image: string;
  href: string;
}

export interface Achievement {
  key: string;
  title: string;
  subtitle: string;
  tone: 'amber' | 'blue' | 'sky' | 'red' | 'green' | 'indigo' | string;
}

export interface RecentActivity {
  key: string;
  time: string;
  text: string;
  tone: 'blue' | 'amber' | 'green' | 'sky' | string;
}

export interface Certificate {
  id: string;
  title: string;
  issuedAt: string;
}

export interface ProfileOverviewData {
  profile: UserProfile;
  learningStats: LearningStat[];
  roadmapProgress: number;
  currentCourses: CurrentCourse[];
  achievements: Achievement[];
  totalAwards: number;
  recentActivities: RecentActivity[];
  certificates?: Certificate[];
  completedCourses?: CurrentCourse[];
}
