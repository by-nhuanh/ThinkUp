import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HomeCourseDto {
  id: string;
  course_id: string | null;
  title: string;
  slug: string | null;
  short_description: string | null;
  description: string | null;
  category_id: string | null;
  level: string | null;
  duration_minutes: number | null;
  price: number | null;
  original_price: number | null;
  thumbnail_url: string | null;
  status: string | null;
  rating: number | null;
  total_reviews: number | null;
  total_students: number | null;
  instructor_id: string | null;
  instructor?: { id?: string; name?: string; avatar_url?: string } | null;
  instructor_name?: string | null;
  instructor_avatar?: string | null;
  badge: string | null;
  language: string | null;
  tag_ids: string[];
  tag_names?: string[];
  recommend_score?: number;
  recommendation_method?: 'rules' | 'ml';
}

export interface HomeLearningCourse {
  course_id: string;
  title: string;
  thumbnail_url: string | null;
  progress_percentage: number;
  last_studied_at: string | null;
  resume_lesson: { lesson_id: string; title: string } | null;
}

export interface HomeLearningDay {
  date: string;
  weekday: number;
  weekday_label: string;
  active_seconds: number | null;
  goal_met: boolean | null;
  intensity_level: number | null;
  coverage: 'untracked' | 'partial' | 'tracked' | 'future';
}

export interface HomeLearningStreak {
  timezone: string;
  daily_goal_seconds: number;
  current_streak: number | null;
  history_limited: boolean;
  today_goal_met: boolean | null;
  week_start: string;
  week_end: string;
  days: HomeLearningDay[];
}

export interface HomeOverview {
  user: { full_name: string | null };
  greeting: string;
  timezone: string;
  my_learning: { total: number; courses: HomeLearningCourse[] };
  roadmap: {
    roadmap_id: string;
    category_id: string | number;
    career_name: string;
    current_stage_id: string | null;
    completed_nodes: number;
    total_nodes: number;
    progress_percentage: number;
  } | null;
  recommendations: {
    personalized: boolean;
    behavior_weight: number;
    interactions: number;
    courses: HomeCourseDto[];
  };
  learning_activity: {
    timezone: string;
    year: number;
    available_years: number[];
    start_date: string;
    end_date: string;
    window_days: number;
    daily_goal_seconds: number;
    active_days: number | null;
    status: 'not_started' | 'available';
    recorded_since: string | null;
    history_complete: boolean;
    message?: string;
    days: HomeLearningDay[];
    weeks: Array<Array<HomeLearningDay | null>>;
    total_active_seconds: number | null;
    total_learning_seconds: number;
    qualifying_days: number | null;
    current_streak: number | null;
    streak_window_limited?: boolean;
  };
  learning_streak: HomeLearningStreak;
  generated_at: string;
}

@Injectable({ providedIn: 'root' })
export class HomeService {
  private readonly http = inject(HttpClient);

  getOverview(year?: number): Observable<HomeOverview> {
    const params = year === undefined ? undefined : new HttpParams().set('year', year);
    return this.http
      .get<{ success: true; data: HomeOverview }>(`${environment.apiUrl}/user/home`, { params })
      .pipe(map(response => response.data));
  }
}
