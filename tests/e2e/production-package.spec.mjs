import { launchExtension } from "../browser.mjs";
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractZip } from "../../scripts/zip-utils.mjs";

// This suite loads production bytes. It never edits the manifest or adds an extension test harness.
let context, extensionId, worker, server, siteUrl, temporary, extensionPath, packageHash, requests = 0;
const root = path.resolve(import.meta.dirname, "../..");
const archive = () => path.resolve(root, process.env.BAPT_E2E_PACKAGE || `dist/brave-auto-page-translator-${JSON.parse(readFileSync(path.join(root, "manifest.json"))).version}.zip`);
async function extensionPage(file) { const page = await context.newPage(); await page.goto(`chrome-extension://${extensionId}/${file}`); return page; }
async function seed(overrides = {}) {
  await worker.evaluate(async (overrides) => {
    const { DEFAULT_SETTINGS, CONSENT_VERSION, SETTINGS_SCHEMA_VERSION, saveSettings, saveLocalState } = await import(chrome.runtime.getURL("src/settings.js"));
    await saveSettings({ ...DEFAULT_SETTINGS, excludedHosts: [], ...overrides });
    await saveLocalState({ privacyConsentVersion: CONSENT_VERSION, privacyConsentAt: new Date().toISOString(), settingsSchemaVersion: SETTINGS_SCHEMA_VERSION });
    await chrome.runtime.sendMessage({ type: "refresh-settings" });
  }, overrides);
}
async function grantHost(host) {
  // Grant optional host access through the browser's extension-management API in this disposable profile.
  // This tests real browser permission state, not a manifest with mandatory blanket permissions.
  const management = await context.newPage(); await management.goto("chrome://extensions");
  await management.evaluate(({ extensionId, host }) => new Promise((resolve, reject) => {
    chrome.developerPrivate.addHostPermission({ extensionId, host }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve());
  }), { extensionId, host });
  await management.close();
}

