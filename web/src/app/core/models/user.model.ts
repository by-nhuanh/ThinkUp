export interface StudentPreferences {
  targetRole: string;
  selectedSkills: string[];
  currentLevel: string;
  submittedAt?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar?: string;
  role: 'student' | 'instructor' | 'admin';
  provider?: 'local' | 'google' | 'facebook';
  email_locked?: boolean;
  onboarding_completed?: boolean;
  preferences?: StudentPreferences;
  email_verified?: boolean;
  status?: 'active' | 'pending' | 'suspended' | string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
  refreshToken?: string;
  code?: string;
  errorCode?: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'BRUTE_FORCE' | 'NETWORK_ERROR' | 'MISSING_EMAIL' | 'DUPLICATE_EMAIL' | 'DUPLICATE_PHONE' | string;
  provider?: string;
  email?: string;
  resetToken?: string;
  autoLoginToken?: string;
  retryAfter?: number; // seconds
}

export interface AuthApiError extends Error {
  status?: number;
  errorCode?: string;
  field?: string;
  retryAfter?: number;
  provider?: string;
}
