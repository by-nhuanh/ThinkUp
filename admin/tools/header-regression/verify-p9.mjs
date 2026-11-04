/**
 * P9 E2E: i18n foundation — vi default, typed dictionary, coverage gate.
 *
 * English is intentionally disabled until every admin screen is migrated, so the
 * only observable behaviour is: vi stays byte-identical, the language selector
 * exposes English as disabled, and forcing `en` through the DOM does not change
 * the UI or persist a non-default language.
 *
 * Usage: node verify-p9.mjs [--out=dir] [--port=9341]
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

const BASE = process.env.P9_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const LANGUAGE_KEY = 'thinkup_admin_language';
const PREFERENCES_KEY = `thinkup_admin_preferences_demo:${ADMIN_ID}`;
const SESSION = {
  token: 'demo-local-access-token',
  user: {
    id: ADMIN_ID,
    email: 'admin@thinkup.edu.vn',
    fullName: 'Quản trị viên ThinkUp',
    role: 'admin',
    avatar: null,
    passwordExpiresAt: null,
    mustChangePassword: false,
    twoFactorSetupRequired: false
  }
};

function parseArgs(argv) {
  const args = { out: tempDir('p9'), port: 9341 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function clickByText(cdp, selector, text) {
  const ok = await cdp.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((item) => item.textContent.trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found by text: ${selector} "${text}"`);
  await sleep(200);
}

async function openSettings(cdp) {
  await cdp.evaluate(`document.querySelector('[aria-label="Cài đặt"]')?.click()`);
  await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(200);
}

async function openTab(cdp, label) {
  const ok = await cdp.evaluate(`(() => {
    const node = Array.from(document.querySelectorAll('.settings-tab'))
      .find((item) => item.textContent.includes(${JSON.stringify(label)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Settings tab not found: ${label}`);
  await sleep(200);
}

async function saveSettings(cdp) {
  await clickByText(cdp, 'button', 'Lưu cấu hình');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(250);
}

const languageState = (cdp) => cdp.evaluate(`(() => {
  const select = Array.from(document.querySelectorAll('dialog select'))
    .find((node) => Array.from(node.options).some((option) => option.value === 'vi'));
  const options = select ? Array.from(select.options).map((option) => ({
    value: option.value, disabled: option.disabled, label: option.textContent.trim()
  })) : [];
  return {
    value: select ? select.value : null,
    options,
    stored: localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}),
    statusBarText: document.querySelector('.status-bar')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    statusBarAria: document.querySelector('.status-bar')?.getAttribute('aria-label') ?? null
  };
})()`);

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p9-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 320)}` : ''}`);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  try {
    await setViewport(cdp, 1920, 1080);
    await navigate(cdp, `${BASE}/login`);
    await cdp.evaluate(`(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('access_token', ${JSON.stringify(SESSION.token)});
      localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(SESSION.user))});
      localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
      localStorage.setItem('thinkup_admin_toolbar_offset', '16');
      return true;
    })()`);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await sleep(400);

    // 1. Default language is Vietnamese, nothing stored yet.
    await openSettings(cdp);
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    const initial = await languageState(cdp);
    record('default-language-vi',
      initial.value === 'vi' && initial.stored === null
      && initial.options.some((option) => option.value === 'vi'),
      initial);

    // 2. English exists but is disabled by the coverage gate.
    const english = initial.options.find((option) => option.value === 'en');
    record('english-disabled-by-coverage-gate', english?.disabled === true, english);

    // 3. Forcing `en` through the DOM cannot bypass the gate.
    const forced = await cdp.evaluate(`(() => {
      const select = Array.from(document.querySelectorAll('dialog select'))
        .find((node) => Array.from(node.options).some((option) => option.value === 'vi'));
      if (!select) return { ok: false };
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value, stored: localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}) };
    })()`);
    await sleep(200);
    const afterForce = await languageState(cdp);
    record('forced-english-is-ignored',
      forced.ok === true && afterForce.statusBarText === null && afterForce.stored !== 'en',
      { forced, afterForce });

    // 4. Persisting `vi` works and survives a reload.
    await cdp.evaluate(`(() => {
      const select = Array.from(document.querySelectorAll('dialog select'))
        .find((node) => Array.from(node.options).some((option) => option.value === 'vi'));
      select.value = 'vi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(200);
    const storedVi = await languageState(cdp);
    record('language-vi-persists', storedVi.stored === 'vi', storedVi);

    // 5. Enable the status bar (P5) to verify the migrated dictionary output.
    await openTab(cdp, 'Giao diện chung');
    const enabledStatusBar = await cdp.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.switch-row'));
      const row = rows.find((node) => node.textContent.includes('thanh trạng thái'));
      if (!row) return false;
      row.querySelector('input[role="switch"]').click();
      return true;
    })()`);
    if (!enabledStatusBar) throw new Error('Status bar toggle not found');
    await sleep(200);
    await saveSettings(cdp);
    await waitFor(cdp, '!!document.querySelector(".status-bar")', { timeoutMs: 5000 });
    await sleep(250);
    const statusBar = await languageState(cdp);
    record('dictionary-renders-vietnamese-status-bar',
      statusBar.statusBarAria === 'Thanh trạng thái quản trị'
      && statusBar.statusBarText?.includes('Trực tuyến')
      && statusBar.statusBarText?.includes('Môi trường'),
      statusBar);
    await screenshot(cdp, { x: 0, y: 0, width: 1920, height: 1080 }, path.join(outDir, 'p9-status-bar-vi.png'));

    // 6. Reload keeps vi and the migrated strings.
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".status-bar")', { timeoutMs: 20000 });
    await sleep(300);
    const reloaded = await languageState(cdp);
    record('language-survives-reload', reloaded.stored === 'vi' && reloaded.statusBarAria === 'Thanh trạng thái quản trị', reloaded);

    // 7. Header untouched.
    const header = await cdp.evaluate(`(() => {
      const tools = document.querySelector('.liquid-tools');
      const rect = tools?.getBoundingClientRect();
      return {
        count: tools ? tools.querySelectorAll(':scope > button, :scope > .top-popover-anchor > button').length : 0,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      };
    })()`);
    record('header-unchanged', header.count === 4 && header.rect !== null, header);

    // Restore the status bar default so later runs start clean.
    await openSettings(cdp);
    await openTab(cdp, 'Giao diện chung');
    await cdp.evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.switch-row'));
      const row = rows.find((node) => node.textContent.includes('thanh trạng thái'));
      row?.querySelector('input[role="switch"]')?.click();
      return true;
    })()`);
    await sleep(200);
    await saveSettings(cdp);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p9',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors
    };
    fs.writeFileSync(path.join(outDir, 'p9-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p9-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
