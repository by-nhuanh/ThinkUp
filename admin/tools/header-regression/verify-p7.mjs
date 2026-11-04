/**
 * P7 E2E: local display preferences — number format (full/compact) and privacy
 * (off/blur; mask stays available internally but the BA dialog exposes one toggle).
 *
 * Covers: default state, blur/mask on real consumers (students, lecturers,
 * dashboard logs), compact numbers, localStorage persistence across reload,
 * cancel rollback, reset defaults, responsive widths and console errors.
 *
 * Usage: node verify-p7.mjs [--out=dir] [--port=9339]
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

const BASE = process.env.P7_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const DISPLAY_KEY = 'thinkup_admin_display_preferences';
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
  const args = { out: tempDir('p7'), port: 9339 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

async function click(cdp, selector, index = 0) {
  const ok = await cdp.evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    const node = nodes[${index}];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Click target not found: ${selector}[${index}]`);
  await sleep(180);
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
  await sleep(180);
}

async function choose(cdp, name, value) {
  const ok = await cdp.evaluate(`(() => {
    const input = document.querySelector('input[name=${JSON.stringify(name)}][value=${JSON.stringify(value)}]');
    if (!input) return false;
    input.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Radio not found: ${name}=${value}`);
  await sleep(220);
}

async function openSettings(cdp) {
  await click(cdp, '[aria-label="Cài đặt"]');
  await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(150);
}

async function closeSettings(cdp) {
  const open = await cdp.evaluate('!!document.querySelector("dialog[open]")');
  if (open) await clickByText(cdp, 'dialog button', 'Hủy bỏ');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
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

async function toggleSwitch(cdp, name) {
  const ok = await cdp.evaluate(`(() => {
    const input = document.querySelector('input[name=${JSON.stringify(name)}]');
    if (!input) return false;
    input.click();
    return true;
  })()`);
  if (!ok) throw new Error(`Switch not found: ${name}`);
  await sleep(220);
}

async function saveSettings(cdp) {
  await clickByText(cdp, 'button', 'Lưu cấu hình');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(220);
}

const privacyState = (cdp) => cdp.evaluate(`(() => {
  const shell = document.querySelector('.admin-shell');
  const sensitive = Array.from(document.querySelectorAll('.sensitive'));
  const first = sensitive[0];
  return {
    mode: shell?.dataset?.privacy ?? '',
    sensitiveCount: sensitive.length,
    filter: first ? getComputedStyle(first).filter : null,
    firstText: first ? first.textContent.trim() : null,
    scrollOverflow: document.documentElement.scrollWidth - window.innerWidth
  };
})()`);

const lecturerNumberText = (cdp) => cdp.evaluate(`(() => {
  const cell = document.querySelector('tbody td.cell-nowrap');
  return cell ? cell.textContent.replace(/\\s+/g, ' ').trim() : null;
})()`);

const kpiText = (cdp) => cdp.evaluate(`(() => document.querySelector('.kpi-value')?.textContent.replace(/\\s+/g, ' ').trim() ?? null)()`);

async function go(cdp, pathName, readySelector) {
  await navigate(cdp, `${BASE}${pathName}`);
  await waitFor(cdp, `!!document.querySelector(${JSON.stringify(readySelector)})`, { timeoutMs: 20000 });
  await sleep(400);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p7-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  };
  const capture = async (name) => {
    const viewport = await cdp.evaluate('({ width: innerWidth, height: innerHeight })');
    await screenshot(cdp, { x: 0, y: 0, width: viewport.width, height: viewport.height },
      path.join(outDir, `${name}.png`));
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

    // 1. Defaults: privacy off, no sensitive element blurred.
    await go(cdp, '/users/students', '.user-page');
    const defaults = await privacyState(cdp);
    record('defaults-privacy-off',
      defaults.mode === 'off' && defaults.sensitiveCount > 0
      && (defaults.filter === 'none' || defaults.filter === ''),
      defaults);
    record('defaults-number-full', (await kpiText(cdp)) !== null, { kpi: await kpiText(cdp) });
    await capture('p7-defaults');

    // 2. Privacy toggle previews blur on real sensitive cells.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    record('settings-display-section', await cdp.evaluate(`!!document.querySelector('#settings-display')`));
    await toggleSwitch(cdp, 'admin-privacy');
    const blurState = await privacyState(cdp);
    record('privacy-blur-applies',
      blurState.mode === 'blur' && blurState.filter === 'blur(4px)',
      blurState);
    await capture('p7-settings-blur');

    // 3. Turning the toggle off previews visible data again.
    await toggleSwitch(cdp, 'admin-privacy');
    const offPreview = await privacyState(cdp);
    record('privacy-toggle-preview-off', offPreview.mode === 'off', offPreview);

    // 4. Cancel discards the preview and restores the saved mode.
    await toggleSwitch(cdp, 'admin-privacy');
    await closeSettings(cdp);
    const afterCancel = await privacyState(cdp);
    record('cancel-rolls-back-privacy', afterCancel.mode === 'off', afterCancel);

    // 5. Privacy on + Save persists the preference and survives a reload.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    await toggleSwitch(cdp, 'admin-privacy');
    await saveSettings(cdp);
    const afterSave = await privacyState(cdp);
    record('privacy-save-applies', afterSave.mode === 'blur' && afterSave.filter === 'blur(4px)', afterSave);

    // 6. Add compact numbers, then verify persistence after a reload.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    await choose(cdp, 'admin-number-format', 'compact');
    await saveSettings(cdp);
    const stored = await cdp.evaluate(`localStorage.getItem(${JSON.stringify(DISPLAY_KEY)})`);
    const parsed = stored ? JSON.parse(stored) : null;
    record('local-storage-written', parsed?.privacyMode === 'blur' && parsed?.numberFormat === 'compact', parsed);
    await go(cdp, '/users/students', '.user-page');
    const afterReload = await privacyState(cdp);
    record('preferences-survive-reload', afterReload.mode === 'blur' && afterReload.filter === 'blur(4px)', afterReload);

    // 7. Compact numbers on lecturers (1.420 learners → 1,4 N).
    await go(cdp, '/users/lecturers', 'table tbody tr');
    const compactCell = await lecturerNumberText(cdp);
    const compactKpi = await kpiText(cdp);
    record('compact-number-format',
      compactCell !== null && /N|T/.test(compactCell) && compactCell !== '-' && !compactCell.includes('1.4'),
      { cell: compactCell, kpi: compactKpi });
    await capture('p7-lecturers-blur-compact');

    // 8. Full format is restored and grouping preserved.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    await choose(cdp, 'admin-number-format', 'full');
    await saveSettings(cdp);
    const fullCell = await lecturerNumberText(cdp);
    record('full-number-format', fullCell !== null && !/N|T/.test(fullCell) && /\d/.test(fullCell), { cell: fullCell });

    // 9. Dashboard log IP obeys privacy in the log table and the drawer.
    await go(cdp, '/', '.logs-panel td');
    const dashboardPrivacy = await privacyState(cdp);
    record('dashboard-ip-blurred',
      dashboardPrivacy.mode === 'blur' && dashboardPrivacy.sensitiveCount > 0
      && dashboardPrivacy.filter === 'blur(4px)',
      { count: dashboardPrivacy.sensitiveCount, filter: dashboardPrivacy.filter });
    await click(cdp, '.view-log');
    await waitFor(cdp, '!!document.querySelector(".log-drawer")', { timeoutMs: 5000 });
    const drawerPrivacy = await cdp.evaluate(`(() => {
      const term = Array.from(document.querySelectorAll('.log-drawer dt'))
        .find((node) => node.textContent.includes('IP Address'));
      const value = term?.nextElementSibling;
      const sensitive = value?.querySelector('.sensitive') || value;
      return {
        text: value?.textContent.trim() ?? null,
        filter: sensitive ? getComputedStyle(sensitive).filter : null
      };
    })()`);
    record('drawer-ip-blurred', drawerPrivacy.filter === 'blur(4px)', drawerPrivacy);
    await capture('p7-dashboard-blur');
    await click(cdp, '.log-drawer header button');

    // 10. Reset defaults applies immediately and is not rolled back by saving.
    await openSettings(cdp);
    await clickByText(cdp, 'button', 'Khôi phục mặc định');
    await clickByText(cdp, '.reset-actions button', 'Khôi phục');
    await saveSettings(cdp);
    const afterReset = await privacyState(cdp);
    record('reset-display-defaults', afterReset.mode === 'off', afterReset);

    // 10. Responsive: no page overflow on the pages carrying the new spans.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    await toggleSwitch(cdp, 'admin-privacy');
    await saveSettings(cdp);
    for (const [width, height] of [[1440, 900], [1366, 768], [1100, 800], [1024, 768]]) {
      await setViewport(cdp, width, height);
      await go(cdp, '/users/students', '.user-page');
      const layout = await privacyState(cdp);
      record(`responsive-students-${width}`, layout.scrollOverflow <= 0, { width, overflow: layout.scrollOverflow });
      await go(cdp, '/users/lecturers', 'table tbody tr');
      const lect = await privacyState(cdp);
      record(`responsive-lecturers-${width}`, lect.scrollOverflow <= 0, { width, overflow: lect.scrollOverflow });
    }
    await setViewport(cdp, 1920, 1080);
    await capture('p7-blur-1920');

    // Restore off so later runs start from defaults.
    await openSettings(cdp);
    await openTab(cdp, 'Định dạng dữ liệu');
    await toggleSwitch(cdp, 'admin-privacy');
    await saveSettings(cdp);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p7',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors
    };
    fs.writeFileSync(path.join(outDir, 'p7-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p7-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
