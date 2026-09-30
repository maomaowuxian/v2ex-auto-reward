const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  AUTH_STATE_PATH,
  DAILY_URL,
  LOG_DIR,
  V2EX_HOME_URL,
  appendLog,
  ensureDir,
  notify,
  readJson,
  writeJson
} = require("./utils");
const { getSettings, saveSettings } = require("./settings");

function buildResult(status, message, extra = {}) {
  return {
    status,
    message,
    at: new Date().toISOString(),
    ...extra
  };
}

function loadAuthState() {
  return readJson(AUTH_STATE_PATH, { cookies: [] });
}

function saveAuthState(authState) {
  writeJson(AUTH_STATE_PATH, authState);
}

async function pageText(page) {
  const text = await page.locator("body").innerText();
  return text || "";
}

async function isLoggedOut(page) {
  const url = page.url().toLowerCase();
  const text = await pageText(page);
  const lower = text.toLowerCase();

  if (url.includes("/signin")) {
    return true;
  }

  return (
    (text.includes("登录") && !text.includes("登出") && !text.includes("退出")) ||
    lower.includes("sign in") ||
    lower.includes("you need to sign in first")
  );
}

async function alreadyClaimed(page) {
  const text = await pageText(page);
  const lower = text.toLowerCase();

  return (
    text.includes("已成功领取每日登录奖励") ||
    text.includes("每日登录奖励已领取") ||
    lower.includes("daily login reward claimed") ||
    lower.includes("already claimed")
  );
}

async function findClaimLink(page) {
  const candidates = [
    page.getByRole("button", { name: /领取/i }),
    page.getByRole("button", { name: /redeem/i }),
    page.getByRole("link", { name: /领取/i }),
    page.getByRole("link", { name: /redeem/i }),
    page.getByRole("link", { name: /每日登录奖励/i }),
    page.getByRole("link", { name: /daily login reward/i }),
    page.locator("input[type='button'][value*='领取']"),
    page.locator("input[type='submit'][value*='领取']"),
    page.locator("button:has-text('领取')"),
    page.locator("a[href*='mission/daily/redeem']"),
    page.locator("input[value*='领取']"),
    page.locator("input[value*='Redeem']"),
    page.locator("button").filter({ hasText: /领取|redeem/i })
  ];

  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    if (count > 0) {
      return locator.first();
    }
  }

  return null;
}

