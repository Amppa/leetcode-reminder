// Pure Vanilla JS (<4KB) for LeetCode Reminder Popup
// Zero external dependencies, instant render

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
  const weeklyLink = document.getElementById('weeklyLink');
  const weeklyTitle = document.getElementById('weeklyTitle');
  const weeklyCountdown = document.getElementById('weeklyCountdown');
  const weeklyReminderCheckbox = document.getElementById('weeklyReminderCheckbox');
  const weeklyReminderText = document.getElementById('weeklyReminderText');
  const weeklyReminder3mCheckbox = document.getElementById('weeklyReminder3mCheckbox');
  const weeklyReminder3mText = document.getElementById('weeklyReminder3mText');

  const biweeklyLink = document.getElementById('biweeklyLink');
  const biweeklyTitle = document.getElementById('biweeklyTitle');
  const biweeklyCountdown = document.getElementById('biweeklyCountdown');
  const biweeklyReminderCheckbox = document.getElementById('biweeklyReminderCheckbox');
  const biweeklyReminderText = document.getElementById('biweeklyReminderText');
  const biweeklyReminder3mCheckbox = document.getElementById('biweeklyReminder3mCheckbox');
  const biweeklyReminder3mText = document.getElementById('biweeklyReminder3mText');

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
    const reminder1h = t.contest_reminder_1h || t.contest_reminder_text;
    const reminder3m = t.contest_reminder_3m || '3min before';
    if (weeklyReminderText) weeklyReminderText.textContent = reminder1h;
    if (weeklyReminder3mText) weeklyReminder3mText.textContent = reminder3m;
    if (biweeklyReminderText) biweeklyReminderText.textContent = reminder1h;
    if (biweeklyReminder3mText) biweeklyReminder3mText.textContent = reminder3m;
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
      contestReminders = { weekly_1h: true, biweekly_1h: true, weekly_3m: true, biweekly_3m: true }
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
    if (weeklyReminder3mCheckbox) {
      weeklyReminder3mCheckbox.checked = contestReminders.weekly_3m !== false;
    }
    if (biweeklyReminderCheckbox) {
      biweeklyReminderCheckbox.checked = contestReminders.biweekly_1h !== false;
    }
    if (biweeklyReminder3mCheckbox) {
      biweeklyReminder3mCheckbox.checked = contestReminders.biweekly_3m !== false;
    }

    updateAllCountdowns();
  }

  // Save checkbox setting and trigger alarm sync
  function saveContestReminderSettings() {
    const settings = {
      weekly_1h: weeklyReminderCheckbox ? weeklyReminderCheckbox.checked : true,
      weekly_3m: weeklyReminder3mCheckbox ? weeklyReminder3mCheckbox.checked : true,
      biweekly_1h: biweeklyReminderCheckbox ? biweeklyReminderCheckbox.checked : true,
      biweekly_3m: biweeklyReminder3mCheckbox ? biweeklyReminder3mCheckbox.checked : true
    };
    chrome.storage.local.set({ contestReminders: settings }, () => {
      chrome.runtime.sendMessage({ action: 'update_contest_alarms' });
    });
  }

  if (weeklyReminderCheckbox) {
    weeklyReminderCheckbox.addEventListener('change', saveContestReminderSettings);
  }
  if (weeklyReminder3mCheckbox) {
    weeklyReminder3mCheckbox.addEventListener('change', saveContestReminderSettings);
  }
  if (biweeklyReminderCheckbox) {
    biweeklyReminderCheckbox.addEventListener('change', saveContestReminderSettings);
  }
  if (biweeklyReminder3mCheckbox) {
    biweeklyReminder3mCheckbox.addEventListener('change', saveContestReminderSettings);
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
