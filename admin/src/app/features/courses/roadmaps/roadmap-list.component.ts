import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CustomSelectComponent, CustomSelectOption } from '../../../shared/components/custom-select/custom-select.component';
import { ExportMenuComponent } from '../../../shared/components/export-menu/export-menu.component';
import { SearchFieldComponent } from '../../../shared/components/search-field/search-field.component';
import { formatNumber, paginationRange } from '../course-utils';
import { Roadmap } from '../models/course.models';
import { CourseStore } from '../services/course.store';
import { CourseToastComponent, ToastTone } from '../components/course-toast.component';

const ROADMAP_TOTAL = 16;
const PAGE_SIZE = 8;

type CoverageKey = '' | 'full' | 'partial';
type TestKey = '' | 'complete' | 'missing';
type VisibilityKey = '' | 'visible' | 'hidden';

@Component({
  selector: 'app-roadmap-list',
  standalone: true,
  imports: [
    SearchFieldComponent,
    CustomSelectComponent,
    ExportMenuComponent,
    CourseToastComponent
  ],
  templateUrl: './roadmap-list.component.html',
  styleUrl: '../courses-page.css'
})
export class RoadmapListComponent {
  private readonly store = inject(CourseStore);
  private readonly router = inject(Router);

  readonly loadError = this.store.loadError;
  readonly roadmaps = this.store.roadmaps;

  readonly search = signal('');
  readonly industry = signal('');
  readonly coverage = signal<CoverageKey>('');
  readonly testState = signal<TestKey>('');
  readonly visibility = signal<VisibilityKey>('');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;
  readonly menuId = signal<string | null>(null);
  readonly toast = signal<{ message: string; tone: ToastTone } | null>(null);
  private menuTrigger: HTMLElement | null = null;

  readonly totals = { total: 16, active: 12, learners: 45_280, coverage: '92,4%' };

  readonly industryOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả nhóm ngành' },
    ...[...new Set(this.roadmaps().map(item => item.industry))].map(label => ({ value: label, label }))
  ];
  readonly coverageOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả độ phủ' },
    { value: 'full', label: 'Đầy đủ (100%)' },
    { value: 'partial', label: 'Còn thiếu (<100%)' }
  ];
  readonly testOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả bài kiểm tra' },
    { value: 'complete', label: 'Đủ bài test' },
    { value: 'missing', label: 'Thiếu bài test' }
  ];
  readonly visibilityOptions: CustomSelectOption[] = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'visible', label: 'Đang hiển thị' },
    { value: 'hidden', label: 'Đang ẩn' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const industry = this.industry();
    const coverage = this.coverage();
    const testState = this.testState();
    const visibility = this.visibility();
    return this.roadmaps().filter(item => {
      const matches = !term
        || item.name.toLowerCase().includes(term)
        || item.code.toLowerCase().includes(term);
      const coverageOk = !coverage
        || (coverage === 'full' ? item.coverage >= 100 : item.coverage < 100);
      const testOk = !testState
        || (testState === 'complete' ? item.missingTests === 0 : item.missingTests > 0);
      const visibilityOk = !visibility
        || (visibility === 'hidden' ? item.hidden : !item.hidden);
      return matches
        && (!industry || item.industry === industry)
        && coverageOk
        && testOk
        && visibilityOk;
    });
  });
  readonly hasFilters = computed(() => Boolean(
    this.search() || this.industry() || this.coverage() || this.testState() || this.visibility()
  ));
  readonly resultTotal = computed(() => this.hasFilters() ? this.filtered().length : ROADMAP_TOTAL);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.resultTotal() / this.pageSize)));
  readonly visible = computed(() => this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly pagination = computed(() => paginationRange(this.page(), this.pages()));
  readonly rangeLabel = computed(() => {
    const total = this.resultTotal();
    const shown = this.visible().length;
    if (!total || !shown) return 'Không có lộ trình nào';
    const start = (this.page() - 1) * this.pageSize + 1;
    return `Hiển thị ${start}–${start + shown - 1} trong ${formatNumber(total)} lộ trình`;
  });

  setSearch(value: string): void { this.search.set(value); this.page.set(1); }
  setIndustry(value: string): void { this.industry.set(value); this.page.set(1); }
  setCoverage(value: string): void { this.coverage.set(value as CoverageKey); this.page.set(1); }
  setTestState(value: string): void { this.testState.set(value as TestKey); this.page.set(1); }
  setVisibility(value: string): void { this.visibility.set(value as VisibilityKey); this.page.set(1); }

  resetFilters(): void {
    this.search.set('');
    this.industry.set('');
    this.coverage.set('');
    this.testState.set('');
    this.visibility.set('');
    this.page.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
  }

  onPage(item: number | '...'): void {
    if (typeof item === 'number') this.goToPage(item);
  }

  openStudio(item: Roadmap): void {
    this.menuId.set(null);
    this.menuTrigger = null;
    void this.router.navigate(['/courses/roadmaps', item.id, 'studio']);
  }

  toggleMenu(item: Roadmap, event: MouseEvent): void {
    event.stopPropagation();
    this.menuId.set(this.menuId() === item.id ? null : item.id);
    this.menuTrigger = this.menuId() ? event.currentTarget as HTMLElement : null;
  }

  toggleVisibility(item: Roadmap): void {
    this.store.toggleRoadmapVisibility(item.id);
    this.menuId.set(null);
    this.menuTrigger = null;
    this.notify(item.hidden ? `Đã hiển thị lộ trình ${item.code}.` : `Đã ẩn lộ trình ${item.code}.`, 'success');
  }

  createRoadmap(): void {
    this.notify('Mẫu tạo lộ trình mới sẽ mở khi backend cung cấp API.', 'info');
  }

  retryLoad(): void {
    this.store.retry();
  }

  exportList(format: string): void {
    this.notify(`Đang tạo tệp ${format.toUpperCase()} cho ${this.resultTotal()} lộ trình.`, 'info');
    setTimeout(() => this.notify(`Đã xuất ${this.resultTotal()} lộ trình ra tệp ${format.toUpperCase()}.`, 'success'), 900);
  }

  notify(message: string, tone: ToastTone): void {
    this.toast.set({ message, tone });
    setTimeout(() => { if (this.toast()?.message === message) this.toast.set(null); }, 4200);
  }

  number = formatNumber;

  decimal(value: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
  }

  testLabel(item: Roadmap): string {
    return item.missingTests === 0 ? 'Đủ bài test' : `Thiếu ${item.missingTests} bài test`;
  }

  @HostListener('document:click')
  closeMenu(): void {
    if (!this.menuId()) return;
    this.menuId.set(null);
    this.menuTrigger = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Escape phải trả focus về nút đã mở menu để người dùng bàn phím không bị mất vị trí.
    if (!this.menuId()) return;
    this.menuId.set(null);
    this.menuTrigger?.focus();
    this.menuTrigger = null;
  }
}
