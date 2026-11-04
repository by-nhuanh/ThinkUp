/**
 * P6 E2E: theme (light/dark) + density (standard/compact/comfortable).
 *
 * Runs against the development build with the demo adapters (no backend needed).
 * Covers: light baseline unchanged, dark token preview/contrast, theme persistence,
 * cancel rollback, all three densities on tables and notification lists, header
 * (`.liquid-tools`) frozen across every mode, responsive widths, no console errors.
 *
 * Usage: node verify-p6.mjs [--out=dir] [--port=9338]
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

const BASE = process.env.P6_BASE_DEV || process.env.P1_BASE_DEV || 'http://127.0.0.1:4211';
const ADMIN_ID = 'demo-admin@thinkup.edu.vn';
const STORAGE_KEY = `thinkup_admin_preferences_demo:${ADMIN_ID}`;
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
  const args = { out: tempDir('p6'), port: 9338 };
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
  await sleep(180);
}

async function openSettings(cdp) {
  await click(cdp, '[aria-label="Cài đặt"]');
  await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
}

async function saveSettings(cdp) {
  await clickByText(cdp, 'button', 'Lưu cấu hình');
  await waitFor(cdp, '!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
  await sleep(250);
}

async function openTab(cdp, label) {
  await clickByText(cdp, '.settings-tab', label);
  await sleep(180);
}

/** WCAG AA contrast for a list of [name, selector] pairs in the open dialog. */
async function measureContrast(cdp, pairs) {
  return cdp.evaluate(`(() => {
    const parse = (value) => {
      const match = String(value).match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      return match[1].split(',').map((part) => parseFloat(part));
    };
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (fg, bg) => {
      const a = luminance(fg); const b = luminance(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const backgroundOf = (node) => {
      let current = node;
      while (current && current !== document.documentElement) {
        const bg = getComputedStyle(current).backgroundColor;
        const parsed = parse(bg);
        if (parsed && !/rgba\\(.*,\\s*0\\)$/.test(bg)) return parsed;
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    return ${JSON.stringify(pairs)}.map(([name, selector]) => {
      const node = document.querySelector(selector);
      if (!node) return { name, selector, missing: true };
      const style = getComputedStyle(node);
      const fg = parse(style.color);
      const bg = backgroundOf(node);
      return {
        name,
        selector,
        color: style.color,
        background: 'rgb(' + bg.join(', ') + ')',
        ratio: fg ? Number(ratio(fg, bg).toFixed(2)) : null,
        fontSize: parseFloat(style.fontSize),
        fontWeight: style.fontWeight
      };
    });
  })()`);
}

async function setPreferences(cdp, patch) {
  const ok = await cdp.evaluate(`(() => {
    const key = ${JSON.stringify(STORAGE_KEY)};
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    Object.assign(parsed.preferences, ${JSON.stringify(patch)});
    localStorage.setItem(key, JSON.stringify(parsed));
    return true;
  })()`);
  if (!ok) throw new Error('Demo preference snapshot missing');
}

const shellState = (cdp) => cdp.evaluate(`(() => {
  const shell = document.querySelector('.admin-shell');
  const styles = getComputedStyle(shell);
  const dashboard = document.querySelector('.dashboard');
  const header = document.querySelector('header.top-utility-bar');
  const tools = document.querySelector('.liquid-tools');
  const toolRect = tools?.getBoundingClientRect();
  return {
    themeDark: shell?.classList.contains('theme-dark') ?? null,
    density: shell?.dataset?.density ?? '',
    tokens: {
      canvas: styles.getPropertyValue('--admin-canvas').trim(),
      surface: styles.getPropertyValue('--admin-surface').trim(),
      textStrong: styles.getPropertyValue('--admin-text-strong').trim(),
      accent: styles.getPropertyValue('--admin-accent').trim()
    },
    dashboardBackground: dashboard ? getComputedStyle(dashboard).backgroundColor : null,
    scrollOverflow: document.documentElement.scrollWidth - window.innerWidth,
    header: header ? { className: header.getAttribute('class'), visible: header.getBoundingClientRect().height > 0 } : null,
    tools: toolRect ? { x: toolRect.x, y: toolRect.y, width: toolRect.width, height: toolRect.height } : null,
    toolsStyle: tools ? {
      backgroundImage: getComputedStyle(tools).backgroundImage,
      borderRadius: getComputedStyle(tools).borderRadius,
      backdropFilter: getComputedStyle(tools).backdropFilter
    } : null,
    toolCount: tools ? tools.querySelectorAll(':scope > button, :scope > .top-popover-anchor > button').length : 0
  };
})()`);

