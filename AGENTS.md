# AGENTS.md - Developer & AI Agent Guide

This document serves as an architectural overview and developer guide for AI agents and human contributors working on the **LeetCode Reminder** Chrome extension repository.

---

## 1. Executive Summary & Tech Stack

- **Project**: LeetCode Reminder Chrome Extension (Manifest V3)
- **Purpose**: Tracks LeetCode Daily Challenge status and Weekly/Biweekly contest schedules, alerting users via extension badge updates and desktop notifications.
- **Tech Stack**: Pure Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Dependencies**: Zero external runtime dependencies, bundlers, or build steps (no Webpack, Vite, React, or npm libraries).
- **Extension Architecture**: Manifest V3 Non-persistent Service Worker (`background.js`) + Popup UI (`popup.html`, `popup.js`, `popup.css`).

---

## 2. Directory Structure & File Map

```
leetcode-reminder/
├── manifest.json         # Extension Manifest V3 configuration
├── background.js        # Background Service Worker (Modular helpers, Storage Enum, GraphQL API, Alarms)
├── popup.html           # Popup UI layout structure
├── popup.js             # Declarative Popup UI renderer (STATUS_MAP), theme, i18n, & countdowns
├── popup.css            # Extension styling with CSS Custom Properties (Dark/Light themes)
├── i18n.js              # Localization dictionary (zh / en)
├── _locales/            # Standard Chrome locales (Extension name & description)
│   ├── en/messages.json
│   └── zh_TW/messages.json
└── icons/               # Extension icons (16x16, 48x48, 128x128)
```

---

## 3. Core Architecture & Component Responsibilities

### 3.1 Background Service Worker (`background.js`)
- **Storage Centralization**: Uses `STORAGE_KEYS` enum for type-safe key references across `chrome.storage.local`.
- **Modularized Functions**:
  - `getLeetCodeCookies()`: Reads `LEETCODE_SESSION` & `csrftoken` cookies from domain `leetcode.com`.
  - `fetchGraphQL()`: Generic helper executing POST requests to `https://leetcode.com/graphql`.
  - `showUnfinishedNotification()`: Generates localized desktop notifications for unfinished challenges.
- **Badge Management**:
  - `Finish`: Clears badge (`""`).
  - `NotStart`: Sets red `!` badge (`#EF4444`).
  - `not_logged_in`: Sets amber `!` badge (`#F59E0B`).
- **Alarms & Dynamic Scheduler**:
  - `leetcode_daily_alarm`: Periodic check every 60 minutes. Dynamically cleared (`stopHourlyAlarm`) when today's challenge is completed to ensure zero background wakeups, and re-enabled (`ensureHourlyAlarm`) when unfinished.
  - `leetcode_daily_reset_alarm`: Scheduled at UTC midnight with random delay jitter (60s ~ 180s buffer) to prevent API thundering herd and bypass server rollover lag. On trigger, it realigns `leetcode_daily_alarm` 60 minutes after reset to eliminate alarm collision.
  - `contest_alarm_[weekly|biweekly]_[1h|3m]`: Scheduled 1 hour and 3 minutes before contest start times.
- **Tab Closure Monitoring**:
  - `chrome.tabs.onUpdated` & `chrome.tabs.onRemoved`: Tracks open LeetCode problem tabs (`leetcode.com/problems/`) and automatically triggers an instant status check (`checkLeetCodeDaily(true)`) when the user closes or navigates away from a problem tab.
- **Notifications**:
  - `chrome.notifications.create` for unfinished daily problems, login prompts, and upcoming contest reminders.
  - `chrome.notifications.onClicked`: Single tab focus handler preventing duplicate tabs.

### 3.2 Popup Interface (`popup.html`, `popup.js`, `popup.css`)
- **Declarative UI Rendering (`STATUS_MAP`)**:
  - Maps status states (`not_logged_in`, `Finish`, `error`, `pending`) declaratively to badge classes, status texts, difficulty tags, and target URLs.
