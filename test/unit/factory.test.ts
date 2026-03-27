import { beforeEach, describe, expect, it } from "vitest";
import { EmailFactory, defineEmail } from "../../src/factory.js";

describe("defineEmail", () => {
    beforeEach(() => {
        // Reset singleton counter so each test can call defineEmail() once
        EmailFactory.factoryCount = 0;
    });

    it("returns an object with a getInstance method", () => {
        const factory = defineEmail({});
        expect(factory).toBeDefined();
        expect(typeof factory.getInstance).toBe("function");
    });

    it("accepts an empty props object", () => {
        expect(() => defineEmail({})).not.toThrow();
    });

    it("accepts all optional props", () => {
        expect(() =>
            defineEmail({
                domain: "mail.example.com",
                hostedZoneId: "Z1234567890",
                hostedZoneDomain: "example.com",
                defaultSender: "noreply",
                defaultSenderName: "Example App",
                isSandbox: true,
                sandboxRecipients: ["dev@example.com"],
            }),
        ).not.toThrow();
    });
});
