// Pure Vanilla JS (<3KB) for LeetCode Reminder Popup
// Zero dependencies, instant render

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const problemId = document.getElementById('problemId');
  const difficultyTag = document.getElementById('difficultyTag');
  const problemTitle = document.getElementById('problemTitle');
  const lastCheckTime = document.getElementById('lastCheckTime');
  const resetCountdown = document.getElementById('resetCountdown');
  const openProblemBtn = document.getElementById('openProblemBtn');
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

    if (isLoggedIn === false || lastStatus === 'not_logged_in') {
      statusBadge.classList.add('warning');
      statusText.textContent = '未登入 LeetCode';
      problemId.textContent = '--';
      difficultyTag.textContent = 'Auth';
      difficultyTag.className = 'difficulty-tag';
      problemTitle.textContent = '請點擊下方按鈕登入 LeetCode 帳號';
      openProblemBtn.textContent = '前往 LeetCode 登入';
      openProblemBtn.href = 'https://leetcode.com/accounts/login/';
    } else if (lastStatus === 'Finish') {
      statusBadge.classList.add('success');
      statusText.textContent = '今日已解題完成！';
      problemId.textContent = questionId ? `#${questionId}` : 'Daily';
      difficultyTag.textContent = difficulty || 'Solved';
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = title || '今日題目已搞定';
      openProblemBtn.textContent = '查看題目討論 / 詳情';
      openProblemBtn.href = questionLink || 'https://leetcode.com/problemset/all/';
    } else if (lastStatus === 'error') {
      statusBadge.classList.add('warning');
      statusText.textContent = '檢查連線異常';
      problemTitle.textContent = '無法取得題目資訊，請檢查網路或稍後重試';
      openProblemBtn.textContent = '前往 LeetCode 題庫';
      openProblemBtn.href = 'https://leetcode.com/problemset/all/';
    } else {
      // Unfinished
      statusBadge.classList.add('pending');
      statusText.textContent = '今日尚未完成';
      problemId.textContent = questionId ? `#${questionId}` : 'Daily';
      difficultyTag.textContent = difficulty || 'Normal';
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = title || '尚未解題';
      openProblemBtn.textContent = '立即挑戰今日難題';
      openProblemBtn.href = questionLink || 'https://leetcode.com/problemset/all/';
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
