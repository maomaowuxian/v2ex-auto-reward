const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const buildDir = path.join(rootDir, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");
const pngPath = path.join(buildDir, "icon-1024.png");
const icnsPath = path.join(buildDir, "icon.icns");
const htmlPath = path.join(buildDir, "icon-source.html");

const iconSizes = [
  16,
  32,
  64,
  128,
  256,
  512,
  1024
];

async function renderBasePng() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`);
  await page.screenshot({ path: pngPath, omitBackground: true });
  await browser.close();
}

function recreateIconset() {
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });
}

function buildIconsetPngs() {
  for (const size of iconSizes) {
    const normalPath = path.join(iconsetDir, `icon_${size}x${size}.png`);
    execFileSync("sips", ["-z", String(size), String(size), pngPath, "--out", normalPath]);

    if (size < 1024) {
      const retina = size * 2;
      const retinaPath = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
      execFileSync("sips", ["-z", String(retina), String(retina), pngPath, "--out", retinaPath]);
    }
  }
}

function buildIcns() {
  execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);
}

async function main() {
  await renderBasePng();
  recreateIconset();
  buildIconsetPngs();
  buildIcns();
  console.log(`Built icon: ${icnsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
