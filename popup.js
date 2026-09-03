// Pure Vanilla JS (<5KB) for LeetCode Reminder Popup
// Zero external dependencies, instant render

const I18N = {
  zh: {
    langBtn: 'EN',
    langBtnTitle: '切換為英文 / Switch to English',
    refreshTitle: '立即重新檢查',
    subtitle: '每日挑戰狀態追蹤',
    status_finish: '今日已解題完成！',
    status_pending: '今日尚未完成',
    status_not_logged_in: '未登入 LeetCode',
    status_error: '檢查連線異常',
    status_loading: '載入中...',
    title_default: '今日題目',
    title_not_logged_in: '請點擊此處登入 LeetCode 帳號',
    title_error: '無法取得題目資訊，請檢查網路或稍後重試',
    label_last_check: '上次檢查',
    label_reset_countdown: 'UTC 00:00 換日',
    tag_solved: 'Solved',
    tag_todo: 'Todo',
    tag_auth: 'Auth',
    tag_error: 'Error',
    time_remaining: (h, m) => `剩 ${h}小時${m}分`,
    contest_section_title: '周賽活動',
    badge_weekly: '周賽',
    badge_biweekly: '雙周賽',
    weekly_title_default: 'Weekly Contest',
    biweekly_title_default: 'Biweekly Contest',
    contest_reminder_text: '1h 前提醒',
    contest_calc: '計算中...',
    contest_started: '比賽進行中',
    contest_ended: '已結束，等待更新',
    contest_countdown: (days, hours, mins) => {
      if (days > 0) return `距開始：${days}天 ${hours}小時`;
      if (hours > 0) return `距開始：${hours}小時 ${mins}分`;
      return `距開始：${mins}分鐘`;
    }
  },
  en: {
    langBtn: '中',
    langBtnTitle: 'Switch to Chinese / 切換為中文',
    refreshTitle: 'Check status now',
    subtitle: 'Daily Challenge Tracker',
    status_finish: 'Completed today!',
    status_pending: 'Not completed yet',
    status_not_logged_in: 'Not logged in',
    status_error: 'Connection error',
    status_loading: 'Loading...',
    title_default: 'Daily Challenge',
    title_not_logged_in: 'Click here to log in to LeetCode',
    title_error: 'Unable to fetch challenge. Please retry',
    label_last_check: 'Last checked',
    label_reset_countdown: 'Next UTC 00:00',
    tag_solved: 'Solved',
    tag_todo: 'Todo',
    tag_auth: 'Auth',
    tag_error: 'Error',
    time_remaining: (h, m) => `${h}h ${m}m left`,
    contest_section_title: 'Contests',
    badge_weekly: 'Weekly',
    badge_biweekly: 'Biweekly',
    weekly_title_default: 'Weekly Contest',
    biweekly_title_default: 'Biweekly Contest',
    contest_reminder_text: '1h before',
    contest_calc: 'Calculating...',
    contest_started: 'In progress',
    contest_ended: 'Ended, waiting for update',
    contest_countdown: (days, hours, mins) => {
      if (days > 0) return `Starts in ${days}d ${hours}h`;
      if (hours > 0) return `Starts in ${hours}h ${mins}m`;
      return `Starts in ${mins}m`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const subtitle = document.getElementById('subtitle');
  const langBtn = document.getElementById('langBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const statusBadge = document.getElementById('statusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const difficultyTag = document.getElementById('difficultyTag');
  const problemTitle = document.getElementById('problemTitle');
  const labelLastCheck = document.getElementById('labelLastCheck');
  const lastCheckTime = document.getElementById('lastCheckTime');
  const labelResetCountdown = document.getElementById('labelResetCountdown');
  const resetCountdown = document.getElementById('resetCountdown');
  const problemBox = document.getElementById('problemBox');

  // Contest DOM elements
  const contestSectionTitle = document.getElementById('contestSectionTitle');
  const weeklyLink = document.getElementById('weeklyLink');
  const weeklyTitle = document.getElementById('weeklyTitle');
  const weeklyCountdown = document.getElementById('weeklyCountdown');
  const weeklyReminderCheckbox = document.getElementById('weeklyReminderCheckbox');
  const weeklyReminderText = document.getElementById('weeklyReminderText');

  const biweeklyLink = document.getElementById('biweeklyLink');
  const biweeklyTitle = document.getElementById('biweeklyTitle');
  const biweeklyCountdown = document.getElementById('biweeklyCountdown');
  const biweeklyReminderCheckbox = document.getElementById('biweeklyReminderCheckbox');
  const biweeklyReminderText = document.getElementById('biweeklyReminderText');

  let currentLang = 'zh';
  let cachedData = {};

  // Format countdown string for contests
  function formatContestCountdown(startTimeSec, durationSec = 5400) {
    const t = I18N[currentLang];
    if (!startTimeSec) return t.contest_calc;

    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = startTimeSec - nowSec;

    if (diffSec <= 0) {
      if (diffSec + durationSec > 0) {
        return t.contest_started;
      }
      return t.contest_ended;
    }

    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);

    return t.contest_countdown(days, hours, mins);
  }

  // Update countdowns (Daily UTC reset + Contests)
  function updateAllCountdowns() {
    const now = new Date();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcSeconds = now.getUTCSeconds();
    const elapsedSeconds = utcHours * 3600 + utcMinutes * 60 + utcSeconds;
    const remainingSeconds = 86400 - elapsedSeconds;

    const remHours = Math.floor(remainingSeconds / 3600);
    const remMinutes = Math.floor((remainingSeconds % 3600) / 60);

    const nextResetDate = new Date(now.getTime() + remainingSeconds * 1000);
    const localHour = String(nextResetDate.getHours()).padStart(2, '0');
    const localMin = String(nextResetDate.getMinutes()).padStart(2, '0');

    if (resetCountdown) {
      const t = I18N[currentLang];
      resetCountdown.textContent = `${localHour}:${localMin} (${t.time_remaining(remHours, remMinutes)})`;
    }

    // Update contest countdowns
    const weekly = cachedData?.contests?.weekly;
    const biweekly = cachedData?.contests?.biweekly;

    if (weeklyCountdown) {
      weeklyCountdown.textContent = formatContestCountdown(weekly?.startTime, weekly?.duration);
    }
    if (biweeklyCountdown) {
      biweeklyCountdown.textContent = formatContestCountdown(biweekly?.startTime, biweekly?.duration);
    }
  }

  // Apply language strings to static & dynamic UI elements
  function applyLanguage() {
    const t = I18N[currentLang];
    if (langBtn) {
      langBtn.textContent = t.langBtn;
      langBtn.title = t.langBtnTitle;
    }
    if (refreshBtn) refreshBtn.title = t.refreshTitle;
    if (subtitle) subtitle.textContent = t.subtitle;
    if (labelLastCheck) labelLastCheck.textContent = t.label_last_check;
    if (labelResetCountdown) labelResetCountdown.textContent = t.label_reset_countdown;

    // Contests section i18n
    if (contestSectionTitle) contestSectionTitle.textContent = t.contest_section_title;
    if (weeklyReminderText) weeklyReminderText.textContent = t.contest_reminder_text;
    if (biweeklyReminderText) biweeklyReminderText.textContent = t.contest_reminder_text;
  }

  // Render UI with cached data
  function renderData(data = {}) {
    cachedData = data;
    const {
      isLoggedIn,
      lastStatus,
      lastCheckTime: checkTime,
      questionId,
      questionTitle: title,
      questionDifficulty: difficulty,
      questionLink,
      contests,
      contestReminders = { weekly_1h: true, biweekly_1h: true }
    } = data;

    const t = I18N[currentLang];
    applyLanguage();

    statusBadge.className = 'status-badge';

    const formattedTitle = questionId && title
      ? `${questionId}. ${title}`
      : (title || t.title_default);

    if (isLoggedIn === false || lastStatus === 'not_logged_in') {
      const loginUrl = 'https://leetcode.com/accounts/login/';
      statusBadge.classList.add('warning');
      statusText.textContent = t.status_not_logged_in;
      difficultyTag.textContent = t.tag_auth;
      difficultyTag.className = 'difficulty-tag';
      problemTitle.textContent = t.title_not_logged_in;
      if (problemBox) problemBox.href = loginUrl;
    } else if (lastStatus === 'Finish') {
      const targetUrl = questionLink || 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('success');
      statusText.textContent = t.status_finish;
      difficultyTag.textContent = difficulty || t.tag_solved;
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = formattedTitle;
      if (problemBox) problemBox.href = targetUrl;
    } else if (lastStatus === 'error') {
      const allUrl = 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('warning');
      statusText.textContent = t.status_error;
      difficultyTag.textContent = t.tag_error;
      difficultyTag.className = 'difficulty-tag';
      problemTitle.textContent = t.title_error;
      if (problemBox) problemBox.href = allUrl;
    } else {
      // Unfinished
      const targetUrl = questionLink || 'https://leetcode.com/problemset/all/';
      statusBadge.classList.add('pending');
      statusText.textContent = t.status_pending;
      difficultyTag.textContent = difficulty || t.tag_todo;
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = formattedTitle;
      if (problemBox) problemBox.href = targetUrl;
    }

    if (lastCheckTime) {
      lastCheckTime.textContent = checkTime || '--';
    }

    // Render Weekly Contest
    const weekly = contests?.weekly;
    if (weekly) {
      if (weeklyTitle) weeklyTitle.textContent = weekly.title || t.weekly_title_default;
      if (weeklyLink) weeklyLink.href = weekly.link || 'https://leetcode.com/contest/';
    } else {
      if (weeklyTitle) weeklyTitle.textContent = t.weekly_title_default;
    }

    // Render Biweekly Contest
    const biweekly = contests?.biweekly;
    if (biweekly) {
      if (biweeklyTitle) biweeklyTitle.textContent = biweekly.title || t.biweekly_title_default;
      if (biweeklyLink) biweeklyLink.href = biweekly.link || 'https://leetcode.com/contest/';
    } else {
      if (biweeklyTitle) biweeklyTitle.textContent = t.biweekly_title_default;
    }

    // Checkbox states
    if (weeklyReminderCheckbox) {
      weeklyReminderCheckbox.checked = contestReminders.weekly_1h !== false;
    }
    if (biweeklyReminderCheckbox) {
      biweeklyReminderCheckbox.checked = contestReminders.biweekly_1h !== false;
    }

    updateAllCountdowns();
  }

  // Save checkbox setting and trigger alarm sync
  function saveContestReminderSettings() {
    const settings = {
      weekly_1h: weeklyReminderCheckbox ? weeklyReminderCheckbox.checked : true,
      biweekly_1h: biweeklyReminderCheckbox ? biweeklyReminderCheckbox.checked : true
    };
    chrome.storage.local.set({ contestReminders: settings }, () => {
      chrome.runtime.sendMessage({ action: 'update_contest_alarms' });
    });
  }

  if (weeklyReminderCheckbox) {
    weeklyReminderCheckbox.addEventListener('change', saveContestReminderSettings);
  }
  if (biweeklyReminderCheckbox) {
    biweeklyReminderCheckbox.addEventListener('change', saveContestReminderSettings);
  }

  // 1. Load language preference & cached data
  chrome.storage.local.get(null, (items) => {
    if (items && items.lang) {
      currentLang = items.lang;
    }
    renderData(items || {});

    // If no status was ever checked or recorded, trigger background check automatically
    if (!items || !items.lastStatus || !items.contests) {
      if (refreshBtn) refreshBtn.classList.add('spinning');
      chrome.runtime.sendMessage({ action: 'check_status_now' }, (response) => {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
        if (response && response.data) {
          renderData(response.data);
        }
      });
    }
  });

  // 2. Language switch click
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      currentLang = currentLang === 'zh' ? 'en' : 'zh';
      chrome.storage.local.set({ lang: currentLang });
      renderData(cachedData);
    });
  }

  // 3. Manual Refresh trigger
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
  setInterval(updateAllCountdowns, 60000);
});
