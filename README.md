# LeetCode Reminder

A lightweight, battery-friendly Chrome extension (Manifest V3) that tracks your LeetCode Daily Challenge progress and Weekly/Biweekly contest schedules, sending timely notifications when action is needed.

## Features

- **Daily Challenge Tracking & Status Badges**:
  - Real-time status badge on the extension icon indicating unfinished daily challenges (`!`) or authentication status.
  - Periodic desktop notifications for pending daily problems.
  - One-click navigation directly to today's problem page.
- **Contest Schedules & Custom Reminders**:
  - Live countdown timers for upcoming Weekly and Biweekly contests.
  - Desktop reminder alerts before contest starts, with customizable 1-hour and 3-minute notification toggles.
- **Bilingual & Theme Support**:
  - Instant one-click toggle between English and Traditional Chinese (EN / 中).
  - Dark mode and Light mode UI toggles.

## Installation

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** and select the repository root folder.
5. Pin the extension icon to your Chrome toolbar for quick status monitoring.

## Usage Guide

- Click the extension icon in your Chrome toolbar to open the popup interface.
- View today's problem title, difficulty level, completion status, and countdown to the UTC 00:00 daily reset.
- Check upcoming contest start times and toggle desktop reminders according to your schedule.
- Click the refresh button anytime to manually trigger an instant status update.

## Permissions

This extension requests minimal permissions required strictly for its operation:

- `alarms`: Used to schedule periodic checks and timely contest reminder notifications.
- `cookies`: Reads the `LEETCODE_SESSION` cookie from `leetcode.com` to detect your daily challenge completion status.
- `notifications`: Sends desktop alerts for pending daily challenges and upcoming contests.
- `storage`: Saves user preferences (language, theme, reminder settings) and cached status locally.
- `host_permissions` (`https://leetcode.com/*`): Queries LeetCode's public GraphQL API for daily challenge and contest schedules.

## Privacy

All preferences and challenge cache are stored strictly on your local device via `chrome.storage.local`. No personal data, telemetry, or analytics are collected or sent to external servers.