- **Debounced Refresh**:
  - Prevents rapid double-clicking on manual refresh button via `isRefreshing` guard.
- **SWR (Stale-While-Revalidate) Rendering**:
  - Immediately loads cached state from `chrome.storage.local` upon opening popup.
  - Triggers asynchronous `check_status_now` message to `background.js` if today's daily problem is not marked `Finish`.
- **Theme Engine**:
  - Default dark theme. Light mode activated by setting `data-theme="light"` on `<html>`.
  - Color palette driven by CSS variables in `popup.css` (`--bg-primary`, `--card-bg`, `--status-pending`, `--status-warning`, `--status-success`).
- **Live Countdowns**:
  - Daily UTC reset countdown (`resetCountdown`) calculating time remaining until UTC 00:00.
  - Contest countdowns (`weeklyCountdown`, `biweeklyCountdown`) displaying formatted `Starts in Xd Xh` / `Starts in Xh Xm`.

### 3.3 Internationalization (`i18n.js` & `_locales/`)
- `_locales/`: Provides localized Chrome Store extension name (`appName`) and description (`appDesc`).
- `i18n.js`: Contains `I18N` object with dictionary keys for `zh` and `en` used dynamically by `popup.js` and `background.js`.

---

## 4. Chrome Storage Schema (`chrome.storage.local` & `STORAGE_KEYS`)

| Key Constant (`STORAGE_KEYS`) | String Key | Type | Description |
|---|---|---|---|
| `IS_LOGGED_IN` | `isLoggedIn` | `boolean` | Indicates if `LEETCODE_SESSION` cookie is present |
| `LAST_STATUS` | `lastStatus` | `string` | Status code: `'Finish'`, `'NotStart'`, `'not_logged_in'`, or `'error'` |
| `LAST_CHECK_TIME` | `lastCheckTime` | `string` | Formatted local time string of last status check |
| `TODAY_UTC` | `todayUtc` | `string` | Current UTC date string (`YYYY-MM-DD`) |
| `LAST_COMPLETED_UTC_DATE` | `lastCompletedUtcDate` | `string` | UTC date string when daily challenge was completed |
| `QUESTION_ID` | `questionId` | `string` | Frontend question ID (e.g., `"1"`) |
| `QUESTION_TITLE` | `questionTitle` | `string` | Problem title (e.g., `"Two Sum"`) |
| `QUESTION_DIFFICULTY` | `questionDifficulty` | `string` | Difficulty level (`"Easy"`, `"Medium"`, `"Hard"`) |
| `QUESTION_LINK` | `questionLink` | `string` | Direct URL link to problem page |
| `CONTESTS` | `contests` | `object` | Map containing `weekly` and `biweekly` contest info |
| `CONTEST_REMINDERS` | `contestReminders` | `object` | Map of booleans: `{ weekly_1h, weekly_3m, biweekly_1h, biweekly_3m }` |
| `LANG` | `lang` | `string` | Preferred UI language (`'zh'` or `'en'`) |
| `THEME` | `theme` | `string` | Preferred theme (`'dark'` or `'light'`) |
| `TRACKED_TABS` | `trackedLeetCodeTabs` | `array` | Active tab IDs currently viewing LeetCode problem pages |

---

## 5. Development & Contribution Rules

1. **No Build Steps**: Do not introduce bundlers (Webpack, Vite, Rollup) or transpliers unless explicitly requested. The project must remain zero-dependency Vanilla JS.
2. **Testing**: Test changes directly by reloading the unpacked extension via `chrome://extensions/`.
3. **i18n Maintenance**: Every new UI text string or background notification message must be added to both `zh` and `en` sections in `i18n.js`.
4. **Code Comments**: All code comments in source files (`.js`, `.css`, `.html`) must be written in English.
5. **No Direct Git Commits**: Never run `git commit` automatically; wait for explicit developer approval.
