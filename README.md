# @nxsflow/amplify-email

AWS Amplify Gen 2 email category — `defineEmail()` for Amazon SES with templates and a server-side client.

## Features

- **Zero-config start** — works without a custom domain (SES uses `amazonses.com`)
- **Custom domain** — DKIM, SPF, DMARC, MX records provisioned automatically via Route 53
- **Standard template** — send structured text; the Lambda renders HTML + plain text
- **Server-side client** — `generateClient()` singleton for SSR routes and Lambda handlers
- **Fire-and-forget** — async Lambda invocation, non-blocking
- **Amplify-native** — follows the `ConstructFactory` pattern, works with `defineBackend()`

## Installation

```bash
npm install @nxsflow/amplify-email
# or
pnpm add @nxsflow/amplify-email
# or
yarn add @nxsflow/amplify-email
```

## Quick Start

### 1. Define the email category

```ts
// amplify/email/resource.ts
import { defineEmail } from "@nxsflow/amplify-email";

export const email = defineEmail({
    domain: "mail.myapp.com",
    hostedZoneId: "Z1234567890",
    hostedZoneDomain: "myapp.com",
});
```

### 2. Add to your backend

```ts
// amplify/backend.ts
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { email } from "./email/resource";

defineBackend({ auth, data, email });
```

### 3. Send emails from server-side code

```ts
// In a Next.js SSR route, Server Action, or Lambda handler:
import { generateClient } from "@nxsflow/amplify-email/client";

const client = generateClient();

await client.email.send({
    to: "user@example.com",
    subject: "You're invited",
    header: "Welcome aboard",
    body: "We're excited to have you join the team.",
    callToAction: { label: "Accept Invitation", url: "https://app.myapp.com/accept" },
    footer: "Questions? Reply to this email.",
});
```

## How It Works

```
Your SSR route (auth + business logic)
  -> generateClient().email.send({ to, subject, header, body, ... })
    -> AWS Lambda invocation (fire-and-forget)
      -> Standard template renders HTML + plain text
        -> Amazon SES delivers the email
```

The library is **server-side only**. There is no public API endpoint. The send-email Lambda is invoked via the AWS SDK from trusted server-side code. You control who can send emails by wrapping `client.email.send()` with your own authentication and business logic.

## Configuration

### Zero-config (no custom domain)

```ts
export const email = defineEmail({});
```

SES uses its default `amazonses.com` MAIL FROM domain. You must verify sender/recipient addresses in the SES console (or use sandbox mode).

### Custom domain

```ts
export const email = defineEmail({
    domain: "mail.myapp.com",
    hostedZoneId: "Z1234567890",
    hostedZoneDomain: "myapp.com",
    defaultSender: "noreply",
    defaultSenderName: "MyApp",
});
```

This creates:
- SES EmailIdentity with EasyDKIM
- 3 DKIM CNAME records, SPF TXT, DMARC TXT, MX record in Route 53
- SES ConfigurationSet with CloudWatch metrics
- Scoped IAM permissions for the send Lambda

### Sandbox mode

```ts
export const email = defineEmail({
    isSandbox: true,
    sandboxRecipients: ["dev@example.com", "qa@example.com"],
});
```

Creates verified email identities for each recipient. SES sandbox restricts sending to verified addresses only.

## API Reference

### `defineEmail(props?: EmailProps)`

Creates the email infrastructure. Returns a `ConstructFactory` for `defineBackend()`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `domain` | `string` | — | Custom mail domain |
| `hostedZoneId` | `string` | — | Route 53 hosted zone ID |
| `hostedZoneDomain` | `string` | — | Root domain name |
| `defaultSender` | `string` | `"noreply"` | Default sender local-part |
| `defaultSenderName` | `string` | `"NexusFlow"` | Default display name |
| `isSandbox` | `boolean` | `false` | Enable sandbox mode |
| `sandboxRecipients` | `string[]` | `[]` | Addresses to verify in sandbox |
| `timeoutSeconds` | `number` | `15` | Lambda timeout |

### `generateClient()`

Returns a singleton `EmailClient` for server-side use. Reads config from `amplify_outputs.json` automatically.

### `client.email.send(input)`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | `string` | Yes | Recipient email |
| `subject` | `string` | Yes | Subject line |
| `body` | `string` | Yes | Main body text |
| `header` | `string` | No | Heading at the top |
| `callToAction` | `{ label, url }` | No | CTA button |
| `footer` | `string` | No | Footer text |
| `sender` | `string` | No | Override sender |
| `senderName` | `string` | No | Override display name |

## Accessing CDK Resources

After `defineBackend()`, access the underlying resources for advanced wiring:

```ts
const backend = defineBackend({ auth, data, email });

// Grant another Lambda permission to invoke the send-email Lambda
backend.email.resources.lambda.grantInvoke(backend.myFunction.resources.lambda);

// Wire SES to Cognito for auth emails
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.emailConfiguration = {
    sourceArn: backend.email.resources.sesIdentityArn,
    emailSendingAccount: "DEVELOPER",
};
```

## License

Apache-2.0
