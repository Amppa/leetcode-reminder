// Background Service Worker for LeetCode Daily Reminder
// Ultra-low CPU & RAM: zero persistent timers, non-persistent service worker

const HOURLY_ALARM_NAME = 'leetcode_daily_alarm';
const DAILY_RESET_ALARM_NAME = 'leetcode_daily_reset_alarm';
const CHECK_INTERVAL_MINUTES = 60;
const DAILY_RESET_DELAY_MIN_SEC = 60;
const DAILY_RESET_DELAY_MAX_SEC = 180;
const DAILY_NOTIFICATION_ID = 'leetcode_daily_reminder';
const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

// Storage keys enumeration for clean, bug-free storage management
const STORAGE_KEYS = {
  IS_LOGGED_IN: 'isLoggedIn',
  LAST_STATUS: 'lastStatus',
  LAST_CHECK_TIME: 'lastCheckTime',
  TODAY_UTC: 'todayUtc',
  LAST_COMPLETED_UTC_DATE: 'lastCompletedUtcDate',
  QUESTION_ID: 'questionId',
  QUESTION_TITLE: 'questionTitle',
  QUESTION_DIFFICULTY: 'questionDifficulty',
  QUESTION_LINK: 'questionLink',
  CONTESTS: 'contests',
  CONTEST_REMINDERS: 'contestReminders',
  LANG: 'lang',
  THEME: 'theme',
  TRACKED_TABS: 'trackedLeetCodeTabs',
  DEBUG_MODE: 'debugMode',
  DEBUG_LOGS: 'debugLogs'
};

const MAX_DEBUG_LOGS = 500;

// Centralized logging helper with 500-entry ring buffer in storage
async function logMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logPrefix = `[LeetCode Reminder][${level}]`;

  // Always output to developer console
  if (level === 'ERROR') {
    console.error(logPrefix, message, data || '');
  } else if (level === 'WARN') {
    console.warn(logPrefix, message, data || '');
  } else {
    console.log(logPrefix, message, data || '');
  }

  try {
    const { [STORAGE_KEYS.DEBUG_MODE]: isDebugMode } = await chrome.storage.local.get(STORAGE_KEYS.DEBUG_MODE);
    if (!isDebugMode && level !== 'ERROR') {
      return;
    }

    const { [STORAGE_KEYS.DEBUG_LOGS]: debugLogs = [] } = await chrome.storage.local.get(STORAGE_KEYS.DEBUG_LOGS);
    const entry = {
      time: timestamp,
      level,
      msg: message,
      ...(data ? { data: typeof data === 'object' ? JSON.stringify(data) : String(data) } : {})
    };

    const updated = [...debugLogs, entry].slice(-MAX_DEBUG_LOGS);
    await chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_LOGS]: updated });
  } catch (err) {
    // Silently ignore storage write errors
  }
}

// Generate comprehensive diagnostic dump with sensitive tokens stripped
async function getDiagnosticReport() {
  const storageData = await chrome.storage.local.get(null);
  const alarms = await chrome.alarms.getAll();

  const sanitizedStorage = { ...storageData };
  delete sanitizedStorage[STORAGE_KEYS.DEBUG_LOGS];

  return {
    extensionVersion: chrome.runtime.getManifest().version,
    reportTime: new Date().toISOString(),
    debugMode: !!storageData[STORAGE_KEYS.DEBUG_MODE],
    activeAlarms: alarms.map(a => ({
      name: a.name,
      scheduledTime: new Date(a.scheduledTime).toLocaleString(),
      scheduledTimeMs: a.scheduledTime,
      periodInMinutes: a.periodInMinutes || null
    })),
    storage: sanitizedStorage,
    logs: storageData[STORAGE_KEYS.DEBUG_LOGS] || []
  };
}

// Badge display tokens
const BADGE_CONFIG = {
  TEXT: ' !',
  TEXT_COLOR: '#FFFFFF',
  BG_NOT_LOGGED_IN: '#F59E0B', // Amber
  BG_UNFINISHED: '#EF4444'     // Red
};

