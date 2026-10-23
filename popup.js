// Pure Vanilla JS for LeetCode Reminder Popup
// Zero external dependencies, declarative status rendering

document.addEventListener('DOMContentLoaded', () => {
  const subtitle = document.getElementById('subtitle');
  const langBtn = document.getElementById('langBtn');
  const themeBtn = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');
  const refreshBtn = document.getElementById('refreshBtn');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const difficultyTag = document.getElementById('difficultyTag');
  const problemTitle = document.getElementById('problemTitle');
  const labelLastCheck = document.getElementById('labelLastCheck');
  const lastCheckTime = document.getElementById('lastCheckTime');
  const labelResetCountdown = document.getElementById('labelResetCountdown');
  const resetCountdown = document.getElementById('resetCountdown');
  const problemBox = document.getElementById('problemBox');
  const debugBtn = document.getElementById('debugBtn');
  const debugSection = document.getElementById('debugSection');
  const debugTitle = document.getElementById('debugTitle');
  const debugCount = document.getElementById('debugCount');
  const copyDebugBtn = document.getElementById('copyDebugBtn');
  const clearDebugBtn = document.getElementById('clearDebugBtn');

  let isDebugMode = false;

  const contestUI = {
    weekly: {
      link: document.getElementById('weeklyLink'),
      title: document.getElementById('weeklyTitle'),
      countdown: document.getElementById('weeklyCountdown'),
      reminders: {
        '1h': { input: document.getElementById('weeklyReminder1hCheckbox'), text: document.getElementById('weeklyReminder1hText') },
        '3m': { input: document.getElementById('weeklyReminder3mCheckbox'), text: document.getElementById('weeklyReminder3mText') }
      }
    },
    biweekly: {
      link: document.getElementById('biweeklyLink'),
      title: document.getElementById('biweeklyTitle'),
      countdown: document.getElementById('biweeklyCountdown'),
      reminders: {
        '1h': { input: document.getElementById('biweeklyReminder1hCheckbox'), text: document.getElementById('biweeklyReminder1hText') },
        '3m': { input: document.getElementById('biweeklyReminder3mCheckbox'), text: document.getElementById('biweeklyReminder3mText') }
      }
    }
  };

  let currentLang = 'zh';
  let currentTheme = 'dark';
  let cachedData = {};
  let isRefreshing = false;

  // Declarative UI state lookup table
  const STATUS_MAP = {
    not_logged_in: {
      badgeClass: 'warning',
      statusKey: 'status_not_logged_in',
      tagKey: 'tag_auth',
      useCustomTagClass: false,
      titleKey: 'title_not_logged_in',
      url: 'https://leetcode.com/accounts/login/'
    },
    Finish: {
      badgeClass: 'success',
      statusKey: 'status_finish',
      tagKey: 'tag_solved',
      useCustomTagClass: true,
      titleKey: null,
      url: null
    },
    error: {
      badgeClass: 'warning',
      statusKey: 'status_error',
      tagKey: 'tag_error',
      useCustomTagClass: true,
      titleKey: 'title_error',
      url: null
    },
    pending: {
      badgeClass: 'pending',
      statusKey: 'status_pending',
      tagKey: 'tag_todo',
      useCustomTagClass: true,
      titleKey: null,
      url: null
    }
  };

  // Format countdown string for contests
  function formatContestCountdown(startTimeSec, durationSec = 5400) {
    const t = I18N[currentLang];
    if (!startTimeSec) return t.contest_calc;

    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = startTimeSec - nowSec;

    if (diffSec <= 0) {
      return diffSec + durationSec > 0 ? t.contest_started : t.contest_ended;
    }

    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);

    return t.contest_countdown(days, hours, mins);
  }

  // Update countdowns (Daily UTC reset + Contests)
  function updateAllCountdowns() {
    const now = new Date();
    const elapsedSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
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

    for (const type of ['weekly', 'biweekly']) {
      const contest = cachedData?.contests?.[type];
      const el = contestUI[type].countdown;
      if (el) el.textContent = formatContestCountdown(contest?.startTime, contest?.duration);
    }
  }

  // Apply language strings to UI elements
  function applyLanguageUI() {
    const t = I18N[currentLang];
    if (langBtn) {
      langBtn.textContent = t.lang_btn;
      langBtn.title = t.lang_btn_title;
    }
    if (refreshBtn) refreshBtn.title = t.refresh_title;
    if (subtitle) subtitle.textContent = t.subtitle;
    if (labelLastCheck) labelLastCheck.textContent = t.label_last_check;
    if (labelResetCountdown) labelResetCountdown.textContent = t.label_reset_countdown;

    for (const type of ['weekly', 'biweekly']) {
      contestUI[type].reminders['1h'].text.textContent = t.contest_reminder_1h;
      contestUI[type].reminders['3m'].text.textContent = t.contest_reminder_3m;
    }

    if (debugBtn) debugBtn.title = t.debug_btn_title;
    if (debugTitle) debugTitle.textContent = t.debug_title;
    if (copyDebugBtn && !copyDebugBtn.dataset.copied) copyDebugBtn.textContent = t.debug_copy_report;
    if (clearDebugBtn && !clearDebugBtn.dataset.cleared) clearDebugBtn.textContent = t.debug_clear;

    updateThemeUI();
  }

  // Update debug mode UI state and logs count
  function updateDebugUI(enabled, count = null) {
    isDebugMode = !!enabled;
    if (debugBtn) {
      debugBtn.classList.toggle('active', isDebugMode);
    }
    if (debugSection) {
      debugSection.classList.toggle('hidden', !isDebugMode);
    }
    if (isDebugMode) {
      if (typeof count === 'number') {
        if (debugCount) debugCount.textContent = `${count} / 500`;
      } else {
        chrome.storage.local.get(['debugLogs'], ({ debugLogs = [] }) => {
          if (debugCount) debugCount.textContent = `${debugLogs.length} / 500`;
        });
      }
    }
  }

  // Apply theme to document
  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    updateThemeUI();
  }

  // Update theme button icon
  function updateThemeUI() {
    const t = I18N[currentLang];
    if (themeBtn && themeIcon) {
      if (currentTheme === 'light') {
        themeIcon.innerHTML = '<path d="M12.3 2a10 10 0 0 0-.19 2 10 10 0 0 0 10 10c.68 0 1.35-.07 2-.19A10 10 0 1 1 12.3 2z"/>';
        themeBtn.title = t.theme_to_dark;
        themeBtn.setAttribute('aria-label', t.theme_to_dark);
      } else {
        themeIcon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0-1.41-1.41l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0-1.41-1.41l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
        themeBtn.title = t.theme_to_light;
        themeBtn.setAttribute('aria-label', t.theme_to_light);
      }
    }
  }

  // Declarative Data Rendering
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
    applyLanguageUI();

    const formattedTitle = questionId && title ? `${questionId}. ${title}` : (title || t.title_default);

    // Determine status state
    let stateKey = 'pending';
    if (isLoggedIn === false || lastStatus === 'not_logged_in') stateKey = 'not_logged_in';
    else if (lastStatus === 'Finish') stateKey = 'Finish';
    else if (lastStatus === 'error') stateKey = 'error';

    const state = STATUS_MAP[stateKey];

    // Apply UI attributes declaratively
    statusBadge.className = `status-badge ${state.badgeClass}`;
    statusText.textContent = t[state.statusKey];
    difficultyTag.textContent = state.useCustomTagClass && difficulty ? difficulty : t[state.tagKey];
    difficultyTag.className = state.useCustomTagClass ? `difficulty-tag ${difficulty || ''}` : 'difficulty-tag';
    problemTitle.textContent = state.titleKey ? t[state.titleKey] : formattedTitle;

    if (problemBox) {
      problemBox.href = state.url || questionLink || 'https://leetcode.com/problemset/all/';
    }

    if (lastCheckTime) {
      lastCheckTime.textContent = checkTime || '--';
    }

    // Render Contests
    for (const type of ['weekly', 'biweekly']) {
      const contest = contests?.[type];
      const ui = contestUI[type];
      if (ui.title) ui.title.textContent = contest?.title || t[`${type}_title_default`];
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

  // Save checkbox setting
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

  // Bind change listeners to reminder checkboxes
  for (const type of ['weekly', 'biweekly']) {
    for (const offset of ['1h', '3m']) {
      const checkbox = contestUI[type].reminders[offset].input;
      if (checkbox) checkbox.addEventListener('change', saveContestReminderSettings);
    }
  }

  function isDailyChallengeFinishedToday(data) {
    const todayUtc = new Date().toISOString().slice(0, 10);
    return data?.lastStatus === 'Finish' && data?.lastCompletedUtcDate === todayUtc;
  }

  // Trigger status refresh with debounce guard
  function triggerStatusRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;
    if (refreshBtn) refreshBtn.classList.add('spinning');

    chrome.runtime.sendMessage({ action: 'check_status_now' }, (response) => {
      isRefreshing = false;
      if (refreshBtn) refreshBtn.classList.remove('spinning');
      if (response && response.data) {
        renderData(response.data);
      }
    });
  }

  // 1. Initial Load & Render
  const POPUP_REQUIRED_KEYS = [
    'lang',
    'theme',
    'debugMode',
    'isLoggedIn',
    'lastStatus',
    'lastCheckTime',
    'lastCompletedUtcDate',
    'questionId',
    'questionTitle',
    'questionDifficulty',
    'questionLink',
    'contests',
    'contestReminders'
  ];

  chrome.storage.local.get(POPUP_REQUIRED_KEYS, (items) => {
    if (items && items.lang) {
      currentLang = items.lang;
    }
    applyTheme(items?.theme || 'dark');
    updateDebugUI(items?.debugMode);
    renderData(items || {});

    if (!isDailyChallengeFinishedToday(items)) {
      triggerStatusRefresh();
    }
  });

  // Event Listeners
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      currentLang = currentLang === 'zh' ? 'en' : 'zh';
      chrome.storage.local.set({ lang: currentLang });
      renderData(cachedData);
    });
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      chrome.storage.local.set({ theme: nextTheme });
    });
  }

  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      isDebugMode = !isDebugMode;
      chrome.storage.local.set({ debugMode: isDebugMode }, () => {
        if (isDebugMode) {
          chrome.storage.local.get(['debugLogs'], ({ debugLogs = [] }) => {
            updateDebugUI(isDebugMode, debugLogs.length);
          });
        } else {
          updateDebugUI(false);
        }
      });
    });
  }

  if (copyDebugBtn) {
    copyDebugBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'get_diagnostic_report' }, (response) => {
        const report = response?.report || {};
        navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
          const t = I18N[currentLang];
          copyDebugBtn.dataset.copied = 'true';
          copyDebugBtn.textContent = t.debug_copied;
          setTimeout(() => {
            delete copyDebugBtn.dataset.copied;
            copyDebugBtn.textContent = t.debug_copy_report;
          }, 1500);
        });
      });
    });
  }

  if (clearDebugBtn) {
    clearDebugBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'clear_debug_logs' }, () => {
        const t = I18N[currentLang];
        clearDebugBtn.dataset.cleared = 'true';
        clearDebugBtn.textContent = t.debug_cleared;
        if (debugCount) debugCount.textContent = '0 / 500';
        setTimeout(() => {
          delete clearDebugBtn.dataset.cleared;
          clearDebugBtn.textContent = t.debug_clear;
        }, 1500);
      });
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', triggerStatusRefresh);
  }

  setInterval(updateAllCountdowns, 60000);
});
