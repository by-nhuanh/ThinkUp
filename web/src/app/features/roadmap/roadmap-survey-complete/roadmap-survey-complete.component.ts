import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideChartColumn,
  LucideRoute,
  LucideStar,
  LucideTarget
} from '@lucide/angular';
import { RoadmapTestService } from '../services/roadmap-test.service';
import { RoadmapSurveyStepsComponent } from '../components/roadmap-survey-steps/roadmap-survey-steps.component';

interface CompleteValue {
  icon: 'target' | 'route' | 'star' | 'chart';
  title: string;
  desc: string;
  tint: string;
  accent: string;
}

@Component({
  selector: 'app-roadmap-survey-complete',
  standalone: true,
  imports: [LucideChartColumn, LucideRoute, LucideStar, LucideTarget, RoadmapSurveyStepsComponent],
  templateUrl: './roadmap-survey-complete.component.html',
  styleUrls: ['../styles/roadmap-ui.css', './roadmap-survey-complete.component.css']
})
export class RoadmapSurveyCompleteComponent {
  private readonly testService = inject(RoadmapTestService);
  private readonly router = inject(Router);

  readonly submission = computed(() => this.testService.lastSubmission());
  readonly roadmapId = computed(() => this.submission()?.roadmapId ?? '');
  readonly score = computed(() => this.submission()?.result.score ?? 0);

  readonly values: CompleteValue[] = [
    {
      icon: 'target',
      title: 'Đúng trình độ',
      desc: 'Bắt đầu từ mức phù hợp với bạn',
      tint: '#E6F4FF',
      accent: '#0088E8'
    },
    {
      icon: 'route',
      title: 'Rõ ràng lộ trình',
      desc: 'Học theo từng bước, liên tục tiến bộ',
      tint: '#F3ECFF',
      accent: '#7C3AED'
    },
    {
      icon: 'star',
      title: 'Cá nhân hóa',
      desc: 'Theo mục tiêu và sở thích của bạn',
      tint: '#E6F7EE',
      accent: '#16A34A'
    },
    {
      icon: 'chart',
      title: 'Hiệu quả hơn',
      desc: 'Tối ưu thời gian, đạt kết quả tốt nhất',
      tint: '#FFF1E6',
      accent: '#EA7317'
    }
  ];

  startLearning(): void {
    const roadmapId = this.roadmapId();
    this.router.navigate(roadmapId ? ['/learning/roadmap', roadmapId] : ['/learning/roadmap']);
  }
}
