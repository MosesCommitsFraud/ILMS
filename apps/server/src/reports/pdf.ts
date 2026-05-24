import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { BrowserMissingError } from "../tools/runtime/playwrightRunner";

/**
 * Very small Markdown -> HTML translator. Covers the constructs render.ts
 * emits (headings, paragraphs, bold/inline-code, links, list items) and
 * nothing else. We don't pull in a markdown lib because the report shape is
 * fixed in render.ts.
 */
function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      closeList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1]!.length;
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (line.startsWith("_") && line.endsWith("_")) {
      closeList();
      out.push(`<p><em>${escapeHtml(line.slice(1, -1))}</em></p>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>");
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const STYLE = `
  :root { color-scheme: light; }
  body {
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: #111;
    margin: 2.5cm 2cm;
    line-height: 1.5;
    font-size: 11pt;
  }
  h1 { font-size: 24pt; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  h2 { font-size: 16pt; margin-top: 32px; }
  h3 { font-size: 13pt; margin-top: 20px; color: #333; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  code { font-family: ui-monospace, "SF Mono", Consolas, monospace; background: #f4f4f5; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  a { color: #1d4ed8; text-decoration: none; word-break: break-all; }
  p { margin: 6px 0; }
  em { color: #555; }
`;

export async function renderPdf(markdown: string, title: string): Promise<Buffer> {
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head><body>
${markdownToHtml(markdown)}
</body></html>`;

  // Use launchPersistentContext with a throwaway userDataDir. Plain
  // `chromium.launch()` hangs on first invocation on some Windows setups when
  // playwright-core spins up the headless shell; the persistent path is the
  // same code path our Facebook drivers exercise successfully.
  const userDataDir = mkdtempSync(join(tmpdir(), "ilms-pdf-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
    });
  } catch (error) {
    // chromium may still hold the userDataDir; defer cleanup briefly.
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
