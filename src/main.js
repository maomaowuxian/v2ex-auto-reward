const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  dialog,
  session,
  shell
} = require("electron");
const { getSettings, saveSettings } = require("./settings");
const { DAILY_URL, LOG_DIR, ROOT_DIR } = require("./utils");
const {
  getLaunchAgentStatus,
  installLaunchAgent,
  removeLaunchAgent
} = require("./launch-agent");
const { getStatusSnapshot, handleLoginSession, runClaim } = require("./v2ex-service");

let tray = null;
let mainWindow = null;
let loginWindow = null;
let scheduleTimer = null;
let statusRefreshTimer = null;
let currentTask = null;
let suppressAutoShowOnLaunch = false;
let loginItemSupported = true;
let loginItemStatus = "unknown";
let loginItemOpenAtLogin = false;

if (app.dock) {
  app.dock.hide();
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function compactStatusLabel(statusSummary) {
  switch (statusSummary) {
    case "已领取":
    case "今日已领":
      return "已领";
    case "尚未领取":
    case "待领取":
    case "等待执行":
      return "待领";
    case "未登录":
      return "未登";
    case "登录中":
      return "登录";
    default:
      return statusSummary;
  }
}

function shouldSuppressWindowOnLaunch() {
  const launchedByFlag = process.argv.includes("--launched-at-login");

  if (launchedByFlag) {
    return true;
  }

  try {
    const loginItemState = app.getLoginItemSettings();
    if (loginItemState && loginItemState.wasOpenedAtLogin) {
      return true;
    }
  } catch (error) {
    // Fall through to uptime heuristic below.
  }

  // Fallback for macOS login-item launches that do not reliably surface
  // through Electron. If the system booted recently, prefer starting hidden.
  return os.uptime() < 180;
}

function computeTodayRunDate(settings) {
  const today = new Date();
  today.setHours(settings.scheduleHour, settings.scheduleMinute, 0, 0);
  return today;
}

function isSameLocalDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function computeNextRunDate(settings) {
  const now = new Date();
  const next = computeTodayRunDate(settings);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function deriveDisplayState(settings, status) {
  const now = new Date();
  const todayRunDate = computeTodayRunDate(settings);
  const lastClaimDate = status.lastClaim ? new Date(status.lastClaim) : null;
  const claimedForToday = lastClaimDate && isSameLocalDay(lastClaimDate, now);

  if (claimedForToday) {
    if (lastClaimDate < todayRunDate) {
      return {
        statusSummary: "已领取",
        statusMessage: `今天已提前领取成功，领取时间为 ${String(lastClaimDate.getHours()).padStart(
          2,
          "0"
        )}:${String(lastClaimDate.getMinutes()).padStart(2, "0")} 。`
      };
    }

    return {
      statusSummary: "已领取",
      statusMessage: "今日 V2EX 奖励领取成功。"
    };
  }

  if (
    settings.scheduleEnabled &&
    (status.lastStatus === "今日已领" || status.lastStatus === "已领取")
  ) {
    if (now < todayRunDate) {
      return {
        statusSummary: "尚未领取",
        statusMessage: `今天的奖励还没开始领取，将在 ${formatTime(
          settings.scheduleHour,
          settings.scheduleMinute
        )} 自动执行。`
      };
    }

    return {
      statusSummary: "尚未领取",
      statusMessage: `今天还没有领取奖励，等待下一次执行或你手动点击领取。`
    };
  }

  return {
    statusSummary: status.lastStatus,
    statusMessage: status.lastMessage
  };
}

function getUiState() {
  const settings = getSettings();
  const status = getStatusSnapshot();
  const nextRunAt = settings.scheduleEnabled ? computeNextRunDate(settings).toISOString() : null;
  const displayState = deriveDisplayState(settings, status);

  return {
    ...status,
    appVersion: app.getVersion(),
    loginItemSupported,
    loginItemStatus,
    loginItemOpenAtLogin,
    nextRunAt,
    statusSummary: displayState.statusSummary,
    statusMessage: displayState.statusMessage,
    scheduleText: settings.scheduleEnabled
      ? `每天 ${formatTime(settings.scheduleHour, settings.scheduleMinute)}`
      : "已关闭自动执行"
  };
}

function sendState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("state:update", getUiState());
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const state = getUiState();
  tray.setTitle(compactStatusLabel(state.statusSummary));
  tray.setToolTip(`V2EX 自动领奖励\n${state.statusMessage}`);

  const menu = Menu.buildFromTemplate([
    { label: `状态: ${state.statusSummary}`, enabled: false },
    { label: state.scheduleText, enabled: false },
    { type: "separator" },
    { label: "打开面板", click: () => showWindow() },
    { label: "立即领取一次", click: () => triggerClaim({ showBrowser: false }) },
    { label: "打开浏览器领取", click: () => triggerClaim({ showBrowser: true }) },
    { label: "重新登录 V2EX", click: () => triggerLogin() },
    { type: "separator" },
    { label: "打开日志目录", click: () => shell.openPath(LOG_DIR) },
    { label: "退出", click: () => app.quit() }
  ]);

  tray.setContextMenu(menu);
}

function scheduleNextRun() {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  const settings = getSettings();
  if (!settings.scheduleEnabled) {
    updateTrayMenu();
    sendState();
    return;
  }

  const nextRunDate = computeNextRunDate(settings);
  const delay = Math.max(nextRunDate.getTime() - Date.now(), 1000);

  scheduleTimer = setTimeout(async () => {
    await triggerClaim({ showBrowser: false, source: "schedule" });
    scheduleNextRun();
  }, delay);

  updateTrayMenu();
  sendState();
}

function scheduleStatusRefresh() {
  if (statusRefreshTimer) {
    clearInterval(statusRefreshTimer);
    statusRefreshTimer = null;
  }

  // Refresh derived UI state periodically so the menu bar updates across midnight
  // even when no claim action runs.
  statusRefreshTimer = setInterval(() => {
    updateTrayMenu();
    sendState();
  }, 60 * 1000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 560,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    title: "V2EX 自动领奖励",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("ready-to-show", () => {
    if (!suppressAutoShowOnLaunch) {
      mainWindow.show();
    }
    sendState();
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow.show();
  mainWindow.focus();
  sendState();
}

async function runSerialized(task) {
  if (currentTask) {
    return currentTask;
  }

  currentTask = task().finally(() => {
    currentTask = null;
    updateTrayMenu();
    sendState();
  });

  return currentTask;
}

async function triggerClaim(options) {
  return runSerialized(async () => {
    const result = await runClaim(options);
    updateTrayMenu();
    sendState();
    return result;
  });
}

async function triggerLogin() {
  return runSerialized(async () => {
    const result = await openLoginWindow();
    updateTrayMenu();
    sendState();
    return result;
  });
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show();
    loginWindow.focus();
    return Promise.resolve({
      status: "登录中",
      message: "登录窗口已经打开，请在里面完成登录。"
    });
  }

  const loginSession = session.fromPartition("persist:v2ex-login");
  loginWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    title: "登录 V2EX",
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:v2ex-login"
    }
  });
  loginWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  );

  appendLoginHint("登录窗口已打开，请在这个窗口里完成 V2EX 登录，然后直接关闭窗口。");
  loginWindow.loadURL(DAILY_URL);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    loginWindow.webContents.once(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        finish({
          status: "异常",
          message: `登录页面加载失败：${errorDescription} (${errorCode}) ${validatedURL || ""}`.trim()
        });
      }
    );

    loginWindow.on("closed", async () => {
      try {
        const result = await handleLoginSession(loginSession);
        loginWindow = null;
        finish(result);
      } catch (error) {
        loginWindow = null;
        finish({
          status: "异常",
          message: error.message
        });
      }
    });
  });
}

