/**
 * P3 E2E: admin notifications.
 *
 * Runs against the production build served on :4312 and intercepts the real
 * backend URLs through CDP Fetch. The backend itself is covered by
 * `server/src/admin/notifications/test`, so this suite verifies the frontend
 * contract: real badge count, cursor pagination, optimistic reads, error/retry,
 * empty state, cross-tab fan-out, throttled polling, focus handling and auth headers.
 *
 * Usage: node verify-p3.mjs [--out=dir] [--port=9338]
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

const BASE = process.env.P3_BASE_PROD || process.env.P1_BASE_PROD || 'http://127.0.0.1:4312';
const ADMIN_ID = '65f123456789abcdef012345';
const TOKEN = 'p3-access-token';
const USER = {
  id: ADMIN_ID,
  email: 'admin@thinkup.edu.vn',
  fullName: 'Quản trị viên ThinkUp',
  role: 'admin',
  avatar: null,
  passwordExpiresAt: null,
  mustChangePassword: false,
  twoFactorSetupRequired: false
};
const DEFAULT_PREFERENCES = {
  breadcrumbsVisible: false,
  timezone: 'Asia/Ho_Chi_Minh',
  statusBarEnabled: false,
  theme: 'light',
  density: 'standard'
};

function parseArgs(argv) {
  const args = { out: tempDir('p3-e2e'), port: 9338 };
  for (const raw of argv) {
    if (raw.startsWith('--out=')) args.out = raw.slice(6);
    else if (raw.startsWith('--port=')) args.port = Number(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function fulfillJson(cdp, requestId, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return cdp.send('Fetch.fulfillRequest', {
    requestId,
    responseCode: status,
    responseHeaders: [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'Cache-Control', value: 'no-store' },
      { name: 'Access-Control-Allow-Origin', value: BASE },
      { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' }
    ],
    body
  });
}

async function click(cdp, selector, index = 0) {
  const clicked = await cdp.evaluate(`(() => {
    const nodes = document.querySelectorAll(${JSON.stringify(selector)});
    const node = nodes[${index}];
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Cannot click ${selector}[${index}]`);
  await sleep(200);
}

async function key(cdp, keyName, code, vk) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
  });
  await sleep(150);
}

async function clickOutside(cdp) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 8, y: 8, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 8, y: 8, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(200);
}

/** Node-side polling for fake-backend counters that the page cannot see. */
async function waitForNode(check, timeoutMs = 5000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function buildItems() {
  const types = ['security', 'order', 'ticket', 'complaint', 'payout', 'course'];
  return Array.from({ length: 25 }, (_, index) => {
    const at = new Date(Date.UTC(2026, 10, 2, 12, 0, 0) - index * 60_000).toISOString();
    return {
      id: `ntf-${String(index + 1).padStart(2, '0')}`,
      type: types[index % types.length],
      severity: index === 0 ? 'critical' : 'info',
      title: `Sự kiện quản trị ${String(index + 1).padStart(2, '0')}`,
      message: `Nội dung thông báo thật từ API cho sự kiện ${index + 1}.`,
      href: null,
      eventKey: `admin.event.${index + 1}`,
      createdAt: at,
      createdAtLocal: null,
      readAt: index < 3 ? null : at
    };
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const launch = await launchBrowser({ port: args.port, profileDir: tempDir(`p3-profile-${Date.now()}`) });
  const cdp = await connectPage(args.port);
  const results = [];
  const consoleErrors = [];
  const screenshots = [];

  // Mutable fake backend state.
  const items = buildItems();
  let mode = 'ok'; // 'ok' | 'error' | 'empty'
  const counters = { summary: 0, list: 0, read: 0, readAll: 0, preferences: 0 };
  const notificationAuth = [];
  const listQueries = [];

  const record = (name, passed, detail) => {
    results.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 320)}` : ''}`);
  };
  const capture = async (name) => {
    const viewport = await cdp.evaluate('({ width: innerWidth, height: innerHeight })');
    const file = path.join(outDir, `${name}.png`);
    await screenshot(cdp, { x: 0, y: 0, width: viewport.width, height: viewport.height }, file);
    screenshots.push(file);
  };

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.text || 'exception');
  });

  function summaryPayload() {
    if (mode === 'empty') {
      return {
        success: true,
        total: 0,
        unread: 0,
        read: 0,
        byType: Object.fromEntries(['security', 'order', 'ticket', 'complaint', 'payout', 'course'].map((type) => [type, { total: 0, unread: 0 }]))
      };
    }
    const unread = items.filter((item) => !item.readAt).length;
    const byType = Object.fromEntries(['security', 'order', 'ticket', 'complaint', 'payout', 'course'].map((type) => {
      const bucket = items.filter((item) => item.type === type);
      return [type, { total: bucket.length, unread: bucket.filter((item) => !item.readAt).length }];
    }));
    return { success: true, total: items.length, unread, read: items.length - unread, byType };
  }

  function pagePayload(url) {
    if (mode === 'empty') return { success: true, items: [], pageSize: 20, hasMore: false, nextCursor: null };
    const limit = Number(url.searchParams.get('limit') || 20);
    const cursor = url.searchParams.get('cursor');
    listQueries.push({ limit, cursor });
    const start = cursor ? Math.max(0, items.findIndex((item) => item.id === cursor) + 1) : 0;
    const page = items.slice(start, start + limit);
    const hasMore = start + limit < items.length;
    return {
      success: true,
      items: page,
      pageSize: limit,
      hasMore,
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null
    };
  }

  const badgeText = () => cdp.evaluate(`document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? ''`);
  const panelOpen = () => cdp.evaluate('!!document.querySelector(".notifications-popover")');
  const dispatchCrossTab = (reason = 'received') => cdp.evaluate(`(() => {
    const envelope = {
      type: 'notifications-changed',
      adminId: ${JSON.stringify(ADMIN_ID)},
      reason: ${JSON.stringify(reason)},
      nonce: 'other-tab-' + Date.now()
    };
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'thinkup_admin_sync',
      newValue: JSON.stringify(envelope)
    }));
    return true;
  })()`);

  try {
    await setViewport(cdp, 1920, 1080);
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*be-thinkup.vercel.app/api/admin/*', requestStage: 'Request' }]
    });
    cdp.on('Fetch.requestPaused', async (params) => {
      const requestId = params.requestId;
      const url = params.request?.url || '';
      const method = params.request?.method || 'GET';
      const headers = params.request?.headers || {};
      const authorization = headers.Authorization || headers.authorization || '';
      try {
        if (method === 'OPTIONS') {
          await cdp.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 204,
            responseHeaders: [
              { name: 'Access-Control-Allow-Origin', value: BASE },
              { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' },
              { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' },
              { name: 'Access-Control-Max-Age', value: '600' }
            ]
          });
          return;
        }

        const parsed = new URL(url);
        const pathname = parsed.pathname;

        if (pathname.includes('/api/admin/preferences')) {
          counters.preferences += 1;
          if (method === 'PUT') {
            await fulfillJson(cdp, requestId, 200, { success: true, preferences: DEFAULT_PREFERENCES, revision: 1, isDefault: false });
          } else {
            await fulfillJson(cdp, requestId, 200, { success: true, preferences: DEFAULT_PREFERENCES, revision: 0, isDefault: true });
          }
          return;
        }

        if (pathname.includes('/api/admin/auth/me')) {
          await fulfillJson(cdp, requestId, 200, { success: true, admin: { ...USER, status: 'ACTIVE', is_2fa_enabled: true } });
          return;
        }

        if (pathname.includes('/api/admin/notifications')) {
          notificationAuth.push({ method, url, authorization });
          if (mode === 'error' && !pathname.endsWith('/read') && !pathname.endsWith('/read-all')) {
            await fulfillJson(cdp, requestId, 500, { message: 'Lỗi máy chủ mô phỏng P3', code: 'NOTIFICATION_FAILED' });
            return;
          }
          if (pathname.endsWith('/summary')) {
            counters.summary += 1;
            await fulfillJson(cdp, requestId, 200, summaryPayload());
            return;
          }
          if (pathname.endsWith('/read-all')) {
            counters.readAll += 1;
            const now = new Date().toISOString();
            let changed = 0;
            for (const item of items) {
              if (!item.readAt) { item.readAt = now; changed += 1; }
            }
            await fulfillJson(cdp, requestId, 200, { success: true, changed });
            return;
          }
          const readMatch = pathname.match(/\/notifications\/([^/]+)\/read$/);
          if (readMatch) {
            counters.read += 1;
            const id = decodeURIComponent(readMatch[1]);
            const target = items.find((item) => item.id === id);
            if (!target) {
              await fulfillJson(cdp, requestId, 404, { message: 'Không tìm thấy thông báo.', code: 'NOTIFICATION_NOT_FOUND' });
              return;
            }
            target.readAt ||= new Date().toISOString();
            await fulfillJson(cdp, requestId, 200, { success: true, notification: target });
            return;
          }
          if (method === 'GET') {
            counters.list += 1;
            await fulfillJson(cdp, requestId, 200, pagePayload(parsed));
            return;
          }
        }

        await cdp.send('Fetch.continueRequest', { requestId });
      } catch (error) {
        consoleErrors.push(`Fetch handler: ${error?.message || error}`);
      }
    });

    // Seed a real (non-demo) session so the HTTP transport is used.
    await navigate(cdp, `${BASE}/login`);
    await cdp.evaluate(`(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('access_token', ${JSON.stringify(TOKEN)});
      localStorage.setItem('thinkup_admin_user', ${JSON.stringify(JSON.stringify(USER))});
      localStorage.setItem('thinkup_admin_toolbar_dock', 'right');
      localStorage.setItem('thinkup_admin_toolbar_offset', '16');
      return true;
    })()`);
    await navigate(cdp, `${BASE}/`);
    await waitFor(cdp, '!!document.querySelector(".liquid-tools")', { timeoutMs: 30000 });
    await waitFor(cdp, `document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() === '3'`, { timeoutMs: 10000 });
    await sleep(250);

    // 1. Badge comes from the real summary, not a hardcoded value.
    const initial = await cdp.evaluate(`({\n      badge: document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? '',\n      badgeBox: (() => { const node = document.querySelector('.top-tool[aria-label="Thông báo"] .badge'); if (!node) return null; const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),\n      badgeTitle: document.querySelector('.top-tool[aria-label="Thông báo"]')?.getAttribute('title') ?? ''\n    })`);
    record('badge-real-unread', initial.badge === '3' && initial.badgeBox?.width === 17 && initial.badgeTitle === 'Thông báo', initial);
    record('transport-calls-summary-and-list', counters.summary >= 1 && counters.list >= 1, { ...counters });
    record('requests-carry-bearer-token',
      notificationAuth.length > 0 && notificationAuth.every((entry) => entry.authorization === `Bearer ${TOKEN}`),
      { requests: notificationAuth.length, sample: notificationAuth[0] });

    // 2. Panel renders real list content, total and pagination control.
    await click(cdp, '.top-tool[aria-label="Thông báo"]');
    await waitFor(cdp, '!!document.querySelector(".notifications-popover")', { timeoutMs: 5000 });
    await waitFor(cdp, 'document.querySelectorAll(".notification").length === 20', { timeoutMs: 5000 });
    const panel = await cdp.evaluate(`({\n      items: document.querySelectorAll('.notification').length,\n      unreadItems: document.querySelectorAll('.notification.is-unread').length,\n      heading: document.querySelector('.notifications__heading span')?.textContent.trim() || '',\n      firstTitle: document.querySelector('.notification__title')?.textContent.trim() || '',\n      hasMore: !!document.querySelector('.notifications__more'),\n      legacy: (document.querySelector('.notifications-popover')?.innerText || '').includes('Bạn có 2 thông báo mới')\n    })`);
    record('panel-real-list',
      panel.items === 20 && panel.unreadItems === 3 && panel.heading === '3 chưa đọc'
      && panel.firstTitle === 'Sự kiện quản trị 01' && panel.hasMore === true && panel.legacy === false,
      panel);
    await capture('notifications-panel');

    // 3. Mark one read: optimistic UI + POST + badge decrement.
    await click(cdp, '.notification.is-unread');
    await waitFor(cdp, `document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() === '2'`, { timeoutMs: 5000 });
    const afterRead = await cdp.evaluate(`({\n      badge: document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? '',\n      unreadItems: document.querySelectorAll('.notification.is-unread').length,\n      heading: document.querySelector('.notifications__heading span')?.textContent.trim() || '',\n      panelOpen: !!document.querySelector('.notifications-popover')\n    })`);
    record('mark-one-read',
      afterRead.badge === '2' && afterRead.unreadItems === 2 && afterRead.heading === '2 chưa đọc'
      && afterRead.panelOpen === true && counters.read === 1, { ...afterRead, readCalls: counters.read });

    // 4. Cross-tab message forces a refresh despite the throttle window.
    const beforeCrossTab = counters.list + counters.summary;
    await dispatchCrossTab('received');
    await waitForNode(() => counters.list + counters.summary >= beforeCrossTab + 2, 5000);
    const afterCrossTab = await cdp.evaluate(`({\n      badge: document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? '',\n      items: document.querySelectorAll('.notification').length\n    })`);
    record('cross-tab-forces-refresh',
      counters.list + counters.summary >= beforeCrossTab + 2 && afterCrossTab.badge === '2' && afterCrossTab.items === 20,
      { beforeCrossTab, counters: { ...counters }, ...afterCrossTab });

    // 5. Cursor pagination appends without duplicates.
    await click(cdp, '.notifications__more');
    await waitFor(cdp, 'document.querySelectorAll(".notification").length === 25', { timeoutMs: 5000 });
    const paged = await cdp.evaluate(`(() => {\n      const nodes = Array.from(document.querySelectorAll('.notification .notification__title'));\n      const titles = nodes.map((node) => node.textContent.trim());\n      return { count: titles.length, unique: new Set(titles).size, hasMore: !!document.querySelector('.notifications__more') };\n    })()`);
    const cursorQuery = listQueries.find((entry) => entry.cursor);
    record('cursor-load-more',
      paged.count === 25 && paged.unique === 25 && paged.hasMore === false
      && !!cursorQuery && cursorQuery.limit === 20 && cursorQuery.cursor === 'ntf-20',
      { ...paged, cursorQuery, listQueries: listQueries.slice(-3) });

    // 6. Mark all read clears the badge and every unread style.
    await click(cdp, '.notifications__mark-all');
    await waitFor(cdp, `document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() === '0'`, { timeoutMs: 5000 });
    const afterAll = await cdp.evaluate(`({\n      badge: document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? '',\n      unreadItems: document.querySelectorAll('.notification.is-unread').length,\n      markAllDisabled: !!document.querySelector('.notifications__mark-all')?.disabled\n    })`);
    record('mark-all-read', afterAll.badge === '0' && afterAll.unreadItems === 0 && afterAll.markAllDisabled === true && counters.readAll === 1, afterAll);

    // 7. Error state offers retry and recovers.
    mode = 'error';
    await dispatchCrossTab('received');
    await waitFor(cdp, '!!document.querySelector(".notifications__state--error")', { timeoutMs: 5000 });
    const errorState = await cdp.evaluate(`({\n      text: document.querySelector('.notifications__state--error')?.innerText.trim() || '',\n      retry: !!document.querySelector('.notifications__retry')\n    })`);
    record('error-state-with-retry',
      /Lỗi máy chủ mô phỏng P3/.test(errorState.text) && errorState.retry === true, errorState);
    await capture('notifications-error');
    mode = 'ok';
    await click(cdp, '.notifications__retry');
    await waitFor(cdp, '!document.querySelector(".notifications__state--error") && document.querySelectorAll(".notification").length === 20', { timeoutMs: 5000 });
    const recovered = await cdp.evaluate(`({ count: document.querySelectorAll('.notification').length, error: !!document.querySelector('.notifications__state--error') })`);
    record('retry-recovers', recovered.count === 20 && recovered.error === false, recovered);

    // 8. Empty state when the API has no notifications.
    mode = 'empty';
    await dispatchCrossTab('received');
    await waitFor(cdp, '!!document.querySelector(".notifications__state") && document.querySelectorAll(".notification").length === 0', { timeoutMs: 5000 });
    const emptyState = await cdp.evaluate(`({\n      text: document.querySelector('.notifications__state')?.innerText.replace(/\\s+/g, ' ').trim() || '',\n      badge: document.querySelector('.top-tool[aria-label="Thông báo"] .badge')?.textContent.trim() ?? ''\n    })`);
    record('empty-state',
      /Chưa có thông báo/.test(emptyState.text) && emptyState.badge === '0', emptyState);
    await capture('notifications-empty');

    // 9. Focus events inside the throttle window do not cause a request storm.
    const beforeFocus = counters.list + counters.summary;
    await cdp.evaluate('window.dispatchEvent(new Event("focus")); true');
    await cdp.evaluate('window.dispatchEvent(new Event("focus")); true');
    await sleep(600);
    record('polling-throttled', counters.list + counters.summary === beforeFocus,
      { beforeFocus, after: counters.list + counters.summary });

    // 10. Escape and outside click close the popover and return focus to the bell.
    await key(cdp, 'Escape', 'Escape', 27);
    await waitFor(cdp, '!document.querySelector(".notifications-popover")', { timeoutMs: 3000 });
    const escapeState = await cdp.evaluate(`({\n      open: !!document.querySelector('.notifications-popover'),\n      focusBell: document.activeElement?.getAttribute('aria-label') === 'Thông báo'\n    })`);
    record('escape-closes-and-restores-focus', escapeState.open === false && escapeState.focusBell === true, escapeState);

    await click(cdp, '.top-tool[aria-label="Thông báo"]');
    await waitFor(cdp, '!!document.querySelector(".notifications-popover")', { timeoutMs: 3000 });
    await clickOutside(cdp);
    const outsideState = await cdp.evaluate('({ open: !!document.querySelector(".notifications-popover") })');
    record('outside-click-closes', outsideState.open === false, outsideState);

    record('no-console-errors', consoleErrors.length === 0, consoleErrors);
  } finally {
    const report = {
      tool: 'verify-p3',
      url: BASE,
      startedAt: new Date().toISOString(),
      passed: results.every((item) => item.passed),
      results,
      counters,
      listQueries,
      consoleErrors,
      screenshots
    };
    fs.writeFileSync(path.join(outDir, 'p3-report.json'), JSON.stringify(report, null, 2));
    console.log(`RESULT ${report.passed ? 'PASS' : 'FAIL'} checks=${results.length}`);
    console.log(`REPORT ${path.join(outDir, 'p3-report.json')}`);
    await stopBrowser(launch);
    if (!report.passed) process.exitCode = 1;
  }
}

await run();