// In-flight guard to prevent duplicate concurrent GraphQL checks
let isChecking = false;

// Get current date string in UTC (YYYY-MM-DD)
function getUtcTodayString() {
  return new Date().toISOString().slice(0, 10);
}

// Get user-friendly local time string
function getFormattedLocalTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Combined GraphQL payload: questionOfToday + topTwoContests
const GRAPHQL_QUERY = JSON.stringify({
  query: `query dailyAndContests {
    activeDailyCodingChallengeQuestion {
      date
      userStatus
      link
      question {
        frontendQuestionId: questionFrontendId
        title
        titleSlug
        difficulty
      }
    }
    topTwoContests {
      title
      titleSlug
      startTime
      duration
    }
  }`,
  variables: {},
  operationName: "dailyAndContests"
});

// Update extension icon badge
async function updateBadge(status) {
  try {
    if (status === 'Finish' || status === 'error') {
      await chrome.action.setBadgeText({ text: '' });
    } else if (status === 'not_logged_in') {
      await chrome.action.setBadgeText({ text: BADGE_CONFIG.TEXT });
      await chrome.action.setBadgeTextColor({ color: BADGE_CONFIG.TEXT_COLOR });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.BG_NOT_LOGGED_IN });
    } else {
      await chrome.action.setBadgeText({ text: BADGE_CONFIG.TEXT });
      await chrome.action.setBadgeTextColor({ color: BADGE_CONFIG.TEXT_COLOR });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.BG_UNFINISHED });
    }
  } catch (err) {
    console.error('[LeetCode Reminder] Failed to update badge:', err);
  }
}

// Fetch authentication cookies from leetcode.com
async function getLeetCodeCookies() {
  let sessionCookie = null;
  let csrfCookie = null;
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'leetcode.com' });
    if (cookies && cookies.length > 0) {
      for (const c of cookies) {
        if (c.name === 'LEETCODE_SESSION') sessionCookie = c.value;
        if (c.name === 'csrftoken') csrfCookie = c.value;
      }
    }
    logMessage('INFO', 'Checked LeetCode cookies', {
      hasSession: !!sessionCookie,
      sessionLength: sessionCookie ? sessionCookie.length : 0,
      hasCsrf: !!csrfCookie
    });
  } catch (e) {
    logMessage('ERROR', 'Cookie fetch error', e.message);
    console.error('[LeetCode Reminder] Cookie error:', e);
  }
  return { sessionCookie, csrfCookie };
}

// Execute GraphQL POST request
async function fetchGraphQL(queryPayload, sessionCookie = null, csrfCookie = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Referer': 'https://leetcode.com/',
    'Origin': 'https://leetcode.com'
  };
  if (sessionCookie) {
    headers['Cookie'] = `LEETCODE_SESSION=${sessionCookie}${csrfCookie ? `; csrftoken=${csrfCookie}` : ''}`;
  }
  if (csrfCookie) {
    headers['x-csrftoken'] = csrfCookie;
  }

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: queryPayload
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }
  return await response.json();
}

// Alarm Helpers
function scheduleDailyResetAlarm() {
  const now = new Date();
  const randomDelaySec = DAILY_RESET_DELAY_MIN_SEC +
    Math.floor(Math.random() * (DAILY_RESET_DELAY_MAX_SEC - DAILY_RESET_DELAY_MIN_SEC + 1));
  const nextResetUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, randomDelaySec
  );
  chrome.alarms.create(DAILY_RESET_ALARM_NAME, { when: nextResetUtc });
}

function ensureHourlyAlarm() {
  chrome.alarms.get(HOURLY_ALARM_NAME, (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create(HOURLY_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    }
  });
}

function stopHourlyAlarm() {
  chrome.alarms.clear(HOURLY_ALARM_NAME);
}

