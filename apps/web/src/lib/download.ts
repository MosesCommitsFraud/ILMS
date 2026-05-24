import { resolveHttpUrl } from "../env";

export function downloadString(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportUrl(caseId: string, format: "markdown" | "pdf"): string {
  return `${resolveHttpUrl()}/reports/${encodeURIComponent(caseId)}/${format}`;
}

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
