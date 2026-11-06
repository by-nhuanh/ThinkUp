import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course } from '../models/course.model';
import { Injectable, inject } from '@angular/core';
import { Instructor } from '../models/instructor.model';
import { formatCourseLevel } from './course.service';

@Injectable({ providedIn: 'root' })
export class InstructorService {
  private readonly http = inject(HttpClient);

  loadProfile(ref: string): Observable<{ instructor: Instructor; courses: Course[] }> {
    return this.http.get<{ success: boolean; data: { instructor: InstructorDto; courses: CourseDto[] } }>(
      environment.apiUrl + '/instructors/' + encodeURIComponent(ref)).pipe(map(response => {
        if (!response.success || !response.data) throw new Error('Không tải được hồ sơ giảng viên.');
        const dto = response.data.instructor;
        const instructor: Instructor = {
          id: dto.id, name: dto.full_name, title: dto.title, bio: dto.bio, location: dto.location,
          joinedAt: dto.joined_at, avatar: dto.avatar_url, initials: dto.full_name.split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join(''),
          rating: dto.rating, reviewsCount: dto.total_reviews, studentsCount: dto.total_students, coursesCount: dto.total_courses,
          experience: dto.experiences, expertise: dto.specializations, socials: { github: dto.github, linkedin: dto.linkedin, website: dto.website },
        };
        return { instructor, courses: response.data.courses.map(course => {
          const rawTags = course.tags || course.tag_names || [];
          const normalizedTags = Array.isArray(rawTags)
            ? rawTags.map((t: any) => (typeof t === 'string' ? t : t?.name || t?.title || '')).filter(Boolean)
            : [];
          return {
            id: course.course_id || course.id, courseId: course.course_id, slug: course.slug, title: course.title,
            instructor: course.instructor?.name ?? dto.full_name, instructorId: course.instructor?.id ?? dto.id,
            rating: course.rating, ratingCount: course.total_reviews, studentsCount: course.total_students,
            originalPrice: course.price?.original ?? 0, salePrice: course.price?.sale ?? 0, thumbnailUrl: course.thumbnail_url,
            duration: course.duration_formatted, durationMinutes: course.duration_minutes, badge: course.badge,
            level: formatCourseLevel(course.level),
            tags: normalizedTags,
            isInCart: course.is_in_cart, isInWishlist: course.is_in_wishlist, isPurchased: course.is_purchased,
          };
        }) };
      }));
  }

  getProfileLink(instructor: Instructor): string {
    return `/instructors/${instructor.id}`;
  }
}

interface InstructorDto {
  id: string; full_name: string; title: string; bio: string; location: string; joined_at: string; avatar_url?: string;
  rating: number | null; total_reviews: number; total_students: number; total_courses: number; experiences: string[]; specializations: string[];
  github?: string; linkedin?: string; website?: string;
}
interface CourseDto {
  id: string; course_id: string; slug?: string; title: string; instructor?: { id: string; name: string };
  rating: number; total_reviews: number; total_students: number; price: { original: number; sale: number };
  thumbnail_url?: string; duration_formatted?: string; duration_minutes?: number; badge?: string; level?: string;
  tags?: any[]; tag_names?: string[];
  is_in_cart: boolean; is_in_wishlist: boolean; is_purchased: boolean;
}
