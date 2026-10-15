import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const [,, url, out, w = 700, h = 2400, actions] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => logs.push(m.type() + ": " + m.text()));
page.on("pageerror", (e) => logs.push("PAGEERROR: " + e.message));
await page.goto(url);
await page.waitForFunction(() => window.ready, null, { timeout: 10000 });
await page.waitForTimeout(300);
if (actions) {
  const mod = await import(actions);
  await mod.default(page);
}
await page.screenshot({ path: out, fullPage: true });
console.log(logs.join("\n"));
await browser.close();
