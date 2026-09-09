// Background Service Worker for LeetCode Daily Reminder
// Ultra-low CPU & RAM: zero persistent timers, non-persistent service worker

const ALARM_NAME = 'leetcode_daily_alarm';
const DAILY_RESET_ALARM_NAME = 'leetcode_daily_reset_alarm';
const CHECK_INTERVAL_MINUTES = 60;
// Random jitter range (seconds) after daily reset to avoid server thundering herd & rate limits
const DAILY_RESET_DELAY_MIN_SEC = 60;
const DAILY_RESET_DELAY_MAX_SEC = 180;
const NOTIFICATION_ID = 'leetcode_daily_reminder';
const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

// In-flight guard to prevent duplicate concurrent GraphQL checks
let isChecking = false;

// Badge display tokens (matches --status-* in popup.css)
const BADGE_CONFIG = {
  TEXT: ' !',
  TEXT_COLOR: '#FFFFFF',
  BG_NOT_LOGGED_IN: '#F59E0B', // Amber (--status-warning)
  BG_UNFINISHED: '#EF4444',    // Red (--status-pending)
};

// Get current date string in UTC (YYYY-MM-DD)
// LeetCode resets daily coding challenge strictly at UTC 00:00
function getUtcTodayString() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// Get user-friendly local time string
function getFormattedTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Combined GraphQL payload: questionOfToday + topTwoContests (0 overhead, single HTTP request)
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
      // Unfinished daily question (NotStart)
      await chrome.action.setBadgeText({ text: BADGE_CONFIG.TEXT });
      await chrome.action.setBadgeTextColor({ color: BADGE_CONFIG.TEXT_COLOR });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.BG_UNFINISHED });
    }
  } catch (err) {
    console.error('[LeetCode Reminder] Failed to update badge:', err);
  }
}

// Schedule alarm at next daily reset + random delay (60s to 180s)
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

// Ensure hourly alarm is running (when daily problem is unfinished)
function ensureHourlyAlarm() {
  chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    }
  });
}

// Stop hourly alarm (when daily problem is completed for today)
function stopHourlyAlarm() {
  chrome.alarms.clear(ALARM_NAME);
}

// Re-align hourly alarm starting 60 minutes after daily reset
function realignHourlyAlarm() {
  chrome.alarms.clear(ALARM_NAME, () => {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  });
}

// Ensure hourly alarm and daily reset alarm are set
async function setupAlarm() {
  const todayUtc = getUtcTodayString();
  const cached = await chrome.storage.local.get(['lastStatus', 'lastCompletedUtcDate']);

  // Dynamic Alarm: Pause hourly alarm if already solved today (0 wakeups & 0 CPU/RAM)
  if (cached.lastStatus === 'Finish' && cached.lastCompletedUtcDate === todayUtc) {
    stopHourlyAlarm();
  } else {
    ensureHourlyAlarm();
  }

  // Clear legacy alarm name for clean backward compatibility
  chrome.alarms.clear('leetcode_utc_midnight_alarm');
  scheduleDailyResetAlarm();
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
      startTime: c.startTime, // Unix timestamp (seconds)
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

// Fetch upcoming contests (Used only when not logged in to get contest schedules)
async function fetchUpcomingContests() {
  const query = JSON.stringify({
    query: `query topTwoContests {
      topTwoContests {
        title
        titleSlug
        startTime
        duration
      }
    }`,
    variables: {},
    operationName: "topTwoContests"
  });

  try {
    const res = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com/contest/',
        'Origin': 'https://leetcode.com'
      },
      body: query
    });

    if (res.ok) {
      const json = await res.json();
      const contests = parseContests(json?.data?.topTwoContests);
      await chrome.storage.local.set({ contests });
      await syncContestAlarms(contests);
      return contests;
    }
  } catch (err) {
    console.warn('[LeetCode Reminder] Fetch contests failed:', err);
  }
  return null;
}

