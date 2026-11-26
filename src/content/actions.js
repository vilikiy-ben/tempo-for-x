const PATH = {
  block:
    'M12 3.75c-4.55 0-8.25 3.69-8.25 8.25 0 1.92.66 3.68 1.75 5.08L17.09 5.5C15.68 4.4 13.92 3.75 12 ' +
    '3.75zm6.5 3.17L6.92 18.5c1.4 1.1 3.16 1.75 5.08 1.75 4.56 0 8.25-3.69 8.25-8.25 0-1.92-.65-3.68-1.75-5.08zM1.75 ' +
    '12C1.75 6.34 6.34 1.75 12 1.75S22.25 6.34 22.25 12 17.66 22.25 12 22.25 1.75 17.66 1.75 12z',
  notInterested:
    'M9.5 7c.828 0 1.5 1.119 1.5 2.5S10.328 12 9.5 12 8 10.881 8 9.5 8.672 7 9.5 7zm5 0c.828 0 1.5 1.119 1.5 ' +
    '2.5s-.672 2.5-1.5 2.5S13 10.881 13 9.5 13.672 7 14.5 7zM12 22.25C6.348 22.25 1.75 17.652 1.75 12S6.348 1.75 12 ' +
    '1.75 22.25 6.348 22.25 12 17.652 22.25 12 22.25zm0-18.5c-4.549 0-8.25 3.701-8.25 8.25s3.701 8.25 8.25 8.25 ' +
    '8.25-3.701 8.25-8.25S16.549 3.75 12 3.75zM8.947 17.322l-1.896-.638C7.101 16.534 8.322 13 12 13s4.898 3.533 ' +
    '4.949 3.684l-1.897.633c-.031-.09-.828-2.316-3.051-2.316s-3.021 2.227-3.053 2.322z',
};

export const ACTIONS = [
  {
    id: 'notInterested',
    title: 'quick.notInterested',
    done: 'quick.notInterested.done',
    color: '#5B5BFF',
    path: PATH.notInterested,
    testids: [],
    labels: [
      /не\s*интересу/i,
      /неинтересн/i,
      /не\s*интересн/i,
      /\bnot\s+interested\b/i,
    ],
    confirm: false,
  },
  {
    id: 'block',
    title: 'quick.block',
    armed: 'quick.block.armed',
    done: 'quick.block.done',
    color: '#E11D1D',
    path: PATH.block,
    testids: ['block'],
    labels: [/заблокировать/i, /\bblock\b/i],
    confirm: true,
  },
];

const SEL = {
  caret: '[data-testid="caret"]',
  menu: '[data-testid="Dropdown"], [role="menu"]',
  item: '[role="menuitem"]',
  confirm: '[data-testid="confirmationSheetConfirm"]',
};

const MENU_TIMEOUT_MS = 1500;
const CONFIRM_TIMEOUT_MS = 2000;

export const OUTCOME = {
  done: 'done',
  handOver: 'hand-over',
  noMenu: 'no-menu',
  busy: 'busy',
};

function waitFor(probe, timeout) {
  const found = probe();
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    let timer = null;
    const observer = new MutationObserver(() => {
      const value = probe();
      if (!value) return;
      stop();
      resolve(value);
    });
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
    };
    timer = setTimeout(() => {
      stop();
      resolve(null);
    }, timeout);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function waitGone(node, timeout) {
  return waitFor(() => (node.isConnected ? null : true), timeout).then(Boolean);
}

async function dismiss(menu) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return waitGone(menu, 400);
}

function resolveItem(menu, action) {
  for (const id of action.testids) {
    const node = menu.querySelector(`[data-testid="${id}"]`);
    if (node) return node.closest(SEL.item) || node;
  }

  const byIcon = menu.querySelector(`path[d="${action.path}"]`);
  if (byIcon) {
    const item = byIcon.closest(SEL.item);
    if (item) return item;
  }

  for (const item of menu.querySelectorAll(SEL.item)) {
    const text = item.textContent || '';
    if (action.labels.some((pattern) => pattern.test(text))) return item;
  }

  return null;
}

let running = false;

export async function perform(article, action) {
  if (running) return OUTCOME.busy;
  running = true;
  try {
    const caret = article.querySelector(SEL.caret) || article.querySelector('button[aria-haspopup]');
    if (!caret) return OUTCOME.noMenu;

    const stale = document.querySelector(SEL.menu);
    if (stale) await dismiss(stale);

    caret.click();
    const menu = await waitFor(() => {
      const found = document.querySelector(SEL.menu);
      return found && found !== stale ? found : null;
    }, MENU_TIMEOUT_MS);
    if (!menu) return OUTCOME.noMenu;

    const item = resolveItem(menu, action);
    if (!item) return OUTCOME.handOver;

    item.click();

    if (action.confirm) {
      const button = await waitFor(() => document.querySelector(SEL.confirm), CONFIRM_TIMEOUT_MS);
      if (!button) return document.querySelector(SEL.menu) ? OUTCOME.handOver : OUTCOME.done;
      button.click();
      return OUTCOME.done;
    }

    return (await waitGone(menu, 1000)) ? OUTCOME.done : OUTCOME.handOver;
  } finally {
    running = false;
  }
}
