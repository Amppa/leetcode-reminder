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
├── background.js        # Background Service Worker (Alarms, GraphQL API, Notifications, Badge)
├── popup.html           # Popup UI layout structure
├── popup.js             # Popup interaction logic, theme, i18n, & countdowns
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
- **Non-persistent execution**: Runs only when triggered by Chrome alarms, popup messages, or startup/install events.
- **Cookie Auth Check**: Reads `LEETCODE_SESSION` & `csrftoken` cookies from domain `leetcode.com` via `chrome.cookies.getAll`.
- **GraphQL Integration**:
  - Sends POST request to `https://leetcode.com/graphql`.
  - Executes consolidated `dailyAndContests` query fetching `activeDailyCodingChallengeQuestion` and `topTwoContests` in a single HTTP request.
- **Badge Management**:
  - `Finish`: Clears badge (`""`).
  - `NotStart`: Sets red `!` badge (`#EF4444`).
  - `not_logged_in`: Sets amber `!` badge (`#F59E0B`).
- **Alarms**:
  - `leetcode_daily_alarm`: Periodic check every 60 minutes.
  - `leetcode_utc_midnight_alarm`: Scheduled precisely at UTC 00:00:15 (UTC midnight + 15s buffer to avoid server race conditions).
  - `contest_alarm_[weekly|biweekly]_[1h|3m]`: Scheduled 1 hour and 3 minutes before contest start times.
- **Notifications**:
  - `chrome.notifications.create` for unfinished daily problems, login prompts, and upcoming contest reminders.
  - `chrome.notifications.onClicked`: Single tab focus handler preventing duplicate tabs.

### 3.2 Popup Interface (`popup.html`, `popup.js`, `popup.css`)
- **SWR (Stale-While-Revalidate) Rendering**:
  - Immediately loads cached state from `chrome.storage.local` upon opening popup.
  - Triggers asynchronous `check_status_now` message to `background.js` if today's daily problem is not marked `Finish`.
- **Theme Engine**:
  - Default dark theme. Light mode activated by setting `data-theme="light"` on `<html>`.
  - Color palette driven by CSS variables in `popup.css` (`--bg-primary`, `--card-bg`, `--status-pending`, `--status-warning`, `--status-success`).
- **Live Countdowns**:
  - Daily UTC reset countdown (`resetCountdown`) calculating time remaining until UTC 00:00.
  - Contest countdowns (`weeklyCountdown`, `biweeklyCountdown`) displaying formatted `Starts in Xd Xh` / `Starts in Xh Xm`.
- **User Preference Controls**:
  - Language toggle (`EN` / `中`).
  - Theme toggle (Sun / Moon icon).
  - Individual contest reminder checkboxes (1h and 3m toggles for Weekly and Biweekly contests).

### 3.3 Internationalization (`i18n.js` & `_locales/`)
- `_locales/`: Provides localized Chrome Store extension name (`appName`) and description (`appDesc`).
- `i18n.js`: Contains `I18N` object with dictionary keys for `zh` and `en` used dynamically by `popup.js` and `background.js`.

---

## 4. Chrome Storage Schema (`chrome.storage.local`)

| Key | Type | Description |
|---|---|---|
| `isLoggedIn` | `boolean` | Indicates if `LEETCODE_SESSION` cookie is present |
| `lastStatus` | `string` | Status code: `'Finish'`, `'NotStart'`, `'not_logged_in'`, or `'error'` |
| `lastCheckTime` | `string` | Formatted local time string of last status check |
| `todayUtc` | `string` | Current UTC date string (`YYYY-MM-DD`) |
| `lastCompletedUtcDate` | `string` | UTC date string when daily challenge was completed |
| `questionId` | `string` | Frontend question ID (e.g., `"1"`) |
| `questionTitle` | `string` | Problem title (e.g., `"Two Sum"`) |
| `questionDifficulty` | `string` | Difficulty level (`"Easy"`, `"Medium"`, `"Hard"`) |
| `questionLink` | `string` | Direct URL link to problem page |
| `contests` | `object` | Map containing `weekly` and `biweekly` contest info (`title`, `startTime`, `duration`, `link`) |
| `contestReminders` | `object` | Map of booleans: `{ weekly_1h, weekly_3m, biweekly_1h, biweekly_3m }` |
| `lang` | `string` | Preferred UI language (`'zh'` or `'en'`) |
| `theme` | `string` | Preferred theme (`'dark'` or `'light'`) |

---

## 5. Development & Contribution Rules

1. **No Build Steps**: Do not introduce bundlers (Webpack, Vite, Rollup) or transpliers unless explicitly requested. The project must remain zero-dependency Vanilla JS.
2. **Testing**: Test changes directly by reloading the unpacked extension via `chrome://extensions/`.
3. **i18n Maintenance**: Every new UI text string or background notification message must be added to both `zh` and `en` sections in `i18n.js`.
4. **Code Comments**: All code comments in source files (`.js`, `.css`, `.html`) must be written in English.
5. **No Direct Git Commits**: Never run `git commit` automatically; wait for explicit developer approval.
