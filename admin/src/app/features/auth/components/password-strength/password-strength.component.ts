import { Component, computed, input } from '@angular/core';

type StrengthTone = 'none' | 'weak' | 'medium' | 'strong';

interface StrengthState {
  level: number;
  label: string;
  tone: StrengthTone;
  hint: string;
}

/**
 * Thanh đo độ mạnh mật khẩu (Figma: 4 thanh 114×6, nhãn "Độ mạnh mật khẩu: …").
 * Ngưỡng bám theo đặc tả: tối thiểu 12 ký tự, có chữ hoa/thường/số/ký tự đặc biệt.
 */
@Component({
  selector: 'app-password-strength',
  standalone: true,
  templateUrl: './password-strength.component.html',
  styleUrl: './password-strength.component.css'
})
export class PasswordStrengthComponent {
  readonly value = input('');

  protected readonly bars = [1, 2, 3, 4];

  protected readonly state = computed<StrengthState>(() => evaluatePassword(this.value()));

  protected readonly level = computed(() => this.state().level);
  protected readonly label = computed(() => this.state().label);
  protected readonly tone = computed(() => this.state().tone);
  protected readonly hint = computed(() => this.state().hint);
}

function evaluatePassword(value: string): StrengthState {
  if (!value) {
    return { level: 0, label: '', tone: 'none', hint: '' };
  }

  const hasLower = /[a-zà-ỹ]/.test(value);
  const hasUpper = /[A-ZÀ-Ỹ]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSpecial = /[^A-Za-z0-9à-ỹÀ-Ỹ\s]/.test(value);
  const classes = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (value.length >= 12 && classes >= 4) {
    return { level: 4, label: 'Rất mạnh', tone: 'strong', hint: '' };
  }

  if (value.length >= 12 && classes >= 3) {
    return { level: 3, label: 'Mạnh', tone: 'strong', hint: 'Mật khẩu đạt yêu cầu bảo mật.' };
  }

  if (value.length >= 8) {
    return {
      level: 2,
      label: 'Trung bình',
      tone: 'medium',
      hint: 'Thêm chữ hoa, số hoặc ký tự đặc biệt để tăng độ mạnh.'
    };
  }

  return {
    level: 1,
    label: 'Yếu',
    tone: 'weak',
    hint: 'Thêm chữ hoa, số hoặc ký tự đặc biệt để tăng độ mạnh.'
  };
}
