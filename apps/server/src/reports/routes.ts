import { Elysia } from "elysia";

import { BrowserMissingError } from "../tools/runtime/playwrightRunner";

import { loadReportBundle } from "./bundle";
import { renderHtmlDocument } from "./html";
import { renderPdf } from "./pdf";
import { renderMarkdown } from "./render";

export const reportRoutes = new Elysia({ name: "ilms/reports" })
  .get("/reports/:caseId/markdown", ({ params }) => {
    const bundle = loadReportBundle(params.caseId);
    return new Response(renderMarkdown(bundle), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${bundle.case.slug}.md"`,
      },
    });
  })
  .get("/reports/:caseId/html", ({ params }) => {
    const bundle = loadReportBundle(params.caseId);
    const html = renderHtmlDocument(renderMarkdown(bundle), bundle.case.name);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  })
  .get("/reports/:caseId/pdf", async ({ params }) => {
    const bundle = loadReportBundle(params.caseId);
    const markdown = renderMarkdown(bundle);
    try {
      const pdf = await renderPdf(markdown, bundle.case.name);
      return new Response(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${bundle.case.slug}.pdf"`,
        },
      });
    } catch (error) {
      if (error instanceof BrowserMissingError) {
        return new Response(error.message, { status: 503, headers: { "Content-Type": "text/plain" } });
      }
      throw error;
    }
  });