// Check LeetCode Daily Challenge status
async function checkLeetCodeDaily(forceCheck = false) {
  if (isChecking) return;
  isChecking = true;

  try {
    const todayUtc = getUtcTodayString();

    // 1. Storage-First Check: If already finished today (UTC) and not forced, complete cache hit
    if (!forceCheck) {
      const cached = await chrome.storage.local.get(['lastStatus', 'lastCompletedUtcDate']);
      if (cached.lastStatus === 'Finish' && cached.lastCompletedUtcDate === todayUtc) {
        stopHourlyAlarm();
        await updateBadge('Finish');
        return;
      }
    }

    // 2. Cookie Check: Check LEETCODE_SESSION & csrftoken
    let sessionCookie = null;
    let csrfCookie = null;
    try {
      const cookies = await chrome.cookies.getAll({
        domain: 'leetcode.com'
      });
      if (cookies && cookies.length > 0) {
        for (const c of cookies) {
          if (c.name === 'LEETCODE_SESSION') sessionCookie = c.value;
          if (c.name === 'csrftoken') csrfCookie = c.value;
        }
      }
    } catch (e) {
      console.error('[LeetCode Reminder] Cookie error:', e);
    }

    const { lang: userLang = 'zh' } = await chrome.storage.local.get('lang');

    // If not logged in, fetch contest schedule separately and notify user
    if (!sessionCookie) {
      await fetchUpcomingContests();
      await chrome.storage.local.set({
        isLoggedIn: false,
        lastStatus: 'not_logged_in',
        lastCheckTime: getFormattedTime(),
        todayUtc
      });
      await updateBadge('not_logged_in');

      // Notify user to log in (i18n)
      chrome.notifications.create(NOTIFICATION_ID, {
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
    const headers = {
      'Content-Type': 'application/json',
      'Referer': 'https://leetcode.com/',
      'Origin': 'https://leetcode.com',
      'Cookie': `LEETCODE_SESSION=${sessionCookie}${csrfCookie ? `; csrftoken=${csrfCookie}` : ''}`
    };

    if (csrfCookie) {
      headers['x-csrftoken'] = csrfCookie;
    }

    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: GRAPHQL_QUERY
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[LeetCode Reminder] HTTP Error body:', errText);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const json = await response.json();
    const dailyData = json?.data?.activeDailyCodingChallengeQuestion;

    if (!dailyData) {
      throw new Error('Invalid GraphQL response');
    }

    const userStatus = dailyData.userStatus; // 'Finish' or 'NotStart'
    const question = dailyData.question;
    const link = dailyData.link || '';
    const fullLink = link.startsWith('http') ? link : `https://leetcode.com${link}`;

    // Parse Weekly & Biweekly Contests from unified response
    const contests = parseContests(json?.data?.topTwoContests);

    const updatePayload = {
      isLoggedIn: true,
      lastStatus: userStatus,
      lastCheckTime: getFormattedTime(),
      todayUtc,
      questionId: question?.frontendQuestionId || '',
      questionTitle: question?.title || '',
      questionDifficulty: question?.difficulty || '',
      questionLink: fullLink,
      contests
    };

    if (userStatus === 'Finish') {
      updatePayload.lastCompletedUtcDate = todayUtc;
      await chrome.storage.local.set(updatePayload);
      await updateBadge('Finish');
      stopHourlyAlarm();

      // Clear any remaining notification since problem is solved
      chrome.notifications.clear(NOTIFICATION_ID);
    } else {
      await chrome.storage.local.set(updatePayload);
      await updateBadge('NotStart');
      ensureHourlyAlarm();

      // Show hourly reminder notification (i18n)
      const qPrefix = question?.frontendQuestionId ? `${question.frontendQuestionId}. ` : '';
      const qTitle = question?.title || (userLang === 'en' ? 'Today\'s Challenge' : '今日題目');
      const qDiff = question?.difficulty ? ` [${question.difficulty}]` : '';

      chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: userLang === 'en' ? 'LeetCode Daily Challenge Unfinished!' : 'LeetCode 每日一題尚未完成！',
        message: userLang === 'en'
          ? `${qPrefix}${qTitle}${qDiff}\nClick to solve it now!`
          : `${qPrefix}${qTitle}${qDiff}\n點擊立即前往解題！`,
        priority: 2
      });
    }

    // Schedule 1-hour before alarms for contests if enabled
    await syncContestAlarms(updatePayload.contests);
  } catch (err) {
    console.error('[LeetCode Reminder] GraphQL fetch failed:', err);
    await chrome.storage.local.set({
      lastStatus: 'error',
      lastCheckTime: getFormattedTime()
    });
    // Soft error: maintain reminder badge if today is unfinished
    const prev = await chrome.storage.local.get(['lastStatus', 'lastCompletedUtcDate']);
    const todayUtc = getUtcTodayString();
    if (prev?.lastStatus !== 'Finish' || prev?.lastCompletedUtcDate !== todayUtc) {
      await updateBadge('NotStart');
    }
  } finally {
    isChecking = false;
  }
}

// Sync 1-hour and 3-minute before alarms for Weekly & Biweekly Contests
async function syncContestAlarms(contests) {
  if (!contests) {
    const data = await chrome.storage.local.get(['contests', 'contestReminders']);
    contests = data.contests;
  }
  const { contestReminders = { weekly_1h: true, biweekly_1h: true, weekly_3m: true, biweekly_3m: true } } = await chrome.storage.local.get('contestReminders');

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
        // Trigger precisely before contest start
        const triggerTimeMs = (contest.startTime - offset.sec) * 1000;
        const nowMs = Date.now();

        if (triggerTimeMs > nowMs) {
          chrome.alarms.create(alarmName, { when: triggerTimeMs });
        } else {
          chrome.alarms.clear(alarmName);
        }
      } else {
        chrome.alarms.clear(alarmName);
      }
    }
  }

  // Clear legacy alarm names if any
  chrome.alarms.clear('contest_alarm_weekly');
  chrome.alarms.clear('contest_alarm_biweekly');
}

