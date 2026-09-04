// i18n Localization Dictionary for LeetCode Reminder
// Pure JS object, zero dependencies

const I18N = {
  zh: {
    langBtn: 'EN',
    langBtnTitle: '切換為英文 / Switch to English',
    theme_to_light: '切換至淺色模式',
    theme_to_dark: '切換至深色模式',
    refreshTitle: '立即重新檢查',
    subtitle: '每日挑戰 & 周賽提醒',
    status_finish: '今日已解題完成！',
    status_pending: '今日尚未完成',
    status_not_logged_in: '未登入 LeetCode',
    status_error: '檢查連線異常',
    status_loading: '載入中...',
    title_default: '今日題目',
    title_not_logged_in: '請點擊此處登入 LeetCode 帳號',
    title_error: '無法取得題目資訊，請檢查網路或稍後重試',
    label_last_check: '上次檢查',
    label_reset_countdown: 'UTC 00:00 換日',
    tag_solved: 'Solved',
    tag_todo: 'Todo',
    tag_auth: 'Auth',
    tag_error: 'Error',
    time_remaining: (h, m) => `剩 ${h}小時${m}分`,
    weekly_title_default: 'Weekly Contest',
    biweekly_title_default: 'Biweekly Contest',
    contest_reminder_1h: '1 小時前提醒',
    contest_reminder_3m: '3 分鐘前提醒',
    contest_calc: '計算中...',
    contest_started: '比賽進行中',
    contest_ended: '已結束，等待更新',
    contest_countdown: (days, hours, mins) => {
      if (days > 0) return `距開始：${days}天 ${hours}小時`;
      if (hours > 0) return `距開始：${hours}小時 ${mins}分`;
      return `距開始：${mins}分鐘`;
    }
  },
  en: {
    langBtn: '中',
    langBtnTitle: 'Switch to Chinese / 切換為中文',
    theme_to_light: 'Switch to light mode',
    theme_to_dark: 'Switch to dark mode',
    refreshTitle: 'Check status now',
    subtitle: 'Daily & Contest Reminder',
    status_finish: 'Completed today!',
    status_pending: 'Not completed yet',
    status_not_logged_in: 'Not logged in',
    status_error: 'Connection error',
    status_loading: 'Loading...',
    title_default: 'Daily Challenge',
    title_not_logged_in: 'Click here to log in to LeetCode',
    title_error: 'Unable to fetch challenge. Please retry',
    label_last_check: 'Last checked',
    label_reset_countdown: 'Next UTC 00:00',
    tag_solved: 'Solved',
    tag_todo: 'Todo',
    tag_auth: 'Auth',
    tag_error: 'Error',
    time_remaining: (h, m) => `${h}h ${m}m left`,
    weekly_title_default: 'Weekly Contest',
    biweekly_title_default: 'Biweekly Contest',
    contest_reminder_1h: '1hr before',
    contest_reminder_3m: '3min before',
    contest_calc: 'Calculating...',
    contest_started: 'In progress',
    contest_ended: 'Ended, waiting for update',
    contest_countdown: (days, hours, mins) => {
      if (days > 0) return `Starts in ${days}d ${hours}h`;
      if (hours > 0) return `Starts in ${hours}h ${mins}m`;
      return `Starts in ${mins}m`;
    }
  }
};