const contrastState = (cdp) => cdp.evaluate(`(() => {
  const parse = (value) => {
    const match = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const [r, g, b] = match[1].split(',').map((part) => parseFloat(part));
    return [r, g, b];
  };
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const backgroundOf = (node) => {
    let current = node;
    while (current && current !== document.documentElement) {
      const bg = getComputedStyle(current).backgroundColor;
      const parsed = parse(bg);
      if (parsed && !/rgba\\(.*,\\s*0\\)$/.test(bg)) return parsed;
      current = current.parentElement;
    }
    return [255, 255, 255];
  };
  const pairs = [
    ['dashboard-title', '.dashboard h1'],
    ['metric-label', '.metric-card .metric-title h2'],
    ['metric-value', '.metric-card .metric-value strong'],
    ['metric-detail', '.metric-card .metric-detail'],
    ['panel-title', '.panel-heading h2'],
    ['table-cell', '.logs-panel td'],
    ['role-badge', '.logs-panel .role']
  ];
  return pairs.map(([name, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return { name, selector, missing: true };
    const style = getComputedStyle(node);
    const fg = parse(style.color);
    const bg = backgroundOf(node);
    return {
      name,
      selector,
      color: style.color,
      background: 'rgb(' + bg.join(', ') + ')',
      ratio: fg ? Number(ratio(fg, bg).toFixed(2)) : null,
      fontSize: parseFloat(style.fontSize),
      fontWeight: style.fontWeight
    };
  });
})()`);