function realignHourlyAlarm() {
  chrome.alarms.clear(HOURLY_ALARM_NAME, () => {
    chrome.alarms.create(HOURLY_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  });
}

async function setupAlarm() {
  const todayUtc = getUtcTodayString();
  const cached = await chrome.storage.local.get([STORAGE_KEYS.LAST_STATUS, STORAGE_KEYS.LAST_COMPLETED_UTC_DATE]);

  if (cached[STORAGE_KEYS.LAST_STATUS] === 'Finish' && cached[STORAGE_KEYS.LAST_COMPLETED_UTC_DATE] === todayUtc) {
    stopHourlyAlarm();
  } else {
    ensureHourlyAlarm();
  }

  chrome.alarms.clear('leetcode_utc_midnight_alarm');
  scheduleDailyResetAlarm();
  await syncContestAlarms();
}

// Parse Weekly and Biweekly contests from GraphQL topTwoContests array
function parseContests(topContests = []) {
  let weeklyContest = null;
  let biweeklyContest = null;

  for (const c of topContests) {
    const slug = (c.titleSlug || '').toLowerCase();
    const info = {
      title: c.title,
      titleSlug: c.titleSlug,
      startTime: c.startTime,
      duration: c.duration,
      link: `https://leetcode.com/contest/${c.titleSlug}/`
    };
    if (slug.includes('biweekly')) {
      biweeklyContest = info;
    } else if (slug.includes('weekly')) {
      weeklyContest = info;
    }
  }
  return { weekly: weeklyContest, biweekly: biweeklyContest };
}

// Fetch upcoming contests when not logged in
async function fetchUpcomingContests() {
  const query = JSON.stringify({
    query: `query topTwoContests {
      topTwoContests { title titleSlug startTime duration }
    }`,
    variables: {},
    operationName: "topTwoContests"
  });

  try {
    const json = await fetchGraphQL(query);
    const contests = parseContests(json?.data?.topTwoContests);
    await chrome.storage.local.set({ [STORAGE_KEYS.CONTESTS]: contests });
    await syncContestAlarms(contests);
    return contests;
  } catch (err) {
    console.warn('[LeetCode Reminder] Fetch contests failed:', err);
  }
  return null;
}

// Show desktop notification for unfinished daily challenge
function showUnfinishedNotification(userLang, question) {
  const qPrefix = question?.frontendQuestionId ? `${question.frontendQuestionId}. ` : '';
  const qTitle = question?.title || (userLang === 'en' ? 'Today\'s Challenge' : '今日題目');
  const qDiff = question?.difficulty ? ` [${question.difficulty}]` : '';

  chrome.notifications.create(DAILY_NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: userLang === 'en' ? 'LeetCode Daily Challenge Unfinished!' : 'LeetCode 每日一題尚未完成！',
    message: userLang === 'en'
      ? `${qPrefix}${qTitle}${qDiff}\nClick to solve it now!`
      : `${qPrefix}${qTitle}${qDiff}\n點擊立即前往解題！`,
    priority: 2
  });
}

