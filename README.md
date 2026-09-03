# LeetCode Reminder

An ultra-lightweight, battery-friendly Chrome extension (Manifest V3) that tracks your LeetCode Daily Challenge progress and Weekly/Biweekly contest schedules, sending timely notifications when action is needed.

## Key Features

- **Extreme Performance & Zero Persistent RAM**:
  - Built with 100% pure Vanilla JS & CSS without Webpack, React, or third-party bloatware. Total codebase is under 20 KB (reduced by 99% compared to typical extension bundles).
  - Built for Manifest V3 non-persistent Service Worker: completely suspends to 0 MB RAM when idle.
- **Silent Background Query**:
  - Direct GraphQL queries with single-request consolidation for both daily challenge and contest info.
  - Zero invisible tabs and zero DOM overhead.
- **Weekly & Biweekly Contest Tracking**:
  - Independent contest cards showing upcoming Weekly and Biweekly contests.
  - Live dynamic countdown timer (`Starts in Xd Xh` / `Starts in Xh Xm`).
  - Optional 1-hour before desktop notifications with dedicated reminder toggles.
- **Daily Challenge & Status Badges**:
  - Unfinished challenge (`NotStart`): Red `!` badge icon and hourly notifications.
  - Finished challenge (`Finish`): Cleans badge text and suppresses redundant network calls.
  - Not logged in (`not_logged_in`): Amber `!` badge icon with prompt to sign in.
- **Bilingual Support (i18n)**:
  - Instant one-click English / Traditional Chinese toggle (`EN` / `中`).
  - Localized notifications, cards, countdowns, and labels.
- **Duplicate Tab Prevention**:
  - Properly managed notification click handlers guaranteeing single-tab focus.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository root folder.
5. Pin the extension icon to your toolbar for quick status monitoring.

## Permissions

- `alarms`: Periodic hourly checks and scheduled contest reminders.
- `cookies`: Reads `LEETCODE_SESSION` from `leetcode.com` to check personal daily progress.
- `notifications`: Alerts user for unfinished daily challenges and upcoming contests.
- `storage`: Caches challenge states and user preferences (language, reminder toggles).

