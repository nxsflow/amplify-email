---
name: cdk-testing
description: Testing patterns for @nxsflow/amplify-email — test organization, CDK assertions API, concrete assertion recipes for SES/Route53/Lambda/IAM, and test helpers. Use when writing tests, adding coverage, or debugging test failures.
---

# CDK Testing for @nxsflow/amplify-email

Comprehensive guide for testing CDK constructs and factory logic in this library.

## Test Organization

```
test/
├── unit/                    # No CDK Stack needed — fast, isolated
│   ├── factory.test.ts      # defineEmail(), singleton, prop validation
│   └── types.test.ts        # (future) type guard / validation tests
└── construct/               # CDK Template assertions — synthesizes stacks
    ├── helpers.ts            # Shared createEmailTemplate() utility
    ├── ses.test.ts           # EmailIdentity, ConfigurationSet
    ├── dns.test.ts           # Route 53 records (DKIM, SPF, DMARC, MX)
    ├── lambda.test.ts        # Send-email Lambda function
    └── iam.test.ts           # ses:SendEmail policy grant
```

Vitest config matches both: `include: ["test/**/*.test.ts"]`.

**When to write which:**
- **Unit tests** (`test/unit/`): Testing pure logic — factory behavior, prop validation, error messages. No `App` or `Stack` needed. These run fast.
- **Construct tests** (`test/construct/`): Testing the CloudFormation output of `AmplifyEmail`. Always use `Template.fromStack()` to assert on synthesized resources.

---

## Unit Test Patterns

### Singleton Reset

`EmailFactory` uses a static counter to enforce one `defineEmail()` per backend. Reset between tests:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { EmailFactory } from "../../src/factory.js";
import { defineEmail } from "../../src/index.js";

describe("defineEmail", () => {
    beforeEach(() => {
        EmailFactory.factoryCount = 0;
    });

    it("returns an object with a getInstance method", () => {
        const factory = defineEmail({});
        expect(factory).toBeDefined();
        expect(typeof factory.getInstance).toBe("function");
    });

    it("throws on second call", () => {
        defineEmail({});
        expect(() => defineEmail({})).toThrow();
    });
});
```

### Prop Validation

Test that invalid props produce clear error messages:

```typescript
it("rejects invalid domain format", () => {
    expect(() => defineEmail({ domain: "not a domain" })).toThrow(
        /invalid domain/i,
    );
});
```

### No CDK Dependency

Unit tests should never import `aws-cdk-lib`. If a test needs `App` or `Stack`, it belongs in `test/construct/`.

---

## CDK Assertions API Reference

Import everything from `aws-cdk-lib/assertions`:

```typescript
import { Capture, Match, Template } from "aws-cdk-lib/assertions";
```

### Template Methods

| Method | Purpose |
|--------|---------|
| `Template.fromStack(stack)` | Synthesize a stack and wrap it for assertions |
| `template.hasResourceProperties(type, props)` | Assert a resource exists with these properties (partial match) |
| `template.hasResource(type, props)` | Match including metadata, condition, DependsOn |
| `template.resourceCountIs(type, count)` | Assert exact number of resources of this type |
| `template.findResources(type, props?)` | Return all matching resources as an object |
| `template.hasOutput(logicalId, props)` | Validate stack outputs |

### Match Helpers

| Matcher | Purpose |
|---------|---------|
| `Match.objectLike({})` | Partial object match (default for `hasResourceProperties`) |
| `Match.objectEquals({})` | Exact object match — fails if extra keys present |
| `Match.anyValue()` | Matches anything except absent |
| `Match.absent()` | Asserts key does not exist |
| `Match.not(inner)` | Inverts a matcher |
| `Match.serializedJson(inner)` | Parse a JSON string, then apply inner matcher |
| `Match.arrayWith([...])` | Array contains these elements (order-independent) |
| `Match.exact(value)` | Exact primitive match |
| `Match.stringLikeRegexp(pattern)` | Matches a string against a regex pattern |

### Capture

Capture a dynamic value from the template for later assertion:

```typescript
const arnCapture = new Capture();
template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
        Statement: [{ Resource: arnCapture }],
    },
});
expect(arnCapture.asString()).toContain(":ses:");
```

### Key Principles

1. **Fresh `App` + `Stack` per test** — CDK construct trees are stateful. Never reuse across tests.
2. **Assert on CloudFormation output** — use `Template.fromStack()`, not construct properties.
3. **No mocking needed** — CDK synthesis doesn't call AWS. All assertions are against the template JSON.
4. **Reset `EmailFactory.factoryCount`** in `beforeEach` when testing the factory.

---

## Concrete AmplifyEmail Assertion Recipes

### Test Helper

All construct tests share this helper:

```typescript
// test/construct/helpers.ts
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AmplifyEmail } from "../../src/construct.js";
import type { EmailProps } from "../../src/types.js";

