const coinCount = document.getElementById('coin-count');
const shopButton = document.getElementById('shop-button');
const tasksPill = document.getElementById('tasks-pill');
const coinsPill = document.getElementById('coins-pill');
const tasksRemaining = document.getElementById('tasks-remaining');
const gateMessage = document.getElementById('gate-message');

// Renders coin balance text in the blocked-page badge.
function renderCoinBalance(balance) {
  if (!coinCount) return;
  const amount = Number(balance ?? 0);
  coinCount.textContent = Number.isFinite(amount) ? amount.toLocaleString() : '0';
}

// Switches the block screen between Focus Gate and Manual messaging.
function renderMode(aiModeEnabled, assignments) {
  const tasks = Array.isArray(assignments) ? assignments : [];
  const remaining = tasks.filter(t => !t.done).length;

  if (aiModeEnabled) {
    tasksPill.classList.remove('hidden');
    coinsPill.classList.add('hidden');
    shopButton.classList.add('hidden');
    tasksRemaining.textContent = String(remaining);
    gateMessage.textContent = remaining > 0
      ? 'Finish a task to unlock all your apps for 10 minutes.'
      : 'Add a task, then finish it to earn unlock time.';
  } else {
    tasksPill.classList.add('hidden');
    coinsPill.classList.remove('hidden');
    shopButton.classList.remove('hidden');
    gateMessage.textContent = 'Spend your coins to unlock this site, or get back to work.';
  }
}

// Refreshes coins + mode from runtime state, with a storage fallback.
async function refresh() {
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  } catch {}

  if (state && typeof state.coinBalance !== 'undefined') {
    renderCoinBalance(state.coinBalance);
    renderMode(state.aiModeEnabled ?? true, state.assignments);
    return;
  }

  const store = await chrome.storage.local.get(['coinBalance', 'aiModeEnabled', 'assignments']);
  renderCoinBalance(store.coinBalance);
  renderMode(store.aiModeEnabled ?? true, store.assignments);
}

refresh();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.coinBalance || changes.aiModeEnabled || changes.assignments) refresh();
});

window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

if (shopButton) {
  shopButton.setAttribute('href', chrome.runtime.getURL('src/dashboard/dashboard.html?page=shop'));
}
