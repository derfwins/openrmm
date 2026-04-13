const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle2", timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  // Login
  const inputs = await page.$$("input");
  if (inputs.length >= 2) {
    await inputs[0].type("admin");
    await inputs[1].type("admin");
  }
  const btn = await page.$("button");
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: "/tmp/ss/final_dashboard.png", fullPage: false });
  await browser.close();
  console.log("done");
})();