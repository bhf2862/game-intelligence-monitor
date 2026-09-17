const NAV_STACK_KEY = 'game-intel-nav-stack-v2';
let navCurrent = location.hash || '#dashboard';
let suppressNextHashChange = false;

function readStack() {
  try {
    const value = JSON.parse(sessionStorage.getItem(NAV_STACK_KEY) || '[]');
    return Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.startsWith('#')) : [];
  } catch {
    return [];
  }
}

function writeStack(stack) {
  sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-60)));
}

function fallbackFor(hash) {
  return hash.startsWith('#game/') ? '#games' : '#dashboard';
}

function goBackInApp() {
  const stack = readStack();
  let target = null;
  while (stack.length) {
    const candidate = stack.pop();
    if (candidate && candidate !== navCurrent) {
      target = candidate;
      break;
    }
  }
  writeStack(stack);
  target ||= fallbackFor(navCurrent);
  if (target === navCurrent) return;
  suppressNextHashChange = true;
  location.hash = target.slice(1);
}

function wireBackButton() {
  const button = document.querySelector('.nav-back-btn');
  if (!button || button.dataset.historyWired === '1') return;
  button.dataset.historyWired = '1';
  button.onclick = goBackInApp;
  button.setAttribute('aria-label', '返回上一頁 / Back to previous page');
}

window.addEventListener('hashchange', () => {
  const next = location.hash || '#dashboard';
  if (suppressNextHashChange) {
    suppressNextHashChange = false;
    navCurrent = next;
    setTimeout(wireBackButton, 80);
    return;
  }
  if (next !== navCurrent) {
    const stack = readStack();
    if (stack.at(-1) !== navCurrent) stack.push(navCurrent);
    writeStack(stack);
    navCurrent = next;
  }
  setTimeout(wireBackButton, 80);
});

const navObserver = new MutationObserver(() => setTimeout(wireBackButton, 20));
navObserver.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(wireBackButton, 250);
