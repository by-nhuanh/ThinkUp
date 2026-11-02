export interface InstructorSocials {
  github?: string;
  linkedin?: string;
  website?: string;
}

export interface Instructor {
  /** Slug dùng trên URL /instructors/:slug */
  id: string;
  name: string;
  title: string;
  bio: string;
  location: string;
  joinedAt: string;
  avatar?: string;
  initials: string;
  rating: number;
  reviewsCount: number;
  studentsCount: number;
  coursesCount: number;
  experience: string[];
  expertise: string[];
  socials?: InstructorSocials;
}

export type InstructorCourseSort = 'popular' | 'rating' | 'price-asc' | 'price-desc';

export interface InstructorCourseSortOption {
  value: InstructorCourseSort;
  label: string;
}
