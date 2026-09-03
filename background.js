// Background Service Worker for LeetCode Daily Reminder
// Ultra-low CPU & RAM: zero persistent timers, non-persistent service worker

const ALARM_NAME = 'leetcode_daily_alarm';
const CHECK_INTERVAL_MINUTES = 60;
const NOTIFICATION_ID = 'leetcode_daily_reminder';
const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

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

// Minimal GraphQL payload (only fields strictly needed)
const GRAPHQL_QUERY = JSON.stringify({
  query: "query questionOfToday { activeDailyCodingChallengeQuestion { date userStatus link question { frontendQuestionId: questionFrontendId title titleSlug difficulty } } }",
  variables: {},
  operationName: "questionOfToday"
});

// Update extension icon badge
async function updateBadge(status) {
  try {
    if (status === 'Finish' || status === 'error') {
      await chrome.action.setBadgeText({ text: '' });
    } else if (status === 'not_logged_in') {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Amber
    } else {
      // Unfinished daily question (NotStart)
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
    }
  } catch (err) {
    console.error('[LeetCode Reminder] Failed to update badge:', err);
  }
}

// Ensure hourly alarm is set
function setupAlarm() {
  chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
    if (!existingAlarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    }
  });
}

// Check LeetCode Daily Challenge status
async function checkLeetCodeDaily(forceCheck = false) {
  const todayUtc = getUtcTodayString();

  // 1. Storage-First Check: If already finished today (UTC) and not forced, skip network call completely
  if (!forceCheck) {
    const cached = await chrome.storage.local.get(['lastStatus', 'lastCompletedUtcDate']);
    if (cached.lastStatus === 'Finish' && cached.lastCompletedUtcDate === todayUtc) {
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

  if (!sessionCookie) {
    await chrome.storage.local.set({
      isLoggedIn: false,
      lastStatus: 'not_logged_in',
      lastCheckTime: getFormattedTime(),
      todayUtc
    });
    await updateBadge('not_logged_in');

    // Notify user to log in
    chrome.notifications.create(NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'LeetCode 提醒：未登入',
      message: '尚未偵測到 LeetCode 登入狀態，請點擊登入以追蹤每日挑戰解題進度。',
      priority: 1
    });
    return;
  }

  // 3. Background GraphQL Request
  try {
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

    const updatePayload = {
      isLoggedIn: true,
      lastStatus: userStatus,
      lastCheckTime: getFormattedTime(),
      todayUtc,
      questionId: question?.frontendQuestionId || '',
      questionTitle: question?.title || '',
      questionDifficulty: question?.difficulty || '',
      questionLink: fullLink
    };

    if (userStatus === 'Finish') {
      updatePayload.lastCompletedUtcDate = todayUtc;
      await chrome.storage.local.set(updatePayload);
      await updateBadge('Finish');

      // Clear any remaining notification since problem is solved
      chrome.notifications.clear(NOTIFICATION_ID);
    } else {
      await chrome.storage.local.set(updatePayload);
      await updateBadge('NotStart');

      // Show hourly reminder notification
      chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'LeetCode 每日一題尚未完成！',
        message: `${question?.frontendQuestionId ? question.frontendQuestionId + '. ' : ''}${question?.title || '今日題目'} [${question?.difficulty || ''}]\n點擊立即前往解題！`,
        priority: 2
      });
    }
  } catch (err) {
    console.error('[LeetCode Reminder] GraphQL fetch failed:', err);
    await chrome.storage.local.set({
      lastStatus: 'error',
      lastCheckTime: getFormattedTime()
    });
    await updateBadge('error');
  }
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
  }
});

// Alarm Listener (every 60 mins)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkLeetCodeDaily(false);
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
