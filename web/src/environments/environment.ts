import { googleConfig } from '../generated/google-config';

export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  appUrl: 'http://localhost:4200',
  googleClientId: googleConfig.clientId,
  facebookAppId: googleConfig.facebookAppId,
  facebookGraphVersion: googleConfig.facebookGraphVersion
};
