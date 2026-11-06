#!/usr/bin/env node
/**
 * Generates `src/generated/google-config.ts` from environment variables.
 *
 * The generated module is gitignored on purpose: client ids are environment
 * configuration, not source code. `npm start` / `npm run build` call this
 * script first so a clean checkout (and Vercel) never needs a committed file.
 *
 * Values come from the process environment first (Vercel project variables)
 * and fall back to the repository-root `.env`, then `web/.env`. dotenv never
 * overrides variables that already exist, so deployment configuration wins.
 *
 * Missing values are reported as warnings, never as build failures: the app
 * degrades gracefully and shows "chưa cấu hình" messages at runtime.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = resolve(projectRoot, 'src/generated/google-config.ts');

// No-op when either file is absent, which is the case on CI deployments.
loadDotenv({ path: resolve(projectRoot, '..', '.env'), quiet: true });
loadDotenv({ path: resolve(projectRoot, '.env'), quiet: true });

/** Returns the first non-empty value among the given environment keys. */
function readEnv(...keys) {
  for (const key of keys) {
    const value = (process.env[key] ?? '').trim();
    if (value) return { value, key };
  }
  return { value: '', key: keys[0] };
}

const clientId = readEnv('GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID', 'NG_GOOGLE_CLIENT_ID');
const facebookAppIdCandidate = readEnv('FACEBOOK_APP_ID', 'NG_FACEBOOK_APP_ID', 'FACEBOOK_CLIENT_ID');
const facebookAppId = /^\d+$/.test(facebookAppIdCandidate.value)
  ? facebookAppIdCandidate
  : { value: '', key: 'FACEBOOK_APP_ID (cần ID ứng dụng dạng số)' };
const facebookGraphVersion = readEnv(
  'FACEBOOK_GRAPH_VERSION',
  'FACEBOOK_GRAPH_API_VERSION',
  'NG_FACEBOOK_GRAPH_VERSION',
);

const graphVersion = facebookGraphVersion.value || 'v21.0';

const fileContent = `// File này được tạo tự động bởi scripts/write-google-config.mjs.
// Không sửa trực tiếp: mọi thay đổi sẽ bị ghi đè ở lần build/dev tiếp theo.
export interface GoogleConfig {
  readonly clientId: string;
  readonly facebookAppId: string;
  readonly facebookGraphVersion: string;
}

export const googleConfig: GoogleConfig = {
  clientId: ${JSON.stringify(clientId.value)},
  facebookAppId: ${JSON.stringify(facebookAppId.value)},
  facebookGraphVersion: ${JSON.stringify(graphVersion)},
};
`;

mkdirSync(dirname(outputFile), { recursive: true });

// Keep the file timestamp stable so incremental builds are not invalidated.
const previousContent = existsSync(outputFile) ? readFileSync(outputFile, 'utf8') : '';
if (previousContent !== fileContent) {
  writeFileSync(outputFile, fileContent, 'utf8');
}

const missing = [];
if (!clientId.value) missing.push(clientId.key);
if (!facebookAppId.value) missing.push(facebookAppId.key);

if (missing.length > 0) {
  console.warn(
    `[google-config] Thiếu biến môi trường: ${missing.join(', ')}. ` +
      'Google vẫn hoạt động nếu đã có GOOGLE_CLIENT_ID; Facebook sẽ hiện thông báo đang cập nhật nếu thiếu FACEBOOK_APP_ID hợp lệ ' +
      '(../.env, web/.env hoặc Vercel Project Settings → Environment Variables).',
  );
}
