# LeetCode Daily Reminder (Ultra-Low Overhead)

An ultra-lightweight, battery-friendly Chrome extension (Manifest V3) that checks your LeetCode Daily Challenge progress in the background and sends hourly notifications if unfinished.

## Key Features

- **Extreme Performance & Zero Persistent RAM**:
  - Built with 100% pure Vanilla JS & micro-CSS without Webpack, React, or third-party bloatware. Total codebase is under 15 KB (reduced by 99% compared to traditional extension bundles).
  - Designed for Manifest V3 non-persistent Service Worker: completely suspends to 0 MB RAM when idle.
- **Silent Background Query**:
  - Uses direct background GraphQL requests without opening invisible tabs or consuming browser window resources.
- **Fix Duplicate Tabs Bug**:
  - Properly handles global notification click listener to guarantee opening only a single daily challenge tab.
- **Strict UTC 00:00 Reset Synchronization**:
  - Synchronizes daily reset strictly at UTC 00:00 (International Date Line standard).
  - Storage-first check: skips redundant network queries once solved for today.
- **Visual Status Badge**:
  - `OK` (Green): Today's challenge is completed.
  - `TODO` (Red): Unfinished challenge.
  - `!` (Amber): Log in session required.
- **Minimalist Dark UI Popup**:
  - Instant display of question ID, title, difficulty tag (Easy, Medium, Hard), and countdown to UTC 00:00 in your local time.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this directory (`leetcode-reminder`).
4. Pin the extension icon to your toolbar for quick status monitoring.

## Permissions

- `alarms`: Periodic hourly checks.
- `cookies`: Reads `LEETCODE_SESSION` cookie from `leetcode.com` to authenticate status.
- `notifications`: Alerts user when daily problem is unfinished or login is missing.
- `storage`: Caches daily state to prevent unnecessary network calls.
