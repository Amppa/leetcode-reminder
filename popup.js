// Pure Vanilla JS (<3KB) for LeetCode Reminder Popup
// Zero dependencies, instant render

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const difficultyTag = document.getElementById('difficultyTag');
  const problemTitle = document.getElementById('problemTitle');
  const lastCheckTime = document.getElementById('lastCheckTime');
  const resetCountdown = document.getElementById('resetCountdown');
  const problemBox = document.getElementById('problemBox');
  const refreshBtn = document.getElementById('refreshBtn');

  // Calculate remaining time until next UTC 00:00 and format local reset hour
  function updateResetTime() {
    const now = new Date();

    // Get elapsed seconds in current UTC day
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcSeconds = now.getUTCSeconds();
    const elapsedSeconds = utcHours * 3600 + utcMinutes * 60 + utcSeconds;
    const remainingSeconds = 86400 - elapsedSeconds;

    const remHours = Math.floor(remainingSeconds / 3600);
    const remMinutes = Math.floor((remainingSeconds % 3600) / 60);

    // Compute next UTC 00:00 Date to show local equivalent time
    const nextResetDate = new Date(now.getTime() + remainingSeconds * 1000);
    const localHour = String(nextResetDate.getHours()).padStart(2, '0');
    const localMin = String(nextResetDate.getMinutes()).padStart(2, '0');

    if (resetCountdown) {
      resetCountdown.textContent = `${localHour}:${localMin} (剩 ${remHours}小時${remMinutes}分)`;
    }
  }

  // Render UI with cached data
  function renderData(data = {}) {
    const {
      isLoggedIn,
      lastStatus,
      lastCheckTime: checkTime,
      questionId,
      questionTitle: title,
      questionDifficulty: difficulty,
      questionLink
    } = data;

    // Reset classes
    statusBadge.className = 'status-badge';

    const formattedTitle = questionId && title
      ? `${questionId}. ${title}`
      : (title || '今日題目');

    if (isLoggedIn === false || lastStatus === 'not_logged_in') {
      const loginUrl = 'https://leetcode.com/accounts/login/';
      statusBadge.classList.add('warning');
      statusText.textContent = '未登入 LeetCode';
      difficultyTag.textContent = 'Auth';
      difficultyTag.className = 'difficulty-tag';
      problemTitle.textContent = '請點擊此處登入 LeetCode 帳號';
      if (problemBox) problemBox.href = loginUrl;
    } else if (lastStatus === 'Finish') {
      const targetUrl = questionLink || 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('success');
      statusText.textContent = '今日已解題完成！';
      difficultyTag.textContent = difficulty || 'Solved';
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = formattedTitle;
      if (problemBox) problemBox.href = targetUrl;
    } else if (lastStatus === 'error') {
      const allUrl = 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('warning');
      statusText.textContent = '檢查連線異常';
      difficultyTag.textContent = 'Error';
      difficultyTag.className = 'difficulty-tag';
      problemTitle.textContent = '無法取得題目資訊，請檢查網路或稍後重試';
      if (problemBox) problemBox.href = allUrl;
    } else {
      // Unfinished
      const targetUrl = questionLink || 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('pending');
      statusText.textContent = '今日尚未完成';
      difficultyTag.textContent = difficulty || 'Normal';
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = formattedTitle;
      if (problemBox) problemBox.href = targetUrl;
    }

    if (lastCheckTime) {
      lastCheckTime.textContent = checkTime || '--';
    }

    updateResetTime();
  }

  // 1. Read immediate cached data from storage for instant display
  chrome.storage.local.get(null, (data) => {
    renderData(data);
  });

  // 2. Manual Refresh trigger
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      chrome.runtime.sendMessage({ action: 'check_status_now' }, (response) => {
        refreshBtn.classList.remove('spinning');
        if (response && response.data) {
          renderData(response.data);
        }
      });
    });
  }

  // Update countdown every minute if popup is open
  setInterval(updateResetTime, 60000);
});
