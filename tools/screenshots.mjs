// Screenshot tour of a Ghostfolio user.
//
//   GF_URL=https://ghostfolio.example GF_JWT_CMD="<command that prints a JWT>" node tools/screenshots.mjs
//
// The JWT is obtained in-process from GF_JWT_CMD and is never written to disk or
// logged. Output: docs/screenshots/NN-<page>.png (full page, 1440px wide).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// PLAYWRIGHT_MODULE may point at a playwright install outside this repo (path to its index.mjs).
const pw = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(pw);

const base = (process.env.GF_URL ?? '').replace(/\/$/, '');
const jwt = execSync(process.env.GF_JWT_CMD, { encoding: 'utf8' }).trim();
if (!base || !jwt) throw new Error('GF_URL and GF_JWT_CMD are required');

const pages = [
  ['home', '/en/home/overview'],
  ['holdings', '/en/home/holdings'],
  ['summary', '/en/home/summary'],
  ['analysis', '/en/portfolio/analysis'],
  ['allocations', '/en/portfolio/allocations'],
  ['activities', '/en/portfolio/activities'],
  ['xray', '/en/portfolio/x-ray'],
  ['fire', '/en/portfolio/fire'],
  ['accounts', '/en/accounts'],
  ['settings', '/en/account'],
  ['access', '/en/account/access'],
];

mkdirSync('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  colorScheme: 'light',
});
const page = await ctx.newPage();
await page.goto(`${base}/en/auth/${jwt}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(4000);
const diag = await page.evaluate(async () => {
  const t = localStorage.getItem('auth-token');
  const r = await fetch('/api/v1/user', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  return { hasToken: !!t, userStatus: r.status };
});
console.log('after auth:', page.url().replace(base, ''), JSON.stringify(diag));

let i = 1;
for (const [name, path] of pages) {
  try {
    await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(6000);
    const file = `docs/screenshots/${String(i).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 60000 });
    console.log('ok', file, page.url().replace(base, ''));
  } catch (e) {
    console.log('FAIL', name, String(e.message).split('\n')[0]);
  }
  i++;
}
await browser.close();
