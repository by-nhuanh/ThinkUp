/**
 * Shared capture helpers for P0 header regression.
 * Re-exports the CDP client and adds isolation + state capture.
 */
export * from './cdp.mjs';

import { screenshot } from './cdp.mjs';

/**
 * Hide page content while keeping layout, scrollbar and the real fixed positioning.
 * `visibility:hidden` preserves layout; it does not alter the pill's dock offsets,
 * viewport size or the backdrop-filter sampling of the page background.
 */
export async function applyIsolation(cdp, isolation) {
  const selectors = JSON.stringify(isolation.hideSelectors || []);
  const background = JSON.stringify(isolation.background || '#ffffff');
  await cdp.evaluate(`(() => {
    const old = document.getElementById('p0-isolation');
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = 'p0-isolation';
    style.textContent = \`
      ${(isolation.hideSelectors || []).map((selector) => `${selector} { visibility: hidden !important; }`).join('\n')}
      html, body, .admin-shell, .page-shell { background: ${isolation.background || '#ffffff'} !important; }
      header.top-utility-bar { visibility: visible !important; }
      * { animation: none !important; transition: none !important; caret-color: transparent !important; }
    \`;
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return { selectors: ${selectors}, background: ${background} };
  })()`);
}

/**
 * Real-page mode: keep the actual page content behind the pill (real backdrop),
 * disable only animations/transitions for deterministic screenshots.
 */
export async function applyRealPageMode(cdp) {
  await cdp.evaluate(`(() => {
    const oldIsolation = document.getElementById('p0-isolation');
    if (oldIsolation) oldIsolation.remove();
    const old = document.getElementById('p0-motion');
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = 'p0-motion';
    style.textContent = '* { animation: none !important; transition: none !important; caret-color: transparent !important; }';
    document.head.appendChild(style);
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return true;
  })()`);
}

function styleMap(cdp, contract) {
  return cdp.evaluate(`(() => {
    const targets = ${JSON.stringify(contract.styleTargets)};
    const result = {};
    for (const target of targets) {
      const nodes = Array.from(document.querySelectorAll(target.selector));
      const pick = (node) => {
        if (!node) return null;
        const computed = getComputedStyle(node);
        const values = {};
        for (const property of target.properties) values[property] = computed[property];
        return values;
      };
      result[target.selector] = target.all ? nodes.map(pick) : pick(nodes[0]);
    }
    return result;
  })()`);
}

function assertionResults(cdp, contract) {
  return cdp.evaluate(`(() => {
    const assertions = ${JSON.stringify(contract.assertions)};
    return assertions.map((assertion) => {
      const node = document.querySelector(assertion.selector);
      const actual = node ? getComputedStyle(node)[assertion.property] : null;
      return { ...assertion, actual, pass: actual === assertion.equals };
    });
  })()`);
}

function domSnapshot(cdp, contract) {
  return cdp.evaluate(`(() => {
    const tools = document.querySelector('.liquid-tools');
    const header = document.querySelector('header.top-utility-bar');
    const read = (node) => node ? ({
      tag: node.tagName,
      className: node.getAttribute('class'),
      ariaLabel: node.getAttribute('aria-label'),
      ariaExpanded: node.getAttribute('aria-expanded'),
      title: node.getAttribute('title')
    }) : null;
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      header: read(header),
      headerClass: header ? header.getAttribute('class') : null,
      children: tools ? Array.from(tools.children).map(read) : [],
      triggers: tools ? Array.from(tools.querySelectorAll('button')).map(read) : [],
      rects: {
        header: rect('header.top-utility-bar'),
        tools: rect('.liquid-tools'),
        dragHandle: rect('.utility-drag-handle'),
        gear: rect('.top-tool[aria-label="Cài đặt"]'),
        bell: rect('.top-tool[aria-label="Thông báo"]'),
        account: rect('.top-tool.account-tool'),
        badge: rect('.badge'),
        avatar: rect('.avatar')
      }
    };
  })()`);
}

export async function captureState(cdp, contract, { key, dock, viewport, imagePath, render = 'isolated' }) {
  const geometry = await cdp.evaluate(`(() => {
    const tools = document.querySelector('.liquid-tools');
    const badge = document.querySelector('.badge');
    const header = document.querySelector('header.top-utility-bar');
    const toObj = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      tools: toObj(tools),
      badge: toObj(badge),
      header: toObj(header),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    };
  })()`);

  if (!geometry.tools) throw new Error(`No .liquid-tools at ${key}`);

  const margin = contract.captureMargin || 24;
  const clip = {
    x: Math.max(0, Math.floor(geometry.tools.x - margin)),
    y: Math.max(0, Math.floor(geometry.tools.y - margin)),
    width: Math.min(geometry.innerWidth, Math.ceil(geometry.tools.width + margin * 2)),
    height: Math.min(geometry.innerHeight, Math.ceil(geometry.tools.height + margin * 2))
  };

  const styles = await styleMap(cdp, contract);
  const dom = await domSnapshot(cdp, contract);
  const assertions = await assertionResults(cdp, contract);

  const masks = [];
  for (const mask of contract.masks || []) {
    const nodeBox = await cdp.evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(mask.selector)});
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
    if (!nodeBox) continue;
    const inset = Number(mask.inset || 0);
    masks.push({
      selector: mask.selector,
      inset,
      rect: {
        x: nodeBox.x + inset,
        y: nodeBox.y + inset,
        width: Math.max(1, nodeBox.width - inset * 2),
        height: Math.max(1, nodeBox.height - inset * 2)
      }
    });
  }

  await screenshot(cdp, clip, imagePath);

  const state = {
    key,
    dock,
    viewport,
    url: contract.app.baseUrl + contract.app.route,
    isolated: render === 'isolated',
    render,
    viewportActual: {
      innerWidth: geometry.innerWidth,
      innerHeight: geometry.innerHeight,
      devicePixelRatio: geometry.devicePixelRatio
    },
    styles,
    dom,
    assertions
  };

  const meta = {
    key,
    dock,
    viewport,
    render,
    clip,
    masks,
    headerRect: geometry.header,
    toolsRect: geometry.tools,
    badgeRect: geometry.badge,
    innerWidth: geometry.innerWidth,
    innerHeight: geometry.innerHeight,
    devicePixelRatio: geometry.devicePixelRatio,
    isolation: contract.isolation
  };

  return { state, meta, imagePath };
}
