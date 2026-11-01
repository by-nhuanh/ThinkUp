import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CourseService } from '../../../core/services/course.service';
import { Course, CourseFilters } from '../../../core/models/course.model';
import { CourseCardComponent } from '../components/course-card/course-card.component';
import { FilterSidebarComponent } from '../components/filter-sidebar/filter-sidebar.component';
import { SearchAndSuggestionsComponent } from '../components/search-and-suggestions/search-and-suggestions.component';

@Component({
  selector: 'app-course-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CourseCardComponent,
    FilterSidebarComponent,
    SearchAndSuggestionsComponent
  ],
  templateUrl: './course-list.component.html',
  styleUrl: './course-list.component.css',
})
export class CourseListComponent implements OnInit {
  private courseService = inject(CourseService);
  private router = inject(Router);

  courses = signal<Course[]>([]);
  loading = signal(true);
  isSortOpen = signal(false);
  isMobileFilterOpen = signal(false);
  currentPage = signal(1);
  readonly itemsPerPage = 12;
  readonly skeletons = Array.from({ length: 12 }, (_, index) => index + 1);

  availableCategories = signal<string[]>([]);
  availableTags = signal<string[]>([]);

  filters = signal<CourseFilters>({
    query: '',
    searchMode: 'all',
    categories: [],
    levels: [],
    ratings: '',
    maxDuration: 120,
    priceType: 'all',
    tags: [],
    sort: 'popular'
  });

  readonly sortOptions = [
    { id: 'popular', label: 'Phổ biến nhất' },
    { id: 'rating', label: 'Đánh giá cao nhất' },
    { id: 'newest', label: 'Mới nhất' },
    { id: 'price-low', label: 'Giá tăng dần' },
    { id: 'price-high', label: 'Giá giảm dần' },
  ];

  readonly activeSortLabel = computed(() => {
    const s = this.filters().sort;
    const opt = this.sortOptions.find(o => o.id === s);
    return opt ? opt.label : 'Phổ biến nhất';
  });

  readonly totalPages = computed(() =>
    Math.ceil(this.courses().length / this.itemsPerPage) || 1
  );

  readonly paginatedCourses = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.courses().slice(start, start + this.itemsPerPage);
  });

  readonly pageNumbers = computed<Array<number | '...'>>(() => {
    const total = this.totalPages();
    const current = this.currentPage();

    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }

    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }

    return [1, '...', current - 1, current, current + 1, '...', total];
  });

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadCourses();
  }

  loadFilterOptions(): void {
    this.courseService.getFilterOptions().subscribe(res => {
      if (res.success && res.data) {
        this.availableCategories.set(res.data.categories);
        this.availableTags.set(res.data.popularTags);
      }
    });
  }

  loadCourses(): void {
    this.loading.set(true);
    this.courseService.getCourses(this.filters()).subscribe(res => {
      this.courses.set(res.data || []);
      this.loading.set(false);
    });
  }

  onSearch(query: string): void {
    this.filters.update(f => ({ ...f, query }));
    this.currentPage.set(1);
    this.loadCourses();
  }

  onTagToggle(tag: string): void {
    const current = this.filters().tags || [];
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    this.filters.update(f => ({ ...f, tags: next }));
    this.currentPage.set(1);
    this.loadCourses();
  }

  onFilterChange(newFilters: CourseFilters): void {
    this.filters.set(newFilters);
    this.currentPage.set(1);
    this.loadCourses();
  }

  onClearFilters(): void {
    this.filters.set({
      query: '',
      searchMode: 'all',
      categories: [],
      levels: [],
      ratings: '',
      maxDuration: 120,
      priceType: 'all',
      tags: [],
      sort: 'popular'
    });
    this.currentPage.set(1);
    this.loadCourses();
  }

  onSortSelect(sortId: string): void {
    this.filters.update(f => ({ ...f, sort: sortId }));
    this.isSortOpen.set(false);
    this.currentPage.set(1);
    this.loadCourses();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
