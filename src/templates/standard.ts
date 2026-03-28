// src/templates/standard.ts
import type { TemplateInput, TemplateOutput } from "./types.js";

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function renderStandardTemplate(input: TemplateInput): TemplateOutput {
    const { header, body, callToAction, footer, brandName } = input;

    // --- HTML ---
    const sections: string[] = [];

    if (brandName) {
        sections.push(
            `<tr><td style="padding:24px 32px 0;color:#888;font-size:13px;">${escapeHtml(brandName)}</td></tr>`,
        );
    }

    if (header) {
        sections.push(
            `<tr><td style="padding:24px 32px 0;"><h1 style="margin:0;font-size:24px;color:#1a1a2e;">${escapeHtml(header)}</h1></td></tr>`,
        );
    }

    sections.push(
        `<tr><td style="padding:16px 32px;font-size:16px;line-height:1.6;color:#333;">${escapeHtml(body)}</td></tr>`,
    );

    if (callToAction) {
        sections.push(
            `<tr><td style="padding:8px 32px 24px;">` +
                `<a href="${escapeHtml(callToAction.url)}" style="display:inline-block;padding:12px 24px;background:#e8734a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">${escapeHtml(callToAction.label)}</a>` +
                `</td></tr>`,
        );
    }

    if (footer) {
        sections.push(
            `<tr><td style="padding:16px 32px;border-top:1px solid #eee;font-size:13px;color:#888;">${escapeHtml(footer)}</td></tr>`,
        );
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
${sections.join("\n")}
</table>
</td></tr>
</table>
</body>
</html>`;

    // --- Plain text ---
    const textParts: string[] = [];

    if (header) {
        textParts.push(header.toUpperCase(), "");
    }

    textParts.push(body, "");

    if (callToAction) {
        textParts.push(`${callToAction.label}: ${callToAction.url}`, "");
    }

    if (footer) {
        textParts.push("---", footer);
    }

    const text = textParts.join("\n").trim();

    return { html, text };
}
