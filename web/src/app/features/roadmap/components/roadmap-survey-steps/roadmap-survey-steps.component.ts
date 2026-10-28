import { Component, computed, input } from '@angular/core';
import { LucideCheck, LucideLightbulb } from '@lucide/angular';

interface SurveyStep {
  number: number;
  title: string;
  description: string;
}

@Component({
  selector: 'app-roadmap-survey-steps',
  standalone: true,
  imports: [LucideCheck, LucideLightbulb],
  templateUrl: './roadmap-survey-steps.component.html',
  styleUrls: ['../../styles/roadmap-ui.css', './roadmap-survey-steps.component.css']
})
export class RoadmapSurveyStepsComponent {
  readonly title = input('Khảo sát kiến thức');
  readonly activeStep = input(2);
  readonly stepTwoTitle = input('Làm bài test');
  readonly showTip = input(false);
  readonly tipLabel = input('Core Frontend');

  readonly steps = computed<SurveyStep[]>(() => [
    {
      number: 1,
      title: 'Lựa chọn giai đoạn học tập',
      description: 'Đánh giá mức độ hiện tại của bạn'
    },
    {
      number: 2,
      title: this.stepTwoTitle(),
      description: 'Kiểm tra giai đoạn chi tiết (tùy chọn)'
    },
    {
      number: 3,
      title: 'Hoàn tất',
      description: 'Nhận lộ trình học cá nhân hóa'
    }
  ]);

  isDone(step: number): boolean {
    return step < this.activeStep();
  }
}