async function waitForClaimResult(page) {
  try {
    await Promise.race([
      page.waitForURL(/mission\/daily/, { timeout: 5000 }),
      page.locator("body").waitFor({ state: "visible", timeout: 5000 })
    ]);
  } catch (error) {
    // We fall back to a fresh reload below even if no navigation happens.
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch (error) {
    // V2EX may keep connections open; a manual refresh below is the real verification step.
  }

  await page.goto(DAILY_URL, { waitUntil: "domcontentloaded" });
}

async function saveDebugArtifacts(page) {
  ensureDir(LOG_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = path.join(LOG_DIR, `debug-${stamp}.html`);
  const textPath = path.join(LOG_DIR, `debug-${stamp}.txt`);

  fs.writeFileSync(htmlPath, await page.content(), "utf8");
  fs.writeFileSync(
    textPath,
    `URL: ${page.url()}\nTITLE: ${await page.title()}\n\n${await pageText(page)}`,
    "utf8"
  );

  appendLog(`Saved debug artifacts: ${path.basename(htmlPath)}, ${path.basename(textPath)}`);
}

function persistRunResult(result) {
  const next = {
    lastStatus: result.status,
    lastMessage: result.message,
    lastRunAt: result.at
  };

  if (result.status === "已领取" || result.status === "今日已领" || result.status === "已保存登录") {
    next.lastClaim = result.claimedAt || next.lastClaim;
  }

  saveSettings(next);
}

async function createContext({ headless }) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const authState = loadAuthState();

  if (authState.cookies && authState.cookies.length > 0) {
    await context.addCookies(authState.cookies);
  }

  return { browser, context };
}

async function runClaim(options = {}) {
  const showBrowser = Boolean(options.showBrowser);
  appendLog(`Starting claim run. showBrowser=${showBrowser}`);
  const { browser, context } = await createContext({ headless: !showBrowser });

  try {
    const page = await context.newPage();
    if (showBrowser) {
      await page.setViewportSize({ width: 1280, height: 900 });
    }

    await page.goto(V2EX_HOME_URL, { waitUntil: "domcontentloaded" });
    await page.goto(DAILY_URL, { waitUntil: "domcontentloaded" });

    if (await isLoggedOut(page)) {
      const result = buildResult("未登录", "还没有可用登录状态，请先点“登录 V2EX”。");
      appendLog(result.message);
      notify("V2EX 自动领奖励", result.message);
      persistRunResult(result);
      return result;
    }

    if (await alreadyClaimed(page)) {
      const result = buildResult("今日已领", "今天已经领过奖励了。", {
        claimedAt: new Date().toISOString()
      });
      appendLog(result.message);
      persistRunResult(result);
      return result;
    }

    const claimLink = await findClaimLink(page);
    if (!claimLink) {
      await saveDebugArtifacts(page);
      const result = buildResult("异常", "没有找到领取入口，可能是页面结构变了。");
      appendLog(result.message);
      notify("V2EX 自动领奖励", result.message);
      persistRunResult(result);
      return result;
    }

    await claimLink.click();
    await waitForClaimResult(page);

    if (await alreadyClaimed(page)) {
      const result = buildResult("已领取", "今日 V2EX 奖励领取成功。", {
        claimedAt: new Date().toISOString()
      });
      appendLog(result.message);
      notify("V2EX 自动领奖励", result.message);
      persistRunResult(result);
      return result;
    }

    await saveDebugArtifacts(page);
    const result = buildResult("异常", "点击领取后未检测到成功提示，请人工检查。");
    appendLog(result.message);
    notify("V2EX 自动领奖励", result.message);
    persistRunResult(result);
    return result;
  } catch (error) {
    const result = buildResult("异常", `执行失败: ${error.message}`);
    appendLog(`Claim run failed: ${error.stack || error.message}`);
    notify("V2EX 自动领奖励", result.message);
    persistRunResult(result);
    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}

function convertElectronCookie(cookie) {
  const domain = cookie.domain || ".v2ex.com";
  const secure = typeof cookie.secure === "boolean" ? cookie.secure : true;
  const sameSiteMap = {
    no_restriction: "None",
    lax: "Lax",
    strict: "Strict",
    unspecified: "Lax"
  };

  return {
    name: cookie.name,
    value: cookie.value,
    domain,
    path: cookie.path || "/",
    expires: typeof cookie.expirationDate === "number" ? cookie.expirationDate : -1,
    httpOnly: Boolean(cookie.httpOnly),
    secure,
    sameSite: sameSiteMap[cookie.sameSite] || "Lax"
  };
}

async function saveLoginCookies(cookies) {
  const filtered = cookies
    .filter((cookie) => (cookie.domain || "").includes("v2ex.com"))
    .map(convertElectronCookie);

  if (filtered.length === 0) {
    throw new Error("没有拿到 V2EX 登录信息，请确认已经登录成功后再关闭窗口。");
  }

  saveAuthState({ cookies: filtered, savedAt: new Date().toISOString() });
}

async function handleLoginSession(sessionLike) {
  const cookies = await sessionLike.cookies.get({});
  await saveLoginCookies(cookies);
  const result = buildResult("已保存登录", "登录状态已经保存，现在可以自动领取了。");
  appendLog(result.message);
  notify("V2EX 自动领奖励", result.message);
  persistRunResult(result);
  return result;
}

function getStatusSnapshot() {
  const settings = getSettings();
  const authState = loadAuthState();

  return {
    scheduleEnabled: settings.scheduleEnabled,
    scheduleHour: settings.scheduleHour,
    scheduleMinute: settings.scheduleMinute,
    launchAtLogin: settings.launchAtLogin,
    lastClaim: settings.lastClaim,
    lastStatus: settings.lastStatus,
    lastMessage: settings.lastMessage,
    lastRunAt: settings.lastRunAt,
    hasAuth: Boolean(authState.cookies && authState.cookies.length > 0)
  };
}

module.exports = {
  getStatusSnapshot,
  handleLoginSession,
  runClaim
};
