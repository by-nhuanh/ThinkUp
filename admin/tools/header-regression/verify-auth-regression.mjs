/**
 * P1 authentication regression (frontend): demo login, logout, expired-password guard.
 * Uses the development build served on :4211. Backend auth flows (2FA/rotation) are
 * covered by the server test suite, not re-implemented here.
 *
 * Usage: node verify-auth-regression.mjs [--out=dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  connectPage,
  launchBrowser,
  navigate,
  screenshot,
  setViewport,
  sleep,
  stopBrowser,
  tempDir,
  waitFor
} from './lib.mjs';

const BASE = process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const EMAIL = 'admin@thinkup.edu.vn';
const PASSWORD = 'Admin@123';

function parseArgs(argv) {
  const args = { out: tempDir('p1-auth'), port: 9336 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function fill(cdp, selector, value) {
  const ok = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Input not found: ${selector}`);
}

async function click(cdp, selector) {
  const ok = await cdp.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found: ${selector}`);
  await sleep(200);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p1-auth-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const screenshots = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${JSON.stringify(detail).slice(0, 260)}` : ''}`);
  };
  const capture = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await screenshot(cdp, { x: 0, y: 0, width: 1920, height: 1080 }, file);
    screenshots.push(file);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  try {
    await setViewport(cdp, 1920, 1080);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector("input[type=email]")', { timeoutMs: 15000 });
    await cdp.evaluate('localStorage.clear(); sessionStorage.clear(); true');
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector("input[type=email]")', { timeoutMs: 15000 });
    await capture('login-page');

    // 1. Demo login succeeds and lands on the dashboard shell.
    await fill(cdp, 'input[type=email]', EMAIL);
    await fill(cdp, 'input[type=password]', PASSWORD);
    await click(cdp, 'button[type=submit]');
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 15000 });
    const loggedIn = await cdp.evaluate(`({
      path: location.pathname,
      sessionToken: sessionStorage.getItem('access_token'),
      localToken: localStorage.getItem('access_token')
    })`);
    record('demo-login', loggedIn.path === '/' && (!!loggedIn.sessionToken || !!loggedIn.localToken), loggedIn);
    await capture('dashboard-after-login');

    // 2. Logout via the account menu returns to /login and clears the session.
    await click(cdp, '.account-tool');
    await click(cdp, '.account-logout');
    await sleep(300);
    const loggedOut = await cdp.evaluate(`({
      path: location.pathname,
      sessionToken: sessionStorage.getItem('access_token'),
      localToken: localStorage.getItem('access_token'),
      user: localStorage.getItem('thinkup_admin_user') || sessionStorage.getItem('thinkup_admin_user')
    })`);
    record('logout-demo', loggedOut.path === '/login' && !loggedOut.sessionToken && !loggedOut.localToken && !loggedOut.user, loggedOut);

    // 3. Expired password is blocked by the existing policy guard.
    await cdp.evaluate(`(() => {
      localStorage.setItem('access_token', 'demo-local-access-token');
      localStorage.setItem('thinkup_admin_user', JSON.stringify({
        id: 'demo-admin@thinkup.edu.vn',
        email: 'admin@thinkup.edu.vn',
        fullName: 'Quản trị viên ThinkUp',
        role: 'admin',
        avatar: null,
        passwordExpiresAt: '2020-01-01T00:00:00.000Z',
        mustChangePassword: false,
        twoFactorSetupRequired: false
      }));
      return true;
    })()`);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, 'location.pathname === "/auth/password-expired"', { timeoutMs: 10000 });
    const expired = await cdp.evaluate(`({
      path: location.pathname,
      text: document.body.innerText.slice(0, 180)
    })`);
    record('expired-password-guard', expired.path === '/auth/password-expired', expired);
    await capture('password-expired');

    record('no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 5));

    const report = {
      tool: 'verify-auth-regression.mjs',
      startedAt: new Date().toISOString(),
      url: BASE,
      browser: launch.version,
      passed: results.every((item) => item.passed),
      results,
      consoleErrors,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'auth-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'auth-report.json')}`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    cdp.close();
    await stopBrowser(launch);
  }
}

run().catch((error) => {
  console.error('FATAL', error?.stack || error);
  process.exitCode = 2;
});
