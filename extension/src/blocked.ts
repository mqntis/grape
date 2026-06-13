const coinCount = document.getElementById('coin-count');
const shopButton = document.getElementById('shop-button');

chrome.storage.local.get(['coinBalance']).then(store => {
  if (coinCount) {
    coinCount.textContent = String(store.coinBalance ?? 0);
  }
});

if (shopButton) {
  shopButton.setAttribute('href', chrome.runtime.getURL('src/dashboard/dashboard.html?page=shop'));
}
