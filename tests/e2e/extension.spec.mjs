import { test, expect, chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const extensionPath = path.resolve(import.meta.dirname, "../../.e2e-extension");
let server;
let frameServer;
let baseUrl;
let frameBaseUrl;
let context;
let worker;
let profileDirectory;

function translate(value) {
  return String(value)
    .replaceAll("Hola mundo", "Hello world")
    .replaceAll("Contenido dinámico", "Dynamic content")
    .replaceAll("Sombra abierta", "Open shadow")
    .replaceAll("Marco español", "Spanish frame")
    .replaceAll("Marco externo", "Cross-origin frame")
    .replaceAll("Marco srcdoc", "Srcdoc frame")
    .replaceAll("Cuenta privada", "Private account")
    .replaceAll("Texto temporal", "Temporary text")
    .replaceAll("Texto del botón", "Button text");
}

function send(response, body, contentType = "text/html; charset=utf-8") {
  response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function configure({ consent = true, behaviourMode = "manual" } = {}) {
  await worker.evaluate(async ({ consent, behaviourMode, endpoint }) => {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    await chrome.storage.sync.set({
      enabled: true,
      behaviourMode,
      targetLanguage: "en",
      providerMode: "libretranslate",
      allowGoogleWebFallback: false,
      excludedLanguages: [],
      excludedHosts: [],
      approvedHosts: [],
      siteTargetLanguages: {},
      glossary: [],
      neverTranslateTerms: [],
      translateDynamicContent: true,
      translateAttributes: false,
      sensitivePageMode: "manual",
      adjustTextDirection: true,
      showPageControl: true,
      showBadge: true
    });
    await chrome.storage.local.set({
      privacyConsentVersion: consent ? 1 : 0,
      privacyConsentAt: consent ? new Date().toISOString() : "",
      googleCloudApiKey: "",
      libreTranslateEndpoint: endpoint,
      libreTranslateApiKey: ""
    });
    await chrome.runtime.sendMessage({ type: "refresh-settings" });
  }, { consent, behaviourMode, endpoint: `${baseUrl}/translate` });
}

async function backgroundMessage(message) {
  return worker.evaluate((value) => chrome.runtime.sendMessage(value), message);
}

test.beforeAll(async () => {
  frameServer = createServer((_request, response) => send(response, "<!doctype html><html lang='es'><body><p id='cross-frame-text'>Marco externo</p></body></html>"));
  await new Promise((resolve) => frameServer.listen(0, "127.0.0.1", resolve));
  frameBaseUrl = `http://127.0.0.1:${frameServer.address().port}`;
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/translate") {
      const payload = JSON.parse(await readBody(request));
      const values = Array.isArray(payload.q) ? payload.q : [payload.q];
      return send(response, JSON.stringify({ translatedText: values.map(translate) }), "application/json; charset=utf-8");
    }
    if (url.pathname === "/frame") {
      return send(response, "<!doctype html><html lang='es'><body><p id='frame-text'>Marco español</p></body></html>");
    }
    if (url.pathname === "/sensitive") {
      return send(response, "<!doctype html><html lang='es'><body><h1 id='private-title'>Cuenta privada</h1><label>Contraseña <input type='password'></label></body></html>");
    }
    if (url.pathname === "/frames") {
      return send(response, "<!doctype html><html lang='es'><body><h1>Hola mundo</h1><iframe id='srcdoc' srcdoc=\"<html lang='es'><body><p id='srcdoc-text'>Marco srcdoc</p></body></html>\"></iframe></body></html>");
    }
    return send(response, `<!doctype html><html lang="es"><body>
      <h1 id="headline">Hola mundo</h1>
      <button id="action">Texto del botón</button>
      <div id="shadow-host"></div><div id="dynamic"></div>
      <iframe id="frame" src="/frame"></iframe>
      <iframe id="cross-frame" src="${frameBaseUrl}/frame"></iframe>
      <script>
        const root = document.querySelector("#shadow-host").attachShadow({ mode: "open" });
        root.innerHTML = '<p id="shadow-text">Sombra abierta</p>';
        setTimeout(() => document.querySelector("#dynamic").innerHTML = '<p id="dynamic-text">Contenido dinámico</p>', 600);
      </script>
    </body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  profileDirectory = mkdtempSync(path.join(tmpdir(), "bapt-e2e-profile-"));
  context = await chromium.launchPersistentContext(profileDirectory, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  for (const page of context.pages()) await page.close();
});

test.afterAll(async () => {
  await context?.close();
  await new Promise((resolve) => server?.close(resolve));
  await new Promise((resolve) => frameServer?.close(resolve));
  if (profileDirectory) rmSync(profileDirectory, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await configure();
});

test("blocks translation until the privacy checkpoint is complete", async () => {
  await configure({ consent: false });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  const guarded = await backgroundMessage({ type: "translate-now", tabId });
  expect(guarded.status).toBe("consent-required");
  await page.close();
});

test("translates static, dynamic, open-shadow and frame text, then restores originals", async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  const result = await backgroundMessage({ type: "translate-now", tabId });
  expect(result.status).toBe("translated");

  await expect(page.locator("#headline")).toHaveText("Hello world");
  await expect(page.locator("#action")).toHaveText("Button text");
  await expect(page.locator("#shadow-host").locator("#shadow-text")).toHaveText("Open shadow");
  await expect(page.frameLocator("#frame").locator("#frame-text")).toHaveText("Spanish frame");
  await expect(page.frameLocator("#cross-frame").locator("#cross-frame-text")).toHaveText("Cross-origin frame");
  await expect(page.locator("#dynamic-text")).toHaveText("Dynamic content");

  await page.locator("#headline").evaluate((element) => {
    globalThis.savedTranslatedHeadline = element;
    element.remove();
    const trigger = document.createElement("p");
    trigger.id = "cleanup-trigger";
    trigger.textContent = "Texto temporal";
    document.body.append(trigger);
  });
  await expect(page.locator("#cleanup-trigger")).toHaveText("Temporary text");
  await page.evaluate(() => document.body.append(globalThis.savedTranslatedHeadline));
  await expect(page.locator("#headline")).toHaveText("Hello world");

  expect((await backgroundMessage({ type: "restore-page", tabId })).status).toBe("restored");
  await expect(page.locator("#headline")).toHaveText("Hola mundo");
  await expect(page.locator("#shadow-host").locator("#shadow-text")).toHaveText("Sombra abierta");
  await page.close();
});

test("automatically translates a related srcdoc frame using origin fallback", async () => {
  await configure({ behaviourMode: "all-sites" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/frames`);
  await expect(page.locator("h1")).toHaveText("Hello world");
  await expect(page.frameLocator("#srcdoc").locator("#srcdoc-text")).toHaveText("Srcdoc frame");
  await page.close();
});

test("pauses automatic translation on password forms", async () => {
  await configure({ behaviourMode: "all-sites" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/sensitive`);
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  const inspection = await backgroundMessage({ type: "inspect-tab", tabId });
  expect(inspection.status).toBe("sensitive-page");
  await expect(page.locator("#private-title")).toHaveText("Cuenta privada");
  await page.close();
});
