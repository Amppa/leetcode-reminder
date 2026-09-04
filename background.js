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

// Fetch upcoming contests (Public API, zero login required)
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
      const topContests = json?.data?.topTwoContests || [];
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

      const contests = { weekly: weeklyContest, biweekly: biweeklyContest };
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
  const todayUtc = getUtcTodayString();

  // 0. Always refresh upcoming contests
  await fetchUpcomingContests();

  // 1. Language preference
  const { lang: userLang = 'zh' } = await chrome.storage.local.get('lang');

  // 2. Storage-First Check: If already finished today (UTC) and not forced, skip daily question network call
  if (!forceCheck) {
    const cached = await chrome.storage.local.get(['lastStatus', 'lastCompletedUtcDate']);
    if (cached.lastStatus === 'Finish' && cached.lastCompletedUtcDate === todayUtc) {
      await updateBadge('Finish');
      return;
    }
  }

  // 3. Cookie Check: Check LEETCODE_SESSION & csrftoken
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

    // Parse Weekly & Biweekly Contests
    const topContests = json?.data?.topTwoContests || [];
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

    const updatePayload = {
      isLoggedIn: true,
      lastStatus: userStatus,
      lastCheckTime: getFormattedTime(),
      todayUtc,
      questionId: question?.frontendQuestionId || '',
      questionTitle: question?.title || '',
      questionDifficulty: question?.difficulty || '',
      questionLink: fullLink,
      contests: {
        weekly: weeklyContest,
        biweekly: biweeklyContest
      }
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
    await updateBadge('error');
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

// Alarm Listener (every 60 mins check + precise contest alarms)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkLeetCodeDaily(false);
  } else if (alarm.name.startsWith('contest_alarm_')) {
    const parts = alarm.name.replace('contest_alarm_', '').split('_');
    const type = parts[0];
    const offsetKey = parts[1] || '1h';

    const { contests, lang = 'zh' } = await chrome.storage.local.get(['contests', 'lang']);
    const contest = contests?.[type];

    if (contest) {
      const isZh = lang === 'zh';
      const titleName = contest.title || (type === 'biweekly' ? 'Biweekly Contest' : 'Weekly Contest');
      const is3m = offsetKey === '3m';

      const title = isZh
        ? (is3m ? 'LeetCode 競賽即將於 3 分鐘後開始！' : 'LeetCode 競賽即將於 1 小時後開始！')
        : (is3m ? 'LeetCode Contest Starting in 3 Minutes!' : 'LeetCode Contest Starting in 1 Hour!');

      const message = isZh
        ? (is3m
            ? `【${titleName}】倒數 3 分鐘開賽，請做好準備！點擊前往競賽頁面！`
            : `【${titleName}】倒數 60 分鐘開賽，點擊前往競賽頁面！`)
        : (is3m
            ? `【${titleName}】starts in 3 minutes. Get ready! Click to join now!`
            : `【${titleName}】starts in 60 minutes. Click to join now!`);

      chrome.notifications.create(`contest_notify_${type}_${offsetKey}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title,
        message,
        priority: 2
      });
    }
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
