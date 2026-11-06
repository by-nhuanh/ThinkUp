/**
 * ==============================================================================
 * MODULE: KHẢO SÁT ONBOARDING & BỘ LỌC KHÓA HỌC GỢI Ý
 * Mã nghiệp vụ: SPEC-ONB-STU-01 & LOGIC-ONB-REC-01
 * Giao diện đối chiếu: Figma Node 1959:6123, 1840:14670, 3654:16887, 3659:16992, 1840:13225, 3671:16778
 * ==============================================================================
 */

import { Component, OnInit, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OnboardingService } from '../../../core/services/onboarding.service';
import { ToastService } from '../../../core/services/toast.service';
import { StudentPreferences } from '../../../core/models/user.model';

interface SurveyOption {
  id: string;
  title: string;
  desc?: string;
  iconUrl?: string;
  iconTag?: string;
  emoji?: string;
  relevantRoles?: string[]; // Danh sách các vai trò liên quan ở Bước 1
}

interface SurveyQuestion {
  id: number;
  label: string;
  badge: string;
  title: string;
  subtitle: string;
  type: 'single-role' | 'multi-tech' | 'single-level';
  asideTitle: string;
  asideDesc: string;
  asideImage?: string;
  options: SurveyOption[];
}

@Component({
  selector: 'app-onboarding-survey',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './onboarding-survey.component.html',
  styleUrl: './onboarding-survey.component.css'
})
export class OnboardingSurveyComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly onboardingService = inject(OnboardingService);
  private readonly toastService = inject(ToastService);

  private readonly draftPrefix = 'thinkup_onboarding_draft:';

  readonly currentStep = signal<number>(0);
  readonly errorMessage = signal<string>('');
  readonly submitting = signal<boolean>(false);
  readonly showSkipConfirm = signal<boolean>(false);
  readonly toastMessage = signal<string>('');
  readonly toastType = signal<'success' | 'error'>('success');

  // Form State
  answers: {
    targetRole: string | null;
    selectedSkills: string[];
    currentLevel: string | null;
  } = {
    targetRole: null,
    selectedSkills: [],
    currentLevel: null
  };

  readonly questions: SurveyQuestion[] = [
    {
      id: 1,
      label: 'Mục tiêu',
      badge: 'CÂU HỎI 1',
      title: 'Vị trí công nghệ nào bạn đang hướng tới?',
      subtitle: 'Chọn 1 vị trí phù hợp nhất với mục tiêu của bạn.',
      type: 'single-role',
      asideTitle: 'Xác định mục tiêu',
      asideDesc: 'Giúp chúng tôi gợi ý khóa học và lộ trình phù hợp nhất dành cho bạn.',
      asideImage: '/assets/onboarding/aside-1840-14784.png',
      options: [
        {
          id: 'frontend',
          title: 'Frontend Developer',
          desc: 'Xây dựng giao diện web tương tác và trải nghiệm người dùng.',
          iconUrl: '/assets/onboarding/icons/role-frontend.svg'
        },
        {
          id: 'backend',
          title: 'Backend Developer',
          desc: 'Phát triển logic máy chủ, xây dựng API và quản trị cơ sở dữ liệu.',
          iconUrl: '/assets/onboarding/icons/role-backend.svg'
        },
        {
          id: 'fullstack',
          title: 'Fullstack Developer',
          desc: 'Làm chủ toàn diện cả phần giao diện (Frontend) và hệ thống máy chủ (Backend).',
          iconUrl: '/assets/onboarding/icons/role-fullstack.svg'
        },
        {
          id: 'mobile',
          title: 'Mobile Developer',
          desc: 'Phát triển ứng dụng di động trên nền tảng Android và iOS.',
          iconUrl: '/assets/onboarding/icons/role-mobile.svg'
        },
        {
          id: 'data-ai',
          title: 'Data Science & AI',
          desc: 'Xử lý, phân tích dữ liệu và xây dựng mô hình trí tuệ nhân tạo.',
          iconUrl: '/assets/onboarding/icons/role-data-ai.svg'
        },
        {
          id: 'devops-cloud',
          title: 'DevOps & Cloud',
          desc: 'Triển khai hạ tầng, tự động hóa và tối ưu hóa vận hành hệ thống.',
          iconUrl: '/assets/onboarding/icons/role-devops.svg'
        },
        {
          id: 'explore',
          title: 'Khám phá tự do',
          desc: 'Chưa có định hướng cố định, muốn trải nghiệm đa dạng các lĩnh vực.',
          iconUrl: '/assets/onboarding/icons/role-explore.svg'
        }
      ]
    },
    {
      id: 2,
      label: 'Kỹ năng ưu tiên',
      badge: 'CÂU HỎI 2',
      title: 'Công nghệ nào bạn muốn ưu tiên học tập ngay?',
      subtitle: 'Chọn tối đa 3 công nghệ bạn quan tâm.',
      type: 'multi-tech',
      asideTitle: 'Chọn công nghệ bạn quan tâm',
      asideDesc: 'Điều này giúp chúng tôi gợi ý khóa học phù hợp với sở thích của bạn.',
      asideImage: '/assets/onboarding/aside-1840-12495.png',
      options: [
        { id: 'html-css', title: 'HTML5 & CSS3/Tailwind', iconUrl: '/assets/onboarding/icons/tech-html-css.svg', relevantRoles: ['frontend', 'fullstack'] },
        { id: 'js-ts', title: 'JavaScript / TypeScript', iconUrl: '/assets/onboarding/icons/tech-js-ts.svg', relevantRoles: ['frontend', 'backend', 'fullstack'] },
        { id: 'angular', title: 'Angular Framework', iconUrl: '/assets/onboarding/icons/tech-angular.svg', relevantRoles: ['frontend', 'fullstack'] },
        { id: 'react-next', title: 'ReactJS / Next.js', iconUrl: '/assets/onboarding/icons/tech-react.svg', relevantRoles: ['frontend', 'fullstack'] },
        { id: 'node-express', title: 'NodeJS & ExpressJS API', iconUrl: '/assets/onboarding/icons/tech-node.svg', relevantRoles: ['backend', 'fullstack'] },
        { id: 'database', title: 'Cơ sở dữ liệu (MongoDB / MySQL)', iconUrl: '/assets/onboarding/icons/tech-db.svg', relevantRoles: ['backend', 'fullstack', 'data-ai'] },
        { id: 'dsa', title: 'Cấu trúc dữ liệu & Thuật toán', iconUrl: '/assets/onboarding/icons/tech-dsa.svg', relevantRoles: ['frontend', 'backend', 'fullstack', 'mobile'] },
        { id: 'portfolio', title: 'Xây dựng dự án thực chiến (Portfolio)', iconUrl: '/assets/onboarding/icons/tech-portfolio.svg', relevantRoles: ['frontend', 'backend', 'fullstack', 'mobile', 'data-ai'] }
      ]
    },
    {
      id: 3,
      label: 'Trình độ hiện tại',
      badge: 'CÂU HỎI 3',
      title: 'Trình độ công nghệ hiện tại của bạn ở mức nào?',
      subtitle: 'Chọn 1 đáp án phản ánh đúng nhất năng lực hiện tại của bạn.',
      type: 'single-level',
      asideTitle: 'Hiểu rõ trình độ của bạn',
      asideDesc: 'Giúp chúng tôi cá nhân hóa lộ trình học tập và đề xuất khóa học phù hợp nhất.',
      asideImage: '/assets/onboarding/aside-1840-13335.png',
      options: [
        {
          id: 'beginner',
          title: 'Người mới bắt đầu (Beginner)',
          desc: 'Chưa có kiến thức lập trình hoặc mới tìm hiểu khái niệm, muốn học từ số 0.',
          emoji: '🌱'
        },
        {
          id: 'intermediate',
          title: 'Đã có nền tảng cơ bản (Intermediate)',
          desc: 'Đã nắm cú pháp và logic cơ bản, muốn thực hành làm dự án thực tế.',
          emoji: '🌿'
        },
        {
          id: 'advanced',
          title: 'Đã đi làm / Chuyển ngành (Advanced)',
          desc: 'Đã có kinh nghiệm làm việc, muốn nâng cao kỹ năng kiến trúc và tối ưu hóa hệ thống.',
          emoji: '🌳'
        }
      ]
    }
  ];

  get currentQuestion(): SurveyQuestion {
    return this.questions[this.currentStep()];
  }

  ngOnInit(): void {
    this.restoreFromSessionStorage();
  }

  // Lắng nghe phím Enter để tiếp tục (SPEC-ONB-STU-01 III.1)
  @HostListener('window:keydown.enter', ['$event'])
  handleEnterKey(event: Event): void {
    if (this.canProceed() && !this.submitting() && !this.showSkipConfirm()) {
      event.preventDefault();
      this.handlePrimaryAction();
    }
  }

  selectRole(roleId: string): void {
    this.answers.targetRole = roleId;
    this.errorMessage.set('');
    this.saveToSessionStorage();
  }

  toggleTech(techId: string): void {
    const list = this.answers.selectedSkills;
    if (list.includes(techId)) {
      this.answers.selectedSkills = list.filter(id => id !== techId);
    } else {
      if (list.length >= 3) {
        this.errorMessage.set('Bạn chỉ có thể chọn tối đa 3 kỹ năng quan tâm.');
        return;
      }
      this.answers.selectedSkills = [...list, techId];
    }
    this.errorMessage.set('');
    this.saveToSessionStorage();
  }

  isTechSelected(techId: string): boolean {
    return this.answers.selectedSkills.includes(techId);
  }

  selectedTechCount(): number {
    return this.answers.selectedSkills.length;
  }

  selectLevel(levelId: string): void {
    this.answers.currentLevel = levelId;
    this.errorMessage.set('');
    this.saveToSessionStorage();
  }

  isStepCompleted(stepId: number): boolean {
    if (stepId === 1) return !!this.answers.targetRole;
    if (stepId === 2) return this.answers.selectedSkills.length > 0;
    if (stepId === 3) return !!this.answers.currentLevel;
    return false;
  }

  canProceed(): boolean {
    const step = this.currentStep();
    if (step === 0) return !!this.answers.targetRole;
    if (step === 1) return this.answers.selectedSkills.length >= 1 && this.answers.selectedSkills.length <= 3;
    if (step === 2) return !!this.answers.currentLevel;
    return false;
  }

  // Ưu tiên các kỹ năng liên quan đến nghề đã chọn đưa lên đầu (SPEC-ONB-STU-01 II.2)
  sortedTechOptions(): SurveyOption[] {
    const q2 = this.questions[1];
    const role = this.answers.targetRole;
    if (!role) return q2.options;

    return [...q2.options].sort((a, b) => {
      const aRel = a.relevantRoles?.includes(role) ? 1 : 0;
      const bRel = b.relevantRoles?.includes(role) ? 1 : 0;
      return bRel - aRel;
    });
  }

  isRelevantToRole(opt: SurveyOption): boolean {
    const role = this.answers.targetRole;
    return !!(role && opt.relevantRoles?.includes(role));
  }

  handlePrimaryAction(): void {
    if (!this.canProceed() || this.submitting()) return;

    if (this.currentStep() < 2) {
      this.currentStep.update(s => s + 1);
      this.errorMessage.set('');
      this.saveToSessionStorage();
    } else {
      this.submitSurvey();
    }
  }

  prevStep(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update(s => s - 1);
      this.errorMessage.set('');
      this.saveToSessionStorage();
    }
  }

  submitSurvey(): void {
    if (this.submitting()) return; // Debounce chống spam click (EX-ONB-02 & AC-ONB-15)
    this.submitting.set(true);

    const prefs: StudentPreferences = {
      targetRole: this.answers.targetRole!,
      selectedSkills: this.answers.selectedSkills,
      currentLevel: this.answers.currentLevel!
    };

    this.onboardingService.submitOnboarding(prefs).subscribe({
      next: () => {
        this.submitting.set(false);
        this.clearSessionStorage();
        this.toastService.showToast({ type: 'success', message: 'Thiết lập thành công!' });
        this.navigateAfterOnboarding();
      },
      error: () => {
        // EX-ONB-01: Lỗi mạng / timeout -> Tắt spinner, hiện toast đỏ, bảo lưu form
        this.submitting.set(false);
        this.showToast('Không thể lưu thông tin khảo sát. Vui lòng kiểm tra lại mạng Internet và thử lại!', 'error');
      }
    });
  }

  openSkipModal(): void {
    if (this.currentStep() < 2 && !this.submitting()) this.showSkipConfirm.set(true);
  }

  closeSkipModal(): void {
    this.showSkipConfirm.set(false);
  }

  confirmSkipSurvey(): void {
    if (this.submitting() || this.currentStep() === 2) return;
    this.showSkipConfirm.set(false);
    this.submitting.set(true);
    this.onboardingService.skipOnboarding().subscribe({
      next: () => {
        this.submitting.set(false);
        this.clearSessionStorage();
        this.navigateAfterOnboarding();
      },
      error: () => {
        this.submitting.set(false);
        this.showToast('Không thể bỏ qua khảo sát. Vui lòng thử lại!', 'error');
      }
    });
  }

  private draftKey(): string {
    const user = this.onboardingService.getCurrentUser();
    return `${this.draftPrefix}${user?.id || user?.email || 'guest'}`;
  }

  private navigateAfterOnboarding(): void {
    const requested = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('thinkup_post_onboarding_return')
      : null;
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('thinkup_post_onboarding_return');
    const destination = requested?.startsWith('/') && !requested.startsWith('//') && requested !== '/onboarding'
      ? requested
      : '/main/home';
    this.router.navigateByUrl(destination);
  }

  private saveToSessionStorage(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const draft = {
        step: this.currentStep(),
        answers: this.answers
      };
      sessionStorage.setItem(this.draftKey(), JSON.stringify(draft));
    } catch {}
  }

  private restoreFromSessionStorage(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(this.draftKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= 2) {
          this.currentStep.set(parsed.step);
        }
        if (parsed.answers) {
          this.answers = {
            targetRole: parsed.answers.targetRole || null,
            selectedSkills: parsed.answers.selectedSkills || [],
            currentLevel: parsed.answers.currentLevel || null
          };
        }
      }
    } catch {}
  }

  private clearSessionStorage(): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(this.draftKey());
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    setTimeout(() => {
      this.toastMessage.set('');
    }, 4000);
  }
}
