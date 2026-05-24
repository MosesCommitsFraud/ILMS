import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { BrowserMissingError } from "../tools/runtime/playwrightRunner";

import { renderHtmlDocument } from "./html";

/**
 * Render markdown to PDF via playwright-core. Works on Linux / macOS and
 * Node-runtime deployments. On Bun + Windows + playwright-core headless,
 * the chromium launch is known to hang — the /reports/:id/html route +
 * native browser print is the supported path there.
 */
export async function renderPdf(markdown: string, title: string): Promise<Buffer> {
  const html = renderHtmlDocument(markdown, title);

  const userDataDir = mkdtempSync(join(tmpdir(), "ilms-pdf-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  } catch (error) {
    setTimeout(() => {
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }, 3000);
    if (error instanceof Error && /Executable doesn't exist|browserType\.launch/i.test(error.message)) {
      throw new BrowserMissingError();
    }
    throw error;
  }

  try {
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return pdf;
  } finally {
    await context.close().catch(() => undefined);
    setTimeout(() => {
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }, 1000);
  }
}
