---
name: cdk-construct-development
description: Patterns for developing and testing CDK constructs inside the @nxsflow/amplify-email library. Use when writing or extending AmplifyEmail, working with the ConstructFactory pattern, or testing CDK constructs with aws-cdk-lib/assertions.
---

# CDK Construct Development for @nxsflow/amplify-email

This skill covers how to write, extend, and test CDK constructs in this library.

## The ConstructFactory Pattern

Every Amplify category implements this interface from `@aws-amplify/plugin-types`:

```typescript
type ConstructFactory<T extends ResourceProvider = ResourceProvider> = {
    readonly provides?: string;
    getInstance: (props: ConstructFactoryGetInstanceProps) => T;
};

type ResourceProvider<T = Record<string, unknown>> = {
    resources: T;
};
```

`EmailFactory` in `src/factory.ts` implements this. `defineBackend()` calls `getInstance()` to lazily create the CDK construct.

### Critical: `getInstance` is called once per Amplify backend

The `EmailFactory` enforces this with a static counter. Calling `defineEmail()` twice throws. Tests must reset this counter between test cases or use separate test files.

---

## Writing CDK Constructs in this Library

### Structure

```
src/
├── types.ts         ← EmailProps, EmailResources interfaces
├── construct.ts     ← AmplifyEmail extends Construct
├── factory.ts       ← EmailFactory, defineEmail()
└── index.ts         ← public barrel export
```

### Construct Template

```typescript
// src/construct.ts
import { Stack } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
    ConfigurationSet,
    DkimIdentity,
    EmailIdentity,
    Identity,
} from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";
import type { EmailProps, EmailResources } from "./types.js";

export class AmplifyEmail extends Construct {
    public readonly resources: EmailResources;

    constructor(scope: Construct, id: string, props: EmailProps) {
        super(scope, id);

        const domain = props.domain ?? "mail.nxsflow.com";

        // Create Lambda
        const sendFn = new NodejsFunction(this, "SendEmailFunction", {
            entry: new URL("./functions/send/handler.ts", import.meta.url).pathname,
            // ...
        });

        // Create SES resources
        const configSet = new ConfigurationSet(this, "ConfigSet", {
            reputationMetrics: true,
        });

        const identity = new EmailIdentity(this, "Identity", {
            identity: Identity.domain(domain),
            dkimIdentity: DkimIdentity.easyDkim(),
            configurationSet: configSet,
        });

        // Expose resources
        this.resources = {
            lambda: sendFn,
            emailDomain: domain,
            sesIdentityArn: `arn:aws:ses:${Stack.of(this).region}:${Stack.of(this).account}:identity/${domain}`,
            lambdaFunctionName: sendFn.functionName,
        };
    }
}
```

---

## Testing CDK Constructs

### Unit Testing with `aws-cdk-lib/assertions`

CDK provides a powerful assertions API. Use it for construct unit tests:

```typescript
// test/construct.test.ts
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AmplifyEmail } from "../src/construct.js";

describe("AmplifyEmail construct", () => {
    it("creates a Lambda function", () => {
        const app = new App();
        const stack = new Stack(app, "TestStack");

        new AmplifyEmail(stack, "Email", {
            domain: "mail.example.com",
        });

        const template = Template.fromStack(stack);
        template.hasResourceProperties("AWS::Lambda::Function", {
            Timeout: 15,
        });
    });

    it("creates an SES EmailIdentity", () => {
        const app = new App();
        const stack = new Stack(app, "TestStack");

        new AmplifyEmail(stack, "Email", { domain: "mail.example.com" });

        const template = Template.fromStack(stack);
        template.resourceCountIs("AWS::SES::EmailIdentity", 1);
    });

    it("creates DKIM, SPF, and DMARC DNS records", () => {
        const app = new App();
        const stack = new Stack(app, "TestStack");

        new AmplifyEmail(stack, "Email", {
            domain: "mail.example.com",
            hostedZoneId: "Z1234567890",
            hostedZoneDomain: "example.com",
        });

        const template = Template.fromStack(stack);
        // 3 DKIM CNAMEs + SPF TXT + DMARC TXT = 5 Route53 records minimum
        expect(
            template.findResources("AWS::Route53::RecordSet"),
        ).toBeDefined();
    });
});
```

