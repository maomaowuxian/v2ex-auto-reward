const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const buildDir = path.join(rootDir, "build");
const packageJson = require(path.join(rootDir, "package.json"));

const currentVersion = packageJson.version;
const keepDistFiles = new Set([
  `V2EX自动领奖励-${currentVersion}.dmg`,
  `V2EX自动领奖励-${currentVersion}.dmg.blockmap`
]);

function safeUnlink(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Removed file: ${path.relative(rootDir, filePath)}`);
  }
}

function safeRemoveDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed directory: ${path.relative(rootDir, dirPath)}`);
  }
}

function cleanupDist() {
  if (!fs.existsSync(distDir)) {
    return;
  }

  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const targetPath = path.join(distDir, entry.name);

    if (entry.isDirectory()) {
      continue;
    }

    if (entry.name === ".DS_Store" || entry.name === "builder-debug.yml" || entry.name === "builder-effective-config.yaml") {
      safeUnlink(targetPath);
      continue;
    }

    if (entry.name.startsWith("V2EX自动领奖励-") && !keepDistFiles.has(entry.name)) {
      safeUnlink(targetPath);
    }
  }
}

function cleanupBuild() {
  safeUnlink(path.join(buildDir, "icon-1024.png"));
  safeRemoveDir(path.join(buildDir, "icon.iconset"));
}

function main() {
  cleanupDist();
  cleanupBuild();
}

main();