// Check LeetCode Daily Challenge status
async function checkLeetCodeDaily(forceCheck = false) {
  if (isChecking) return;
  isChecking = true;
  logMessage('INFO', 'Starting daily challenge check', { forceCheck });

  try {
    const todayUtc = getUtcTodayString();

    // 1. Storage-First Check
    if (!forceCheck) {
      const cached = await chrome.storage.local.get([
        STORAGE_KEYS.LAST_STATUS,
        STORAGE_KEYS.LAST_COMPLETED_UTC_DATE,
        STORAGE_KEYS.CONTESTS
      ]);
      const nowSec = Math.floor(Date.now() / 1000);
      const weeklyStart = cached[STORAGE_KEYS.CONTESTS]?.weekly?.startTime || 0;
      const hasFreshContests = weeklyStart > nowSec;

      if (cached[STORAGE_KEYS.LAST_STATUS] === 'Finish' && cached[STORAGE_KEYS.LAST_COMPLETED_UTC_DATE] === todayUtc && hasFreshContests) {
        logMessage('INFO', 'Daily challenge already finished today (cache hit)', { todayUtc });
        stopHourlyAlarm();
        await updateBadge('Finish');
        await syncContestAlarms(cached[STORAGE_KEYS.CONTESTS]);
        return;
      }
    }

    // 2. Cookie Check
    const { sessionCookie, csrfCookie } = await getLeetCodeCookies();
    const { [STORAGE_KEYS.LANG]: userLang = 'zh' } = await chrome.storage.local.get(STORAGE_KEYS.LANG);

    if (!sessionCookie) {
      logMessage('WARN', 'Not logged in to LeetCode (session cookie missing)');
      await fetchUpcomingContests();
      await chrome.storage.local.set({
        [STORAGE_KEYS.IS_LOGGED_IN]: false,
        [STORAGE_KEYS.LAST_STATUS]: 'not_logged_in',
        [STORAGE_KEYS.LAST_CHECK_TIME]: getFormattedLocalTime(),
        [STORAGE_KEYS.TODAY_UTC]: todayUtc
      });
      await updateBadge('not_logged_in');

      chrome.notifications.create(DAILY_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: userLang === 'en' ? 'LeetCode Reminder: Not Logged In' : 'LeetCode 提醒：未登入',
        message: userLang === 'en'
          ? 'Not logged in to LeetCode. Click to log in and track your daily challenge!'
          : '尚未偵測到 LeetCode 登入狀態，請點擊登入以追蹤每日挑戰解題進度。',
        priority: 1
      });
      return;
    }

    // 3. Background GraphQL Request
    const json = await fetchGraphQL(GRAPHQL_QUERY, sessionCookie, csrfCookie);
    const dailyData = json?.data?.activeDailyCodingChallengeQuestion;

    if (!dailyData) {
      throw new Error('Invalid GraphQL response');
    }

    const userStatus = dailyData.userStatus; // 'Finish' or 'NotStart'
    const question = dailyData.question;
    const link = dailyData.link || '';
    const fullLink = link.startsWith('http') ? link : `https://leetcode.com${link}`;
    const contests = parseContests(json?.data?.topTwoContests);

    const updatePayload = {
      [STORAGE_KEYS.IS_LOGGED_IN]: true,
      [STORAGE_KEYS.LAST_STATUS]: userStatus,
      [STORAGE_KEYS.LAST_CHECK_TIME]: getFormattedLocalTime(),
      [STORAGE_KEYS.TODAY_UTC]: todayUtc,
      [STORAGE_KEYS.QUESTION_ID]: question?.frontendQuestionId || '',
      [STORAGE_KEYS.QUESTION_TITLE]: question?.title || '',
      [STORAGE_KEYS.QUESTION_DIFFICULTY]: question?.difficulty || '',
      [STORAGE_KEYS.QUESTION_LINK]: fullLink,
      [STORAGE_KEYS.CONTESTS]: contests
    };

    if (userStatus === 'Finish') {
      logMessage('INFO', 'Daily challenge completed for today', {
        questionId: question?.frontendQuestionId,
        title: question?.title
      });
      updatePayload[STORAGE_KEYS.LAST_COMPLETED_UTC_DATE] = todayUtc;
      await chrome.storage.local.set(updatePayload);
      await updateBadge('Finish');
      stopHourlyAlarm();
      chrome.notifications.clear(DAILY_NOTIFICATION_ID);
    } else {
      logMessage('INFO', 'Daily challenge unfinished', {
        questionId: question?.frontendQuestionId,
        title: question?.title
      });
      await chrome.storage.local.set(updatePayload);
      await updateBadge('NotStart');
      ensureHourlyAlarm();
      showUnfinishedNotification(userLang, question);
    }

    await syncContestAlarms(updatePayload[STORAGE_KEYS.CONTESTS]);
  } catch (err) {
    logMessage('ERROR', 'Daily challenge check failed', err.message);
    console.error('[LeetCode Reminder] GraphQL fetch failed:', err);
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_STATUS]: 'error',
      [STORAGE_KEYS.LAST_CHECK_TIME]: getFormattedLocalTime()
    });
    const prev = await chrome.storage.local.get([STORAGE_KEYS.LAST_STATUS, STORAGE_KEYS.LAST_COMPLETED_UTC_DATE]);
    const todayUtc = getUtcTodayString();
    if (prev?.[STORAGE_KEYS.LAST_STATUS] !== 'Finish' || prev?.[STORAGE_KEYS.LAST_COMPLETED_UTC_DATE] !== todayUtc) {
      await updateBadge('NotStart');
    }
  } finally {
    isChecking = false;
  }
}