// Global Single Notification Click Listener (Prevents duplicate tabs!)
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === NOTIFICATION_ID) {
    chrome.notifications.clear(NOTIFICATION_ID);
    const data = await chrome.storage.local.get(['isLoggedIn', 'questionLink']);
    const targetUrl = (!data.isLoggedIn || !data.questionLink)
      ? 'https://leetcode.com/problemset/all/'
      : data.questionLink;

    chrome.tabs.create({ url: targetUrl });
  } else if (notificationId.startsWith('contest_notify_')) {
    chrome.notifications.clear(notificationId);
    const match = notificationId.match(/^contest_notify_([a-zA-Z]+)/);
    const type = match ? match[1] : 'weekly';
    const { contests } = await chrome.storage.local.get('contests');
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
    return true; // Keep channel open for async response
  } else if (request.action === 'update_contest_alarms') {
    syncContestAlarms().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Send contest reminder notification
async function sendContestNotification(type, offsetKey = '1h') {
  const { lang = 'zh' } = await chrome.storage.local.get('lang');
  const is3m = offsetKey === '3m';
  const time = lang === 'zh' ? (is3m ? '3 分鐘' : '1 小時') : (is3m ? '3 minutes' : '1 hour');

  chrome.notifications.create(`contest_notify_${type}_${offsetKey}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: lang === 'zh' ? `LeetCode 競賽即將於 ${time}後開始！` : `LeetCode Contest starting in ${time}!`,
    message: lang === 'zh' ? '點擊前往競賽頁面' : 'Click to open contest page',
    priority: 2
  });
}

// Alarm Listener (every 60 mins check + midnight rollover + precise contest alarms)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
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

// Setup on Startup & Install
chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  checkLeetCodeDaily(false);
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  checkLeetCodeDaily(false);
});

// Auto-check on LeetCode Problem Tab Closure
const getStorageSession = () => chrome.storage.session || chrome.storage.local;

async function trackLeetCodeTab(tabId) {
  try {
    const storage = getStorageSession();
    const { trackedLeetCodeTabs = [] } = await storage.get('trackedLeetCodeTabs');
    if (!trackedLeetCodeTabs.includes(tabId)) {
      trackedLeetCodeTabs.push(tabId);
      await storage.set({ trackedLeetCodeTabs });
    }
  } catch (e) {
    console.error('[LeetCode Reminder] Track tab error:', e);
  }
}

async function checkAndUntrackLeetCodeTab(tabId) {
  try {
    const storage = getStorageSession();
    const { trackedLeetCodeTabs = [] } = await storage.get('trackedLeetCodeTabs');
    const index = trackedLeetCodeTabs.indexOf(tabId);
    if (index !== -1) {
      trackedLeetCodeTabs.splice(index, 1);
      await storage.set({ trackedLeetCodeTabs });
      // Trigger instant status check when user closes or navigates away from LeetCode problem tab
      checkLeetCodeDaily(true);
    }
  } catch (e) {
    console.error('[LeetCode Reminder] Untrack tab error:', e);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url) {
    if (tab.url.includes('leetcode.com/problems/')) {
      trackLeetCodeTab(tabId);
    } else {
      checkAndUntrackLeetCodeTab(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  checkAndUntrackLeetCodeTab(tabId);
});

