import { chromium } from "@playwright/test";

export async function launchExtension(profileDirectory, extensionPath) {
  const cdpInstall = process.env.BAPT_LOAD_WITH_CDP === "1";
  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: process.env.BAPT_HEADLESS === "1",
    executablePath: process.env.BAPT_BROWSER_EXECUTABLE || undefined,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: cdpInstall ? ["--enable-unsafe-extension-debugging"] : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  if (cdpInstall) {
    const session = await context.browser().newBrowserCDPSession();
    await session.send("Extensions.loadUnpacked", { path: extensionPath });
    await session.detach();
  }
  return context;
}