// Sync 1-hour and 3-minute before alarms for Weekly & Biweekly Contests
async function syncContestAlarms(contests) {
  if (!contests) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.CONTESTS, STORAGE_KEYS.CONTEST_REMINDERS]);
    contests = data[STORAGE_KEYS.CONTESTS];
  }
  const { [STORAGE_KEYS.CONTEST_REMINDERS]: contestReminders = { weekly_1h: true, biweekly_1h: true, weekly_3m: true, biweekly_3m: true } } = await chrome.storage.local.get(STORAGE_KEYS.CONTEST_REMINDERS);

  const types = ['weekly', 'biweekly'];
  const offsets = [
    { key: '1h', sec: 3600 },
    { key: '3m', sec: 180 }
  ];

  for (const type of types) {
    const contest = contests?.[type];
    for (const offset of offsets) {
      const alarmName = `contest_alarm_${type}_${offset.key}`;
      const isEnabled = contestReminders[`${type}_${offset.key}`] !== false;

      if (isEnabled && contest?.startTime) {
        const triggerTimeMs = (contest.startTime - offset.sec) * 1000;
        if (triggerTimeMs > Date.now()) {
          chrome.alarms.create(alarmName, { when: triggerTimeMs });
          logMessage('INFO', 'Scheduled contest alarm', {
            alarmName,
            triggerTime: new Date(triggerTimeMs).toLocaleString()
          });
        } else {
          chrome.alarms.clear(alarmName);
        }
      } else {
        chrome.alarms.clear(alarmName);
      }
    }
  }

  chrome.alarms.clear('contest_alarm_weekly');
  chrome.alarms.clear('contest_alarm_biweekly');
}

// Notification Click Listener
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === DAILY_NOTIFICATION_ID) {
    chrome.notifications.clear(DAILY_NOTIFICATION_ID);
    const data = await chrome.storage.local.get([STORAGE_KEYS.IS_LOGGED_IN, STORAGE_KEYS.QUESTION_LINK]);
    const targetUrl = (!data[STORAGE_KEYS.IS_LOGGED_IN] || !data[STORAGE_KEYS.QUESTION_LINK])
      ? 'https://leetcode.com/problemset/all/'
      : data[STORAGE_KEYS.QUESTION_LINK];

    chrome.tabs.create({ url: targetUrl });
  } else if (notificationId.startsWith('contest_notify_')) {
    chrome.notifications.clear(notificationId);
    const match = notificationId.match(/^contest_notify_([a-zA-Z]+)/);
    const type = match ? match[1] : 'weekly';
    const { [STORAGE_KEYS.CONTESTS]: contests } = await chrome.storage.local.get(STORAGE_KEYS.CONTESTS);
    const contestUrl = contests?.[type]?.link || 'https://leetcode.com/contest/';
    chrome.tabs.create({ url: contestUrl });
  }
});

