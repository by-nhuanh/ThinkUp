export const environment = {
  production: true,
  apiUrl: 'https://be-thinkup.vercel.app/api',
  adminDemoLogin: false,
  adminDemoAuthFlow: {
    twoFactorEnabled: false,
    twoFactorCode: '',
    passwordDaysLeft: null as number | null,
    setupRequired: false
  }
};
