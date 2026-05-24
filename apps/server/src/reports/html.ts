/**
 * Pure markdown -> HTML translator. Covers only the constructs render.ts
 * emits (headings, paragraphs, bold/inline-code, links, list items). We
 * don't pull in a markdown lib because the report shape is fixed in
 * render.ts.
 */
export function markdownToHtml(md: string): string {
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const STYLE = `
  :root { color-scheme: light; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #111;
    margin: 2.5cm 2cm;
    line-height: 1.55;
    font-size: 11pt;
    max-width: 780px;
  }
  h1 { font-size: 22pt; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 8px; }
  h2 { font-size: 14pt; margin-top: 32px; color: #222; }
  h3 { font-size: 12pt; margin-top: 20px; color: #333; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  p { margin: 6px 0; }
  code { font-family: ui-monospace, "SF Mono", Consolas, monospace; background: #f4f4f5; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  a { color: #1d4ed8; text-decoration: none; word-break: break-all; }
  em { color: #555; }
  .print-hint {
    background: #fefce8; border: 1px solid #fde68a; border-radius: 6px;
    padding: 10px 14px; margin-bottom: 24px; color: #713f12; font-size: 10pt;
  }
  @media print {
    .print-hint { display: none; }
    body { margin: 0; }
    @page { margin: 2.5cm 2cm; }
  }
`;

export function renderHtmlDocument(markdown: string, title: string): string {
  const body = markdownToHtml(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="print-hint">Press <strong>Ctrl/Cmd + P</strong> to print or save as PDF.</div>
  ${body}
</body>
</html>`;
}
