// test/construct/output-registration.test.ts
import { App, Stack } from "aws-cdk-lib";
import { describe, expect, it } from "vitest";
import { AmplifyEmail } from "../../src/construct.js";

describe("Output registration", () => {
    it("construct exposes resources needed for output registration", () => {
        const app = new App();
        const stack = new Stack(app, "TestStack");
        const construct = new AmplifyEmail(stack, "Email", {
            domain: "mail.example.com",
            hostedZoneId: "Z123",
            hostedZoneDomain: "example.com",
        });

        expect(construct.resources.lambdaFunctionName).toBeDefined();
        expect(construct.resources.emailDomain).toBe("mail.example.com");
    });

    it("construct exposes undefined domain when no custom domain", () => {
        const app = new App();
        const stack = new Stack(app, "TestStack");
        const construct = new AmplifyEmail(stack, "Email", {});

        expect(construct.resources.emailDomain).toBeUndefined();
        expect(construct.resources.sesIdentityArn).toBeUndefined();
        expect(construct.resources.lambdaFunctionName).toBeDefined();
    });
});
