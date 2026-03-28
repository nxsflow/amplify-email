import { describe, expect, it } from "vitest";
import { renderStandardTemplate } from "../../src/templates/standard.js";

describe("renderStandardTemplate", () => {
    it("renders body-only email", () => {
        const result = renderStandardTemplate({ body: "Hello world" });

        expect(result.html).toContain("Hello world");
        expect(result.html).toContain("<html");
        expect(result.html).toContain("</html>");
        expect(result.text).toContain("Hello world");
    });

    it("renders header as heading in HTML", () => {
        const result = renderStandardTemplate({
            header: "Welcome",
            body: "You're in.",
        });

        expect(result.html).toMatch(/<h1[^>]*>Welcome<\/h1>/);
        expect(result.text).toContain("WELCOME");
    });

    it("renders call-to-action as a button in HTML and URL in text", () => {
        const result = renderStandardTemplate({
            body: "Click below",
            callToAction: { label: "Get Started", url: "https://example.com/start" },
        });

        expect(result.html).toContain("https://example.com/start");
        expect(result.html).toContain("Get Started");
        expect(result.html).toMatch(/<a\s/);
        expect(result.text).toContain("Get Started: https://example.com/start");
    });

    it("renders footer as muted text in HTML", () => {
        const result = renderStandardTemplate({
            body: "Main content",
            footer: "Unsubscribe here",
        });

        expect(result.html).toContain("Unsubscribe here");
        expect(result.text).toContain("---");
        expect(result.text).toContain("Unsubscribe here");
    });

    it("renders brandName in the template", () => {
        const result = renderStandardTemplate({
            body: "Content",
            brandName: "Acme Corp",
        });

        expect(result.html).toContain("Acme Corp");
    });

    it("renders all slots together", () => {
        const result = renderStandardTemplate({
            header: "Big News",
            body: "We launched a feature.",
            callToAction: { label: "Try It", url: "https://example.com" },
            footer: "You received this because you signed up.",
            brandName: "MyApp",
        });

        expect(result.html).toContain("Big News");
        expect(result.html).toContain("We launched a feature.");
        expect(result.html).toContain("Try It");
        expect(result.html).toContain("https://example.com");
        expect(result.html).toContain("You received this because you signed up.");
        expect(result.html).toContain("MyApp");

        const text = result.text;
        const headerIdx = text.indexOf("BIG NEWS");
        const bodyIdx = text.indexOf("We launched a feature.");
        const ctaIdx = text.indexOf("Try It: https://example.com");
        const footerIdx = text.indexOf("You received this because you signed up.");
        expect(headerIdx).toBeLessThan(bodyIdx);
        expect(bodyIdx).toBeLessThan(ctaIdx);
        expect(ctaIdx).toBeLessThan(footerIdx);
    });

    it("escapes HTML entities in text content", () => {
        const result = renderStandardTemplate({
            body: 'Use <script> & "quotes"',
        });

        expect(result.html).not.toContain("<script>");
        expect(result.html).toContain("&lt;script&gt;");
        expect(result.html).toContain("&amp;");
    });
});
