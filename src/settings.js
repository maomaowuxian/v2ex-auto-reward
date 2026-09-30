const { SETTINGS_PATH, readJson, writeJson } = require("./utils");

const DEFAULT_SETTINGS = {
  scheduleEnabled: true,
  scheduleHour: 8,
  scheduleMinute: 0,
  launchAtLogin: false,
  lastClaim: null,
  lastStatus: "未登录",
  lastMessage: "请先登录 V2EX。",
  lastRunAt: null
};

function sanitizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(number), min), max);
}

function getSettings() {
  const loaded = readJson(SETTINGS_PATH, DEFAULT_SETTINGS);

  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    scheduleHour: sanitizeNumber(loaded.scheduleHour, DEFAULT_SETTINGS.scheduleHour, 0, 23),
    scheduleMinute: sanitizeNumber(loaded.scheduleMinute, DEFAULT_SETTINGS.scheduleMinute, 0, 59),
    scheduleEnabled: Boolean(loaded.scheduleEnabled),
    launchAtLogin: Boolean(loaded.launchAtLogin)
  };
}

function saveSettings(nextSettings) {
  const merged = {
    ...getSettings(),
    ...nextSettings
  };

  writeJson(SETTINGS_PATH, merged);
  return merged;
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings
};