test.beforeAll(async () => {
  temporary = mkdtempSync(path.join(tmpdir(), "bapt-production-")); extensionPath = path.join(temporary, "extension");
  extractZip(archive(), extensionPath);
  packageHash = createHash("sha256").update(readFileSync(archive())).digest("hex");
  server = createServer(async (request, response) => {
    if (request.method === "POST") {
      requests++;
      const chunks = []; for await (const part of request) chunks.push(part);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const values = Array.isArray(input.q) ? input.q : [input.q];
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ translatedText: values.map((text) => text.replaceAll("Hola mundo", "Hello world")) })); return;
    }
    response.writeHead(200, { "content-type": "text/html" }); response.end('<html lang="es"><h1>Hola mundo</h1><p>Este texto está en español.</p></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); siteUrl = `http://127.0.0.1:${server.address().port}`;
  context = await launchExtension(path.join(temporary, "profile"), extensionPath);
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker"); extensionId = new URL(worker.url()).host;
});
test.afterAll(async () => {
  if (context) {
    const manifest = JSON.parse(readFileSync(path.join(extensionPath, "manifest.json"), "utf8"));
    expect(manifest).toEqual(JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")));
    expect(createHash("sha256").update(readFileSync(archive())).digest("hex")).toBe(packageHash);
    await context.close();
  }
  await new Promise((resolve) => server?.close(resolve));
  if (temporary) rmSync(temporary, { force: true, recursive: true });
});
test.beforeEach(async () => { for (const page of context.pages()) await page.close(); });

test("fresh production installation has no blanket host access and completes on-device-only consent", async () => {
  expect((await worker.evaluate(() => chrome.permissions.getAll())).origins || []).toEqual([]);
  const page = await extensionPage("onboarding/onboarding.html");
  await page.locator("#deviceAvailability").waitFor({ state: "visible" });
  await expect(page.locator("#deviceAvailability")).not.toBeEmpty();
  await page.locator("#providerMode").selectOption("on-device");
  await page.locator("#allowGoogleWebFallback").uncheck();
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Accept and finish setup" }).click();
  await expect(page.locator("#status")).toContainText("Setup complete");
  expect((await worker.evaluate(() => chrome.permissions.getAll())).origins || []).toEqual([]);
  expect(requests).toBe(0);
});

test("workspace follows tab activation and navigation without saving rules to the wrong website", async () => {
  await seed(); await grantHost("http://127.0.0.1/*"); await grantHost("http://localhost/*");
  const panel = await extensionPage("sidepanel/sidepanel.html");
  const site = await context.newPage(); await site.goto(siteUrl); await site.bringToFront();
  await panel.locator("details").first().evaluate((element) => { element.open = true; });
  await expect(panel.locator("#siteTitle")).toHaveText("127.0.0.1");
  const other = await context.newPage(); await other.goto(siteUrl.replace("127.0.0.1", "localhost")); await other.bringToFront();
  await expect(panel.locator("#siteTitle")).toHaveText("localhost");
  await other.goto(`${siteUrl}/next`);
  await expect(panel.locator("#siteTitle")).toHaveText("127.0.0.1");
  await site.bringToFront();
  await expect(panel.locator("#siteTitle")).toHaveText("127.0.0.1");
});

test("workspace re-enables controls after a rejected request and does not copy error messages", async () => {
  await seed(); await grantHost("http://127.0.0.1/*"); const panel = await extensionPage("sidepanel/sidepanel.html");
  const site = await context.newPage(); await site.goto(siteUrl); await site.bringToFront();
  await expect(panel.locator("#siteTitle")).toHaveText("127.0.0.1");
  await panel.locator("#workspaceText").fill("Hola mundo");
  // Fault injection changes only this test page's API wrapper, never the package or permission declarations.
  await panel.evaluate(() => { const real = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = (value) => value.type === "translate-panel-text" ? Promise.reject(new Error("Connection lost for test")) : real(value); });
  await panel.locator("#translateText").click();
  await expect(panel.locator("#translateText")).toBeEnabled();
  await expect(panel.locator("#workspaceResult")).toContainText("Connection lost for test");
  await expect(panel.locator("#copyResult")).toBeDisabled();
});

test("production permissions and approved provider support translation and original restoration", async () => {
  await seed({ providerMode: "libretranslate" }); await grantHost("http://127.0.0.1/*");
  await worker.evaluate(async (endpoint) => {
    const { loadLocalState, saveLocalState, recordProviderConsents } = await import(chrome.runtime.getURL("src/settings.js"));
    await saveLocalState(recordProviderConsents({ ...await loadLocalState(), libreTranslateEndpoint: endpoint }, ["libretranslate"]));
    await chrome.runtime.sendMessage({ type: "refresh-settings" });
  }, `${siteUrl}/translate`);
  const site = await context.newPage(); await site.goto(siteUrl); await site.bringToFront();
  const panel = await extensionPage("sidepanel/sidepanel.html"); await site.bringToFront();
  await expect(panel.locator("#siteTitle")).toHaveText("127.0.0.1");
  await panel.locator("#translatePage").click();
  await expect(site.locator("h1")).toHaveText("Hello world");
  await expect(panel.locator("#restorePage")).toBeEnabled();
  await panel.locator("#restorePage").click();
  await expect(site.locator("h1")).toHaveText("Hola mundo");
  expect(requests).toBeGreaterThan(0);
});

test("favourites and glossary editing preserve existing preferences", async () => {
  await seed({ targetLanguage: "fr", siteProfiles: { "example.com": { targetLanguage: "ja" } }, glossary: [{ source: "Keep", replacement: "Preserve" }] });
  const options = await extensionPage("options/options.html");
  await expect(options.locator('[data-field="source"]')).toHaveValue("Keep");
  await options.locator('[data-field="replacement"]').fill("Retain");
  await options.locator("#addGlossary").click();
  await options.locator('[data-field="source"]').last().fill("Hello");
  await options.locator('[data-field="replacement"]').last().fill("Bonjour");
  await options.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(options.locator("#saveStatus")).toHaveText("Settings saved");
  const saved = await worker.evaluate(async () => (await import(chrome.runtime.getURL("src/settings.js"))).loadSettings());
  expect(saved.glossary).toEqual([{ source: "Keep", replacement: "Retain" }, { source: "Hello", replacement: "Bonjour" }]);
  expect(saved.siteProfiles["example.com"].targetLanguage).toBe("ja"); expect(saved.targetLanguage).toBe("fr");
  const popup = await extensionPage("popup/popup.html");
  await expect(popup.locator("#targetLanguage")).toHaveValue("fr");
  await popup.locator("#favouriteLanguage").click();
  await expect(popup.locator("#favouriteLanguage")).toHaveAttribute("aria-pressed", "true");
  await popup.reload();
  await expect(popup.locator("#targetLanguage option").first()).toHaveAttribute("value", "fr");
});

test("visual surfaces fit at narrow widths and expose translated controls", async () => {
  await seed(); const screenshots = path.join(root, "test-results", "visual"); mkdirSync(screenshots, { recursive: true });
  for (const [file, width] of [["popup/popup.html", 380], ["sidepanel/sidepanel.html", 320], ["options/options.html", 1100], ["onboarding/onboarding.html", 1100]]) {
    const page = await extensionPage(file); await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("select").first().locator("option").first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(screenshots, file.replaceAll("/", "-") + ".png"), fullPage: true });
    await page.evaluate(async () => {
      const catalogue = await fetch(chrome.runtime.getURL("_locales/ar/messages.json")).then((r) => r.json());
      chrome.i18n.getUILanguage = () => "ar"; chrome.i18n.getMessage = (key) => catalogue[key]?.message || key;
      (await import(chrome.runtime.getURL("src/i18n.js"))).applyTranslations();
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(screenshots, "ar-" + file.replaceAll("/", "-") + ".png"), fullPage: true });
    await page.close();
  }
});