const densityState = (cdp) => cdp.evaluate(`(() => {
  const read = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const style = getComputedStyle(node);
    return {
      paddingBlock: [style.paddingTop, style.paddingBottom],
      paddingInline: [style.paddingLeft, style.paddingRight],
      height: node.getBoundingClientRect().height
    };
  };
  return {
    density: document.querySelector('.admin-shell')?.dataset?.density ?? '',
    tableRow: read('.logs-panel td'),
    tableHead: read('.logs-panel th'),
    metricCard: read('.metric-card'),
    notificationList: read('.notifications__list'),
    notificationItem: read('.notification')
  };
})()`);

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p6-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const screenshots = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  };
  const capture = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    const viewport = await cdp.evaluate('({ width: innerWidth, height: innerHeight })');
    await screenshot(cdp, { x: 0, y: 0, width: viewport.width, height: viewport.height }, file);
    screenshots.push(file);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  const openNotifications = async () => {
    await click(cdp, '[aria-label="Thông báo"]');
    await waitFor(cdp, '!!document.querySelector(".notifications__list, .notifications__state")', { timeoutMs: 5000 });
    await sleep(250);
  };
  const closeNotifications = async () => {
    const open = await cdp.evaluate('!!document.querySelector(".notifications__list, .notifications__state")');
    if (open) await click(cdp, '[aria-label="Thông báo"]');
    await sleep(150);
  };

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
      const now = new Date().toISOString();
      localStorage.setItem(
        'thinkup_admin_notifications_demo:' + ${JSON.stringify(ADMIN_ID)},
        JSON.stringify({ items: [
          { id: 'anf_demo_p6_1', type: 'security', severity: 'info', title: 'Đăng nhập quản trị', message: 'Một phiên quản trị mới vừa đăng nhập.', href: null, eventKey: 'demo-p6-1', createdAt: now, createdAtLocal: now, readAt: null },
          { id: 'anf_demo_p6_2', type: 'order', severity: 'warning', title: 'Đơn hàng cần xử lý', message: 'Có đơn hàng đang chờ xác nhận.', href: null, eventKey: 'demo-p6-2', createdAt: now, createdAtLocal: now, readAt: null }
        ] })
      );
      return true;
    })()`);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 20000 });
    await waitFor(cdp, '!!document.querySelector(".logs-panel td")', { timeoutMs: 20000 });
    await sleep(500);

    // 1. Light baseline preserves the approved light palette and layout.
    const light = await shellState(cdp);
    record('light-baseline-tokens',
      light.themeDark === false && light.density === 'standard'
      && light.tokens.canvas === '#f4f8ff' && light.tokens.surface === '#ffffff'
      && light.tokens.textStrong === '#1f2b40' && light.tokens.accent === '#266ee5',
      light.tokens);
    record('light-dashboard-canvas',
      light.dashboardBackground === 'rgb(247, 249, 252)' && light.scrollOverflow <= 0,
      { background: light.dashboardBackground, overflow: light.scrollOverflow });
    record('header-visible-with-four-tools',
      light.header?.visible === true && light.toolCount === 4 && !!light.tools,
      { header: light.header, toolCount: light.toolCount, tools: light.tools });
    const headerBaseline = light.tools;
    const headerStyleBaseline = light.toolsStyle;
    await capture('p6-light-1920');

    // 2. Dark preview applies immediately and is visually distinct.
    await openSettings(cdp);
    await choose(cdp, 'admin-theme', 'dark');
    const darkPreview = await shellState(cdp);
    record('dark-preview-applies',
      darkPreview.themeDark === true
      && darkPreview.tokens.canvas === '#0b1220'
      && darkPreview.tokens.surface === '#121c2e'
      && darkPreview.tokens.textStrong === '#eef4ff',
      darkPreview.tokens);
    await capture('p6-settings-dark-preview');

    // 3. Dark contrast meets WCAG AA for the dashboard and the settings dialog.
    const generalContrast = await measureContrast(cdp, [
      ['dialog-title', '.admin-dialog__heading h2'],
      ['dialog-subtitle', '.admin-dialog__heading p'],
      ['tab-label', '.settings-tab.is-active .settings-tab__copy strong'],
      ['switch-label', '.switch-row strong'],
      ['theme-label', '.theme-card__label']
    ]);
    await openTab(cdp, 'Tuỳ chọn hệ thống');
    const fieldContrast = await measureContrast(cdp, [
      ['field-label', '.settings-section .field-label'],
      ['field-hint', '.field-hint']
    ]);
    await openTab(cdp, 'Phím tắt thao tác');
    const keyContrast = await measureContrast(cdp, [['shortcut-key', '.app-shortcut kbd']]);
    await openTab(cdp, 'Giao diện chung');
    const settingsContrast = [...generalContrast, ...fieldContrast, ...keyContrast];
    const failingSettings = settingsContrast.filter((item) => item.missing || item.ratio === null || item.ratio < 4.5);
    record('dark-settings-contrast-aa', failingSettings.length === 0, failingSettings.length ? failingSettings : settingsContrast);

    // 4. Header stays frozen while the theme preview changes.
    const darkHeader = await shellState(cdp);
    record('header-frozen-dark-preview',
      JSON.stringify(darkHeader.tools) === JSON.stringify(headerBaseline)
      && JSON.stringify(darkHeader.toolsStyle) === JSON.stringify(headerStyleBaseline)
      && darkHeader.toolCount === 4,
      { tools: darkHeader.tools, style: darkHeader.toolsStyle });

    // 5. Save persists the theme; reload restores it.
    await saveSettings(cdp);
    const savedTheme = await cdp.evaluate(`(() => {
      const parsed = JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) || 'null');
      return { theme: parsed?.preferences?.theme, revision: parsed?.revision };
    })()`);
    record('theme-save-persists', savedTheme.theme === 'dark', savedTheme);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".logs-panel td")', { timeoutMs: 20000 });
    await sleep(500);
    const reloadedDark = await shellState(cdp);
    record('theme-survives-reload', reloadedDark.themeDark === true, { themeDark: reloadedDark.themeDark });
    await capture('p6-dark-1920');

    // 6. Dark dashboard contrast (WCAG AA normal text, AA large text for headings).
    const darkContrast = await contrastState(cdp);
    const failingDark = darkContrast.filter((item) => {
      if (item.missing || item.ratio === null) return true;
      const large = item.fontSize >= 24 || (item.fontSize >= 18.66 && Number(item.fontWeight) >= 700);
      return item.ratio < (large ? 3 : 4.5);
    });
    record('dark-dashboard-contrast-aa', failingDark.length === 0, failingDark.length ? failingDark : darkContrast);
    record('dark-dashboard-canvas', reloadedDark.dashboardBackground === 'rgb(11, 18, 32)', { background: reloadedDark.dashboardBackground });

    // 7. Dark profile dialog is tokenized (no light-on-dark text).
    await click(cdp, '[aria-label="Mở menu tài khoản Admin"]');
    await clickByText(cdp, '.account-menu-item', 'Hồ sơ cá nhân');
    await waitFor(cdp, '!!document.querySelector("dialog[open]")', { timeoutMs: 5000 });
    await sleep(300);
    const profileContrast = await cdp.evaluate(`(() => {
      const parse = (value) => {
        const match = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (!match) return null;
        return match[1].split(',').map((part) => parseFloat(part));
      };
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map((channel) => {
          const c = channel / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (fg, bg) => {
        const a = luminance(fg); const b = luminance(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const backgroundOf = (node) => {
        let current = node;
        while (current && current !== document.documentElement) {
          const bg = getComputedStyle(current).backgroundColor;
          const parsed = parse(bg);
          if (parsed && !/rgba\\(.*,\\s*0\\)$/.test(bg)) return parsed;
          current = current.parentElement;
        }
        return [255, 255, 255];
      };
      const pairs = [
        ['profile-name', '.profile-identity-copy h3'],
        ['profile-email', '.profile-identity-copy p'],
        ['profile-term', '.profile-list dt'],
        ['profile-value', '.profile-list dd'],
        ['profile-close', '.profile-close']
      ];
      return pairs.map(([name, selector]) => {
        const node = document.querySelector(selector);
        if (!node) return { name, selector, missing: true };
        const style = getComputedStyle(node);
        const fg = parse(style.color);
        const bg = backgroundOf(node);
        return {
          name,
          selector,
          color: style.color,
          background: 'rgb(' + bg.join(', ') + ')',
          borderColor: style.borderColor,
          ratio: fg ? Number(ratio(fg, bg).toFixed(2)) : null
        };
      });
    })()`);
    record('dark-profile-dialog-contrast',
      profileContrast.every((item) => !item.missing && item.ratio !== null && item.ratio >= 4.5),
      profileContrast);
    await capture('p6-profile-dark');
    await clickByText(cdp, '.profile-close', 'Đóng');

    // 8. Cancel rolls the theme preview back to the saved value.
    await openSettings(cdp);
    await choose(cdp, 'admin-theme', 'light');
    const lightPreview = await shellState(cdp);
    record('theme-preview-light', lightPreview.themeDark === false, { themeDark: lightPreview.themeDark });
    await clickByText(cdp, 'button', 'Hủy bỏ');
    await sleep(250);
    const afterCancel = await shellState(cdp);
    record('cancel-rolls-back-theme', afterCancel.themeDark === true, { themeDark: afterCancel.themeDark });

    // 9. Density: standard baseline, then compact and comfortable with real consumers.
    const standard = await densityState(cdp);
    await openSettings(cdp);
    await choose(cdp, 'admin-density', 'compact');
    await saveSettings(cdp);
    const compact = await densityState(cdp);
    await openSettings(cdp);
    await choose(cdp, 'admin-density', 'comfortable');
    await saveSettings(cdp);
    const comfortable = await densityState(cdp);
    const rowPx = (state) => state?.tableRow ? parseFloat(state.tableRow.paddingBlock[0]) : null;
    record('density-standard-baseline',
      standard.density === 'standard' && rowPx(standard) === 14,
      { density: standard.density, row: standard.tableRow });
    record('density-compact-table',
      compact.density === 'compact' && rowPx(compact) === 6 && rowPx(compact) < rowPx(standard),
      { density: compact.density, row: compact.tableRow, head: compact.tableHead });
    record('density-comfortable-table',
      comfortable.density === 'comfortable' && rowPx(comfortable) === 16 && rowPx(comfortable) > rowPx(standard),
      { density: comfortable.density, row: comfortable.tableRow });
    record('density-does-not-resize-cards',
      standard.metricCard?.height === compact.metricCard?.height
      && standard.metricCard?.height === comfortable.metricCard?.height,
      { standard: standard.metricCard?.height, compact: compact.metricCard?.height, comfortable: comfortable.metricCard?.height });
    await capture('p6-density-comfortable');

    // 10. Notification list density + notification panel contrast in dark.
    await openNotifications(cdp);
    const listComfortable = await densityState(cdp);
    await closeNotifications(cdp);
    await openSettings(cdp);
    await choose(cdp, 'admin-density', 'compact');
    await saveSettings(cdp);
    await openNotifications(cdp);
    const listCompact = await densityState(cdp);
    await closeNotifications(cdp);
    const gapOf = (state) => state?.notificationList ? parseFloat(state.notificationList.paddingBlock?.[0] ?? 'NaN') : null;
    record('density-notification-list',
      listComfortable.notificationList !== null
      && listCompact.notificationList !== null
      && gapOf(listComfortable) > gapOf(listCompact),
      {
        comfortable: listComfortable.notificationList,
        compact: listCompact.notificationList,
        itemComfortable: listComfortable.notificationItem,
        itemCompact: listCompact.notificationItem
      });

    // 11. Header is byte-for-byte identical across theme and density modes.
    const finalState = await shellState(cdp);
    record('header-frozen-all-modes',
      JSON.stringify(finalState.tools) === JSON.stringify(headerBaseline)
      && JSON.stringify(finalState.toolsStyle) === JSON.stringify(headerStyleBaseline)
      && finalState.toolCount === 4,
      { tools: finalState.tools, style: finalState.toolsStyle });

    // 12. Restore standard density and verify responsive widths with no page overflow.
    await openSettings(cdp);
    await choose(cdp, 'admin-density', 'standard');
    await choose(cdp, 'admin-theme', 'light');
    await saveSettings(cdp);
    for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1100, 800], [1024, 768]]) {
      await setViewport(cdp, width, height);
      await sleep(300);
      const layout = await shellState(cdp);
      record(`responsive-${width}x${height}`, layout.scrollOverflow <= 0, {
        innerWidth: width, overflow: layout.scrollOverflow
      });
      await capture(`p6-light-${width}x${height}`);
    }
    await setViewport(cdp, 1920, 1080);

    // 13. Confirm the demo snapshot is back to standard/light and the dialog has no pending draft.
    await openSettings(cdp);
    const restoredDraft = await cdp.evaluate(`(() => {
      const checkedTheme = document.querySelector('input[name="admin-theme"]:checked')?.value || '';
      const checkedDensity = document.querySelector('input[name="admin-density"]:checked')?.value || '';
      return {
        theme: checkedTheme,
        density: checkedDensity,
        saveDisabled: document.querySelector('button[form="admin-settings-form"]')?.disabled ?? null
      };
    })()`);
    record('restored-draft-standard-light',
      restoredDraft.theme === 'light' && restoredDraft.density === 'standard' && restoredDraft.saveDisabled === true,
      restoredDraft);
    await clickByText(cdp, 'button', 'Hủy bỏ');

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p6',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      consoleErrors,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'p6-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p6-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();