// Runtime Messages (from popup)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'check_status_now') {
    checkLeetCodeDaily(true).then(() => {
      chrome.storage.local.get(null, (data) => {
        sendResponse({ success: true, data });
      });
    });
    return true;
  } else if (request.action === 'update_contest_alarms') {
    syncContestAlarms().then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'get_diagnostic_report') {
    getDiagnosticReport().then((report) => {
      sendResponse({ success: true, report });
    });
    return true;
  } else if (request.action === 'clear_debug_logs') {
    chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_LOGS]: [] }, () => {
      logMessage('INFO', 'Cleared debug logs');
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'append_debug_log') {
    logMessage(request.level || 'INFO', request.message, request.data).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Send contest reminder notification
async function sendContestNotification(type, offsetKey = '1h') {
  const { [STORAGE_KEYS.LANG]: lang = 'zh' } = await chrome.storage.local.get(STORAGE_KEYS.LANG);
  const is3m = offsetKey === '3m';
  const time = lang === 'zh' ? (is3m ? '3 分鐘' : '1 小時') : (is3m ? '3 minutes' : '1 hour');

  chrome.notifications.create(`contest_notify_${type}_${offsetKey}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: lang === 'zh' ? `LeetCode 競賽即將於 ${time}後開始！` : `LeetCode Contest starting in ${time}!`,
    message: lang === 'zh' ? '點擊前往競賽頁面' : 'Click to open contest page',
    priority: 2
  });
  logMessage('INFO', 'Sent contest notification', { type, offsetKey });
}

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  logMessage('INFO', 'Alarm triggered', { alarmName: alarm.name });
  if (alarm.name === HOURLY_ALARM_NAME) {
    checkLeetCodeDaily(false);
  } else if (alarm.name === DAILY_RESET_ALARM_NAME || alarm.name === 'leetcode_utc_midnight_alarm') {
    scheduleDailyResetAlarm();
    realignHourlyAlarm();
    checkLeetCodeDaily(true);
  } else if (alarm.name.startsWith('contest_alarm_')) {
    const parts = alarm.name.replace('contest_alarm_', '').split('_');
    const type = parts[0];
    const offsetKey = parts[1] || '1h';
    await sendContestNotification(type, offsetKey);
  }
});

// Auto-check on LeetCode Problem Tab Closure
const getStorageSession = () => chrome.storage.session || chrome.storage.local;

async function trackLeetCodeTab(tabId) {
  try {
    const storage = getStorageSession();
    const { [STORAGE_KEYS.TRACKED_TABS]: trackedLeetCodeTabs = [] } = await storage.get(STORAGE_KEYS.TRACKED_TABS);
    if (!trackedLeetCodeTabs.includes(tabId)) {
      trackedLeetCodeTabs.push(tabId);
      await storage.set({ [STORAGE_KEYS.TRACKED_TABS]: trackedLeetCodeTabs });
      logMessage('INFO', 'Tracked LeetCode problem tab', { tabId });
    }
  } catch (e) {
    logMessage('ERROR', 'Track tab error', e.message);
    console.error('[LeetCode Reminder] Track tab error:', e);
  }
}

async function checkAndUntrackLeetCodeTab(tabId) {
  try {
    const storage = getStorageSession();
    const { [STORAGE_KEYS.TRACKED_TABS]: trackedLeetCodeTabs = [] } = await storage.get(STORAGE_KEYS.TRACKED_TABS);
    const index = trackedLeetCodeTabs.indexOf(tabId);
    if (index !== -1) {
      trackedLeetCodeTabs.splice(index, 1);
      await storage.set({ [STORAGE_KEYS.TRACKED_TABS]: trackedLeetCodeTabs });
      logMessage('INFO', 'Untracked LeetCode tab; delayed re-check scheduled', { tabId });
      // Delay 1.5s to ensure LeetCode backend submission and userStatus are updated
      setTimeout(() => {
        checkLeetCodeDaily(true);
      }, 1500);
    }
  } catch (e) {
    logMessage('ERROR', 'Untrack tab error', e.message);
    console.error('[LeetCode Reminder] Untrack tab error:', e);
  }
}

async function scanOpenLeetCodeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://leetcode.com/problems/*' });
    for (const t of tabs) {
      if (t.id) await trackLeetCodeTab(t.id);
    }
    logMessage('INFO', 'Scanned existing LeetCode problem tabs', { count: tabs.length });
  } catch (e) {
    logMessage('ERROR', 'Scan tabs error', e.message);
    console.error('[LeetCode Reminder] Scan tabs error:', e);
  }
}

// Setup on Startup & Install
chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  checkLeetCodeDaily(false);
  scanOpenLeetCodeTabs();
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  checkLeetCodeDaily(false);
  scanOpenLeetCodeTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (url) {
    if (url.includes('leetcode.com/problems/')) {
      trackLeetCodeTab(tabId);
    } else {
      checkAndUntrackLeetCodeTab(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  checkAndUntrackLeetCodeTab(tabId);
});
