const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PROJECT_ROOT_DIR = path.resolve(__dirname, "..");
const ELECTRON_APP_DIR_NAME = "V2EX自动领奖励";

function isElectronRuntime() {
  return Boolean(process.versions && process.versions.electron);
}

function resolveRootDir() {
  if (!isElectronRuntime()) {
    return PROJECT_ROOT_DIR;
  }

  if (process.env.V2EX_APP_DATA_DIR) {
    return process.env.V2EX_APP_DATA_DIR;
  }

  return path.join(os.homedir(), "Library", "Application Support", ELECTRON_APP_DIR_NAME);
}

const ROOT_DIR = resolveRootDir();
const DATA_DIR = path.join(ROOT_DIR, "data");
const PROFILE_DIR = path.join(DATA_DIR, "profile");
const LOG_DIR = path.join(ROOT_DIR, "logs");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const AUTH_STATE_PATH = path.join(DATA_DIR, "auth-state.json");
const DAILY_URL = "https://www.v2ex.com/mission/daily";
const V2EX_HOME_URL = "https://www.v2ex.com/";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function logFilePath() {
  return path.join(LOG_DIR, `${todayKey()}.log`);
}

function appendLog(message) {
  ensureDir(LOG_DIR);
  fs.appendFileSync(logFilePath(), `[${timestamp()}] ${message}\n`, "utf8");
}

function notify(title, message) {
  try {
    execFileSync("osascript", [
      "-e",
      "on run argv",
      "-e",
      "display notification (item 2 of argv) with title (item 1 of argv)",
      "-e",
      "end run",
      String(title),
      String(message).replace(/\s+/g, " ").trim()
    ]);
  } catch (error) {
    appendLog(`Notification failed: ${error.message}`);
  }
}

function parseArgs(argv) {
  return {
    showBrowser: argv.includes("--show-browser")
  };
}

function readJson(filePath, fallbackValue) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

module.exports = {
  DAILY_URL,
  DATA_DIR,
  LOG_DIR,
  PROFILE_DIR,
  ROOT_DIR,
  AUTH_STATE_PATH,
  SETTINGS_PATH,
  V2EX_HOME_URL,
  appendLog,
  ensureDir,
  isElectronRuntime,
  notify,
  parseArgs,
  readJson,
  todayKey,
  writeJson
};