function appendLoginHint(message) {
  const current = getStatusSnapshot();
  saveSettings({
    lastStatus: current.lastStatus,
    lastMessage: message
  });
}

function syncLaunchAtLogin() {
  const settings = getSettings();

  if (!app.isPackaged) {
    loginItemSupported = false;
    loginItemStatus = "dev-mode";
    loginItemOpenAtLogin = false;
    return;
  }

  try {
    if (settings.launchAtLogin) {
      installLaunchAgent();
    } else {
      removeLaunchAgent();
    }

    const current = getLaunchAgentStatus();
    loginItemSupported = current.supported;
    loginItemStatus = current.status;
    loginItemOpenAtLogin = current.openAtLogin;
    return current;
  } catch (error) {
    loginItemSupported = false;
    loginItemStatus = "error";
    loginItemOpenAtLogin = false;
    return null;
  }
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  updateTrayMenu();
}

function registerIpc() {
  ipcMain.handle("state:get", () => getUiState());
  ipcMain.handle("claim:run", async (_event, options) => triggerClaim(options || {}));
  ipcMain.handle("login:run", async () => triggerLogin());
  ipcMain.handle("settings:save", async (_event, partial) => {
    const next = saveSettings({
      scheduleEnabled: partial.scheduleEnabled,
      scheduleHour: partial.scheduleHour,
      scheduleMinute: partial.scheduleMinute,
      launchAtLogin: partial.launchAtLogin
    });

    syncLaunchAtLogin();
    scheduleNextRun();
    return {
      ...next,
      loginItemSupported,
      loginItemStatus,
      loginItemOpenAtLogin
    };
  });
  ipcMain.handle("logs:open", () => shell.openPath(LOG_DIR));
  ipcMain.handle("dialog:error", (_event, title, body) =>
    dialog.showMessageBox({
      type: "error",
      title,
      message: title,
      detail: body
    })
  );
}

async function bootstrap() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();
  suppressAutoShowOnLaunch = shouldSuppressWindowOnLaunch();
  process.env.V2EX_APP_DATA_DIR = ROOT_DIR;
  syncLaunchAtLogin();
  registerIpc();
  createWindow();
  createTray();
  scheduleNextRun();
  scheduleStatusRefresh();
  updateTrayMenu();
  sendState();
}

app.on("second-instance", () => {
  showWindow();
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.on("activate", () => {
  if (suppressAutoShowOnLaunch) {
    suppressAutoShowOnLaunch = false;
    return;
  }

  showWindow();
});

bootstrap().catch((error) => {
  console.error(error);
  app.quit();
});
