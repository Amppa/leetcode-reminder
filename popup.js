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

  // Contest UI DOM mapping
  const contestUI = {
    weekly: {
      link: document.getElementById('weeklyLink'),
      title: document.getElementById('weeklyTitle'),
      countdown: document.getElementById('weeklyCountdown'),
      reminders: {
        '1h': { input: document.getElementById('weeklyReminderCheckbox'), text: document.getElementById('weeklyReminderText') },
        '3m': { input: document.getElementById('weeklyReminder3mCheckbox'), text: document.getElementById('weeklyReminder3mText') }
      }
    },
    biweekly: {
      link: document.getElementById('biweeklyLink'),
      title: document.getElementById('biweeklyTitle'),
      countdown: document.getElementById('biweeklyCountdown'),
      reminders: {
        '1h': { input: document.getElementById('biweeklyReminderCheckbox'), text: document.getElementById('biweeklyReminderText') },
        '3m': { input: document.getElementById('biweeklyReminder3mCheckbox'), text: document.getElementById('biweeklyReminder3mText') }
      }
    }
  };

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
    for (const type of ['weekly', 'biweekly']) {
      const contest = cachedData?.contests?.[type];
      const el = contestUI[type].countdown;
      if (el) el.textContent = formatContestCountdown(contest?.startTime, contest?.duration);
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
    for (const type of ['weekly', 'biweekly']) {
      contestUI[type].reminders['1h'].text.textContent = t.contest_reminder_1h;
      contestUI[type].reminders['3m'].text.textContent = t.contest_reminder_3m;
    }
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
      difficultyTag.textContent = difficulty || t.tag_error;
      difficultyTag.className = `difficulty-tag ${difficulty || ''}`;
      problemTitle.textContent = title ? formattedTitle : t.title_error;
      if (problemBox) problemBox.href = questionLink || allUrl;
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

    // Render Weekly & Biweekly Contests
    for (const type of ['weekly', 'biweekly']) {
      const contest = contests?.[type];
      const ui = contestUI[type];
      const defaultTitle = t[`${type}_title_default`];
      if (ui.title) ui.title.textContent = contest?.title || defaultTitle;
      if (ui.link) ui.link.href = contest?.link || 'https://leetcode.com/contest/';

      for (const offset of ['1h', '3m']) {
        const checkbox = ui.reminders[offset].input;
        if (checkbox) {
          checkbox.checked = contestReminders[`${type}_${offset}`] !== false;
        }
      }
    }

    updateAllCountdowns();
  }

  // Save checkbox setting and trigger alarm sync
  function saveContestReminderSettings() {
    const settings = {};
    for (const type of ['weekly', 'biweekly']) {
      for (const offset of ['1h', '3m']) {
        const checkbox = contestUI[type].reminders[offset].input;
        settings[`${type}_${offset}`] = checkbox ? checkbox.checked : true;
      }
    }
    chrome.storage.local.set({ contestReminders: settings }, () => {
      chrome.runtime.sendMessage({ action: 'update_contest_alarms' });
    });
  }

  // Bind change listeners to all reminder checkboxes
  for (const type of ['weekly', 'biweekly']) {
    for (const offset of ['1h', '3m']) {
      const checkbox = contestUI[type].reminders[offset].input;
      if (checkbox) checkbox.addEventListener('change', saveContestReminderSettings);
    }
  }

  // Helper: Check if daily challenge is completed for current UTC day
  function isChallengeFinishedToday(data) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    return data?.lastStatus === 'Finish' && data?.lastCompletedUtcDate === todayUtc;
  }

  // 1. Load language preference & cached data
  chrome.storage.local.get(null, (items) => {
    if (items && items.lang) {
      currentLang = items.lang;
    }
    renderData(items || {});

    // Auto-check on popup open if not finished today (SWR pattern)
    if (!isChallengeFinishedToday(items)) {
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