const defaultProps: EmailProps = {
    domain: "mail.example.com",
    hostedZoneId: "Z1234567890",
    hostedZoneDomain: "example.com",
};

export function createEmailTemplate(overrides?: Partial<EmailProps>): Template {
    const app = new App();
    const stack = new Stack(app, "TestStack");
    new AmplifyEmail(stack, "Email", { ...defaultProps, ...overrides });
    return Template.fromStack(stack);
}
```

Common `beforeEach` pattern:

```typescript
import { type Template } from "aws-cdk-lib/assertions";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmailTemplate } from "./helpers.js";

let template: Template;

beforeEach(() => {
    template = createEmailTemplate();
});
```

---

### SES Resources (`test/construct/ses.test.ts`)

```typescript
import { Match, type Template } from "aws-cdk-lib/assertions";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmailTemplate } from "./helpers.js";

describe("SES resources", () => {
    let template: Template;

    beforeEach(() => {
        template = createEmailTemplate();
    });

    it("creates an EmailIdentity for the domain", () => {
        template.hasResourceProperties("AWS::SES::EmailIdentity", {
            EmailIdentity: "mail.example.com",
            DkimSigningAttributes: {
                NextSigningKeyLength: "RSA_2048_BIT",
            },
        });
    });

    it("creates exactly one EmailIdentity", () => {
        template.resourceCountIs("AWS::SES::EmailIdentity", 1);
    });

    it("creates a ConfigurationSet with reputation metrics", () => {
        template.hasResourceProperties("AWS::SES::ConfigurationSet", {
            ReputationOptions: { ReputationMetricsEnabled: true },
        });
    });
});
```

### DNS Records (`test/construct/dns.test.ts`)

```typescript
import { Match, type Template } from "aws-cdk-lib/assertions";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmailTemplate } from "./helpers.js";

describe("DNS records", () => {
    let template: Template;

    beforeEach(() => {
        template = createEmailTemplate();
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
            ResourceRecords: Match.arrayWith([
                '"v=spf1 include:amazonses.com ~all"',
            ]),
        });
    });

    it("creates a DMARC TXT record", () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Type: "TXT",
            Name: Match.stringLikeRegexp("_dmarc"),
        });
    });

    it("creates an MX record for inbound email", () => {
        template.hasResourceProperties("AWS::Route53::RecordSet", {
            Type: "MX",
            ResourceRecords: Match.arrayWith([
                Match.stringLikeRegexp("inbound-smtp"),
            ]),
        });
    });
});
```

### Lambda Function (`test/construct/lambda.test.ts`)

```typescript
import { Match, type Template } from "aws-cdk-lib/assertions";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmailTemplate } from "./helpers.js";

describe("Send-email Lambda", () => {
    let template: Template;

    beforeEach(() => {
        template = createEmailTemplate();
    });

    it("creates a Lambda function with Node 22", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Runtime: "nodejs22.x",
            Timeout: 15,
        });
    });

    it("passes SES identity ARN as environment variable", () => {
        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: Match.objectLike({
                    SES_IDENTITY_ARN: Match.anyValue(),
                }),
            },
        });
    });
});
```

### IAM Policy (`test/construct/iam.test.ts`)

```typescript
import { Match, type Template } from "aws-cdk-lib/assertions";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmailTemplate } from "./helpers.js";

describe("IAM permissions", () => {
    let template: Template;

    beforeEach(() => {
        template = createEmailTemplate();
    });

    it("grants ses:SendEmail and ses:SendRawEmail to the Lambda", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: Match.arrayWith([
                    Match.objectLike({
                        Action: Match.arrayWith([
                            "ses:SendEmail",
                            "ses:SendRawEmail",
                        ]),
                        Effect: "Allow",
                    }),
                ]),
            },
        });
    });
});
```
