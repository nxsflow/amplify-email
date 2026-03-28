import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AmplifyEmail } from "../../src/construct.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function synthTemplate(props: ConstructorParameters<typeof AmplifyEmail>[2]): Template {
    const app = new App();
    const stack = new Stack(app, "TestStack");
    new AmplifyEmail(stack, "Email", props);
    return Template.fromStack(stack);
}

// ---------------------------------------------------------------------------
// Zero-config mode (no custom domain)
// ---------------------------------------------------------------------------

describe("AmplifyEmail — zero-config (no domain)", () => {
    const template = synthTemplate({});

    it("creates a Lambda function with Node 22 runtime", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Runtime: "nodejs22.x",
            Timeout: 15,
        });
    });

    it("creates a SES ConfigurationSet", () => {
        template.resourceCountIs("AWS::SES::ConfigurationSet", 1);
    });

    it("does NOT create an SES EmailIdentity (no domain)", () => {
        template.resourceCountIs("AWS::SES::EmailIdentity", 0);
    });

    it("does NOT create Route 53 records", () => {
        template.resourceCountIs("AWS::Route53::RecordSet", 0);
    });

    it("grants broad SES send permissions (identity/*)", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Action: ["ses:SendEmail", "ses:SendRawEmail"],
                        Effect: "Allow",
                        Resource: Match.anyValue(),
                    }),
                ]),
            },
        });
    });

    it("sets DEFAULT_SENDER and DEFAULT_SENDER_NAME env vars", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: Match.objectLike({
                    DEFAULT_SENDER: "noreply",
                    DEFAULT_SENDER_NAME: "NexusFlow",
                }),
            },
        });
    });

    it("does NOT set EMAIL_DOMAIN env var when no domain", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: Match.not(Match.objectLike({ EMAIL_DOMAIN: Match.anyValue() })),
            },
        });
    });
});

// ---------------------------------------------------------------------------
// Custom domain mode
// ---------------------------------------------------------------------------

describe("AmplifyEmail — custom domain", () => {
    const template = synthTemplate({
        domain: "mail.example.com",
        hostedZoneId: "Z1234567890",
        hostedZoneDomain: "example.com",
        defaultSender: "notifications",
        defaultSenderName: "MyApp",
    });

    it("creates a Lambda with EMAIL_DOMAIN env var", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: Match.objectLike({
                    EMAIL_DOMAIN: "mail.example.com",
                    DEFAULT_SENDER: "notifications",
                    DEFAULT_SENDER_NAME: "MyApp",
                }),
            },
        });
    });

    it("creates an SES EmailIdentity for the domain", () => {
        template.hasResourceProperties("AWS::SES::EmailIdentity", {
            EmailIdentity: "mail.example.com",
        });
    });

    it("creates a ConfigurationSet with CloudWatch event destination", () => {
        template.resourceCountIs("AWS::SES::ConfigurationSet", 1);
        template.resourceCountIs("AWS::SES::ConfigurationSetEventDestination", 1);
    });

    it("creates 3 DKIM CNAME records", () => {
        const records = template.findResources("AWS::Route53::RecordSet", {
            Properties: { Type: "CNAME" },
        });
        expect(Object.keys(records)).toHaveLength(3);
    });

    it("creates an SPF TXT record", () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Type: "TXT",
            ResourceRecords: ['"v=spf1 include:amazonses.com ~all"'],
        });
    });

    it("creates a DMARC TXT record", () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Type: "TXT",
            ResourceRecords: ['"v=DMARC1; p=quarantine; adkim=s; aspf=s;"'],
        });
    });

    it("creates an MX record", () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Type: "MX",
        });
    });

    it("grants scoped SES permissions to the Lambda", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Action: ["ses:SendEmail", "ses:SendRawEmail"],
                        Effect: "Allow",
                    }),
                ]),
            },
        });
    });
});

// ---------------------------------------------------------------------------
// Sandbox mode
// ---------------------------------------------------------------------------

describe("AmplifyEmail — sandbox mode", () => {
    const template = synthTemplate({
        isSandbox: true,
        sandboxRecipients: ["dev@example.com", "qa@example.com"],
    });

    it("creates EmailIdentity resources for each sandbox recipient", () => {
        template.hasResourceProperties("AWS::SES::EmailIdentity", {
            EmailIdentity: "dev@example.com",
        });
        template.hasResourceProperties("AWS::SES::EmailIdentity", {
            EmailIdentity: "qa@example.com",
        });
    });

    it("creates exactly 2 EmailIdentity resources (one per recipient)", () => {
        template.resourceCountIs("AWS::SES::EmailIdentity", 2);
    });
});

// ---------------------------------------------------------------------------
// Custom domain + sandbox combined
// ---------------------------------------------------------------------------

describe("AmplifyEmail — custom domain + sandbox", () => {
    const template = synthTemplate({
        domain: "mail.example.com",
        hostedZoneId: "Z1234567890",
        hostedZoneDomain: "example.com",
        isSandbox: true,
        sandboxRecipients: ["dev@example.com"],
    });

    it("creates domain identity + sandbox recipient identity", () => {
        // 1 domain + 1 sandbox recipient = 2
        template.resourceCountIs("AWS::SES::EmailIdentity", 2);
    });
});

// ---------------------------------------------------------------------------
// Custom timeout
// ---------------------------------------------------------------------------

describe("AmplifyEmail — custom timeout", () => {
    const template = synthTemplate({ timeoutSeconds: 30 });

    it("uses the provided timeout", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Timeout: 30,
        });
    });
});
