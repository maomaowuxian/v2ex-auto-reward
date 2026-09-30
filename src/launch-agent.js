const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { appendLog, ensureDir } = require("./utils");

const LAUNCH_AGENT_LABEL = "com.rayma.v2ex-auto-reward";

function plistPath() {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

function currentGuiDomain() {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null ? null : `gui/${uid}`;
}

function bundledAppPath() {
  return path.resolve(process.execPath, "../../..");
}

function isStableInstallLocation(appPath = bundledAppPath()) {
  const normalized = path.resolve(appPath);
  return (
    normalized.startsWith("/Applications/") ||
    normalized.startsWith(path.join(os.homedir(), "Applications") + path.sep)
  );
}

function launchAgentPlistContent() {
  const appPath = bundledAppPath();
  const workingDirectory = path.dirname(appPath);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/open</string>
      <string>-g</string>
      <string>-a</string>
      <string>${escapeXml(appPath)}</string>
      <string>--args</string>
      <string>--launched-at-login</string>
    </array>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${escapeXml(workingDirectory)}</string>
  </dict>
</plist>
`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runLaunchctl(args) {
  return execFileSync("launchctl", args, { stdio: "pipe" }).toString("utf8");
}

function unloadExistingAgent() {
  const guiDomain = currentGuiDomain();
  const targetPath = plistPath();

  try {
    if (guiDomain) {
      runLaunchctl(["bootout", guiDomain, targetPath]);
    } else {
      runLaunchctl(["unload", targetPath]);
    }
  } catch (error) {
    // Ignore missing-agent errors; we only care that the next load can proceed.
  }
}

function installLaunchAgent() {
  if (!isStableInstallLocation()) {
    const error = new Error("请先把 App 放到“应用程序”目录，再开启开机自动启动。");
    error.code = "APP_NOT_INSTALLED";
    throw error;
  }

  const targetPath = plistPath();
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, launchAgentPlistContent(), "utf8");
  unloadExistingAgent();

  const guiDomain = currentGuiDomain();
  if (guiDomain) {
    runLaunchctl(["bootstrap", guiDomain, targetPath]);
  } else {
    runLaunchctl(["load", targetPath]);
  }

  appendLog(`Installed launch agent: ${targetPath}`);
}

function removeLaunchAgent() {
  const targetPath = plistPath();
  unloadExistingAgent();

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    appendLog(`Removed launch agent: ${targetPath}`);
  }
}

function getLaunchAgentStatus() {
  const targetPath = plistPath();
  const guiDomain = currentGuiDomain();
  const exists = fs.existsSync(targetPath);

  if (!exists) {
    return {
      supported: true,
      status: "not-registered",
      openAtLogin: false,
      mode: "launch-agent"
    };
  }

  try {
    if (guiDomain) {
      runLaunchctl(["print", `${guiDomain}/${LAUNCH_AGENT_LABEL}`]);
    } else {
      runLaunchctl(["list", LAUNCH_AGENT_LABEL]);
    }

    return {
      supported: true,
      status: "enabled",
      openAtLogin: true,
      mode: "launch-agent"
    };
  } catch (error) {
    return {
      supported: true,
      status: "installed",
      openAtLogin: true,
      mode: "launch-agent"
    };
  }
}

module.exports = {
  bundledAppPath,
  getLaunchAgentStatus,
  installLaunchAgent,
  isStableInstallLocation,
  removeLaunchAgent
};
