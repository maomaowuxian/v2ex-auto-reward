const elements = {
  statusMessage: document.querySelector("#statusMessage"),
  statusPill: document.querySelector("#statusPill"),
  lastRunAt: document.querySelector("#lastRunAt"),
  lastClaim: document.querySelector("#lastClaim"),
  scheduleText: document.querySelector("#scheduleText"),
  nextRunAt: document.querySelector("#nextRunAt"),
  scheduleEnabled: document.querySelector("#scheduleEnabled"),
  scheduleTime: document.querySelector("#scheduleTime"),
  launchAtLogin: document.querySelector("#launchAtLogin"),
  launchHint: document.querySelector("#launchHint"),
  appVersion: document.querySelector("#appVersion"),
  loginButton: document.querySelector("#loginButton"),
  claimButton: document.querySelector("#claimButton"),
  claimShowButton: document.querySelector("#claimShowButton"),
  logsButton: document.querySelector("#logsButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton")
};

function formatTimeValue(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) {
    return "还没有";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function applyState(state) {
  elements.statusMessage.textContent = state.statusMessage || state.lastMessage;
  elements.statusPill.textContent = state.statusSummary;
  elements.lastRunAt.textContent = formatDateTime(state.lastRunAt);
  elements.lastClaim.textContent = formatDateTime(state.lastClaim);
  elements.scheduleText.textContent = state.scheduleText;
  elements.nextRunAt.textContent = state.nextRunAt ? formatDateTime(state.nextRunAt) : "已关闭";
  elements.scheduleEnabled.checked = Boolean(state.scheduleEnabled);
  elements.scheduleTime.value = formatTimeValue(state.scheduleHour, state.scheduleMinute);
  elements.launchAtLogin.checked = Boolean(state.launchAtLogin);
  elements.launchAtLogin.disabled = !state.loginItemSupported;
  elements.launchHint.textContent = buildLaunchHint(state);
  elements.appVersion.textContent = state.appVersion ? `版本 ${state.appVersion}` : "版本未知";
}

function buildLaunchHint(state) {
  if (!state.loginItemSupported) {
    return "你现在是从开发模式运行，开机启动开关会在打包后的正式 App 里生效。";
  }

  if (state.loginItemStatus === "enabled" && state.loginItemOpenAtLogin) {
    return "已经通过系统启动代理启用开机自动启动。它不一定会出现在“登录时打开”的列表里。";
  }

  if (state.loginItemStatus === "not-registered") {
    return "当前还没有注册到系统启动代理。你可以重新勾选一次试试。";
  }

  if (state.loginItemStatus === "installed") {
    return "启动代理文件已经写入系统，但当前还没确认到它正在运行；通常重新登录一次就会生效。";
  }

  if (state.loginItemStatus === "error") {
    return "系统没有成功处理这个开机启动请求，建议重新打开 App 再试一次。";
  }

  if (state.loginItemStatus === "not-found") {
    return "系统里没有找到这个启动代理记录，通常说明这次开机启动还没有真正注册成功。";
  }

  if (state.loginItemStatus === "unknown") {
    return "当前还没有拿到系统返回的明确启动代理状态，建议重新勾选一次后再看是否变成已启用。";
  }

  return "如果你希望开机后自动出现在菜单栏，可以打开这个开关。";
}

async function loadState() {
  const state = await window.v2exApp.getState();
  applyState(state);
}

async function saveSettings() {
  const [hourText, minuteText] = (elements.scheduleTime.value || "08:00").split(":");
  await window.v2exApp.saveSettings({
    scheduleEnabled: elements.scheduleEnabled.checked,
    scheduleHour: Number(hourText),
    scheduleMinute: Number(minuteText),
    launchAtLogin: elements.launchAtLogin.checked
  });
}

async function runAction(action, pendingMessage) {
  try {
    elements.statusMessage.textContent = pendingMessage;
    const result = await action();

    if (result && result.message) {
      elements.statusMessage.textContent = result.message;
    }

    if (result && result.status === "异常") {
      await window.v2exApp.showError("操作失败", result.message);
    }
  } catch (error) {
    const message = error && error.message ? error.message : "发生了未知错误。";
    elements.statusMessage.textContent = message;
    await window.v2exApp.showError("操作失败", message);
  }
}

elements.loginButton.addEventListener("click", async () => {
  await runAction(() => window.v2exApp.runLogin(), "正在打开登录窗口…");
});

elements.claimButton.addEventListener("click", async () => {
  await runAction(() => window.v2exApp.runClaim({ showBrowser: false }), "正在尝试领取…");
});

elements.claimShowButton.addEventListener("click", async () => {
  await runAction(
    () => window.v2exApp.runClaim({ showBrowser: true }),
    "正在打开浏览器执行领取…"
  );
});

elements.logsButton.addEventListener("click", async () => {
  await window.v2exApp.openLogs();
});

elements.saveSettingsButton.addEventListener("click", async () => {
  await runAction(async () => {
    await saveSettings();
    await loadState();
    return { message: "自动执行时间已经更新。" };
  }, "正在保存设置…");
});

elements.scheduleEnabled.addEventListener("change", saveSettings);
elements.launchAtLogin.addEventListener("change", saveSettings);

window.v2exApp.onStateUpdate((state) => {
  applyState(state);
});

loadState();
