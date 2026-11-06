import { googleConfig } from '../generated/google-config';

export const environment = {
  production: true,
  apiUrl: 'https://be-thinkup.vercel.app/api',
  appUrl: 'https://think-up-edu.vercel.app',
  googleClientId: googleConfig.clientId,
  facebookAppId: googleConfig.facebookAppId,
  facebookGraphVersion: googleConfig.facebookGraphVersion
};