### Key Testing Principles

1. **Always create a fresh `App` + `Stack` per test** — CDK construct trees are stateful
2. **Use `Template.fromStack()` for assertions** — never inspect construct properties directly
3. **Test the CloudFormation output**, not the TypeScript API — that's what actually deploys
4. **Mock external services**: CDK constructs don't call AWS at synthesis time, so no mocking needed for CDK tests
5. **Reset `EmailFactory.factoryCount`** between tests if testing the factory (use `beforeEach`)

### Template Assertion Cheatsheet

```typescript
const template = Template.fromStack(stack);

// Assert a resource exists with specific properties
template.hasResourceProperties("AWS::Lambda::Function", {
    Runtime: "nodejs22.x",
    Timeout: 15,
});

// Count resources
template.resourceCountIs("AWS::SES::EmailIdentity", 1);

// Find all resources of a type
const records = template.findResources("AWS::Route53::RecordSet");

// Assert an output exists
template.hasOutput("EmailDomain", { Value: "mail.example.com" });

// Assert IAM policy statement
template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
        Statement: [
            {
                Action: ["ses:SendEmail", "ses:SendRawEmail"],
                Effect: "Allow",
            },
        ],
    },
});
```

---

## tsup Build Notes

The library uses tsup with `external: ["aws-cdk-lib", "constructs", "@aws-amplify/plugin-types"]`.

- All CDK imports are externalized — they must be provided by the consumer's project
- Use `.js` extensions in source imports (tsup resolves them to `.ts` during build)
- `dts: true` generates `.d.ts` files from TypeScript source
- Build output: `dist/index.js` (ESM), `dist/index.cjs` (CJS), `dist/index.d.ts`

### Lambda handler bundling

Lambda handlers inside the construct (e.g. `src/functions/send/handler.ts`) need to be bundled separately from the library. The `NodejsFunction` CDK construct handles this at synthesis time using esbuild. The handler file is **not** exported from the library barrel — it's embedded in the construct.

---

## Peer Dependency Convention

| Package | Range | Rule |
|---------|-------|------|
| `aws-cdk-lib` | `^2.0.0` | Permissive — consumer controls their CDK version |
| `constructs` | `^10.0.0` | CDK base class |
| `@aws-amplify/plugin-types` | `^1.0.0` | ConstructFactory interface |

**Rules:**
- Never bundle peer deps — they're externalized in tsup config
- Test against the minimum supported version, not latest
- Keep ranges permissive (`^2.0.0` not `^2.170.0`) — consumers have their own CDK constraints
- Bumping a peer dep minimum range is a **major** version bump for this library

---

## Common Pitfalls

### "Cannot find module 'constructs'" in tests

Add `aws-cdk-lib` and `constructs` as devDependencies. They're peer deps for consumers but needed for testing.

### "Stack is not in any Construct node" error

You must use `new App()` as the root. Don't try to instantiate a construct outside a Stack.

### CDK synthesis warnings about deprecated APIs

Check the CDK changelog. SES L2 constructs in particular have evolved. Use `aws-cdk-lib/aws-ses` (L2) not `@aws-cdk/aws-ses` (old L1).

### DKIM token names include the zone domain

`emailIdentity.dkimDnsTokenName1` returns the full FQDN. Extract only the hash prefix before creating the `CnameRecord`, or Route 53 will append the zone name and create a duplicate:

```typescript
// ✅ Correct
const tokenHash = Fn.select(0, Fn.split(".", emailIdentity.dkimDnsTokenName1));
recordName: Fn.join(".", [tokenHash, "_domainkey", "mail"])

// ❌ Wrong — results in double zone name
recordName: emailIdentity.dkimDnsTokenName1
```
