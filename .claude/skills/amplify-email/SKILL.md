---
name: amplify-email
description: AWS Amplify Gen 2 Email Notifications using Amazon SES and CDK. Use this when implementing transactional email sending, email domain authentication (DKIM/SPF/DMARC), inbound email handling, or integrating SES with Lambda functions in an Amplify Gen 2 backend.
---

# AWS Amplify Gen 2 Email Notifications with Amazon SES

This skill covers implementing a production-grade email notification system in AWS Amplify Gen 2 using Amazon SES, custom CDK constructs, and Lambda functions.

## When to Use This Skill

Invoke this skill when:

- User needs to send transactional emails (invitations, alerts, confirmations)
- User wants to set up Amazon SES with proper domain authentication
- User needs inbound email handling
- User asks about DKIM, SPF, or DMARC configuration in CDK
- User wants a fire-and-forget email sending pattern via Lambda

---

## Architecture Overview

The email system consists of three layers:

1. **EmailService CDK Construct** — SES domain identity, DNS records, IAM policies, inbound email storage
2. **Send Email Lambda** — Dedicated function that calls SES; invoked asynchronously by other functions
3. **Invoke Email Utility** — Shared library for fire-and-forget Lambda-to-Lambda email dispatch

```
Caller Lambda ──async invoke──▶ Send Email Lambda ──▶ Amazon SES ──▶ Recipient
                                       │
                                       ▼
                               CloudWatch Metrics
```

### Why a Dedicated Send Email Lambda?

Instead of granting every Lambda direct SES permissions, a single send-email function:

- Centralizes SES IAM permissions to one role
- Keeps email domain configuration in one place
- Allows fire-and-forget invocation (async `InvocationType: "Event"`)
- Makes it easy to add logging, rate limiting, or templating later

---

## Directory Structure

```
amplify/
├── custom/
│   └── email/
│       ├── resource.ts              # EmailService CDK construct
│       └── functions/
│           ├── resource.ts          # Send email Lambda definition
│           ├── handler/
│           │   └── send-email.ts    # SES send handler
│           └── lib/
│               └── invoke-email.ts  # Fire-and-forget invoker utility
└── backend.ts                       # Wire EmailService + grant invokers
```

---

## Step 1: Define the Send Email Lambda

Use Amplify's `defineFunction` to create the Lambda that will call SES.

```typescript
// amplify/custom/email/functions/resource.ts
import { defineFunction } from "@aws-amplify/backend";

export const sendEmail = defineFunction({
    name: "send-email",
    entry: "./handler/send-email.ts",
    timeoutSeconds: 15,
    environment: {
        EMAIL_DOMAIN: "mail.example.com", // Your mail subdomain
    },
});

export const emailFunctions = { sendEmail };
```

### Handler Implementation

```typescript
// amplify/custom/email/functions/handler/send-email.ts
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "$amplify/env/send-email";

const ses = new SESv2Client({});
const EMAIL_DOMAIN = env.EMAIL_DOMAIN;

interface SendEmailPayload {
    sender: string;       // Local part (e.g., "invitations", "noreply")
    senderName?: string;  // Display name (e.g., "My App")
    receiver: string;     // Full email address
    subject: string;
    textBody: string;
    htmlBody: string;
}

export const handler = async (event: SendEmailPayload) => {
    if (!EMAIL_DOMAIN) {
        throw new Error("EMAIL_DOMAIN environment variable not set");
    }

    const { sender, senderName, receiver, subject, textBody, htmlBody } = event;

    const address = `${sender}@${EMAIL_DOMAIN}`;
    const fromAddress = senderName ? `"${senderName}" <${address}>` : address;

    const result = await ses.send(
        new SendEmailCommand({
            FromEmailAddress: fromAddress,
            Destination: { ToAddresses: [receiver] },
            Content: {
                Simple: {
                    Subject: { Data: subject, Charset: "UTF-8" },
                    Body: {
                        Text: { Data: textBody, Charset: "UTF-8" },
                        Html: { Data: htmlBody, Charset: "UTF-8" },
                    },
                },
            },
        }),
    );

    console.log("Email sent:", { messageId: result.MessageId, to: receiver });
    return { messageId: result.MessageId };
};
```

---

## Step 2: Create the Invoke Email Utility

This utility lets any Lambda send email with a single async call. It uses fire-and-forget (`InvocationType: "Event"`) so the caller doesn't block on email delivery.

```typescript
// amplify/custom/email/functions/lib/invoke-email.ts
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({});

export async function invokeSendEmail(payload: {
    sender: string;
    senderName?: string;
    receiver: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
}): Promise<void> {
    const functionName = process.env.SEND_EMAIL_FUNCTION;
    if (!functionName) {
        console.warn("SEND_EMAIL_FUNCTION not set, skipping email send");
        return;
    }

    await lambda.send(
        new InvokeCommand({
            FunctionName: functionName,
            InvocationType: "Event", // async, fire-and-forget
            Payload: Buffer.from(JSON.stringify(payload)),
        }),
    );
}
```

**Key design decisions:**

- **Graceful degradation**: If `SEND_EMAIL_FUNCTION` is not set, logs a warning instead of throwing. This prevents email failures from breaking the calling operation.
- **Fire-and-forget**: Uses `InvocationType: "Event"` so the caller returns immediately. SES delivery happens asynchronously.
- **No error propagation**: Email sending should never be a blocking failure for business logic.

---

## Step 3: Create the EmailService CDK Construct

This construct sets up everything SES needs: domain identity, DKIM signing, SPF/DMARC records, inbound email storage, and IAM permissions.

```typescript
// amplify/custom/email/resource.ts
import { Duration, Fn, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
    type IFunction,
    Function as LambdaFunction,
} from "aws-cdk-lib/aws-lambda";
import type { IHostedZone } from "aws-cdk-lib/aws-route53";
import { CnameRecord, MxRecord, TxtRecord } from "aws-cdk-lib/aws-route53";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import {
    CloudWatchDimensionSource,
    ConfigurationSet,
    DkimIdentity,
    EmailIdentity,
    EmailSendingEvent,
    EventDestination,
    Identity,
    ReceiptRuleSet,
} from "aws-cdk-lib/aws-ses";
import * as actions from "aws-cdk-lib/aws-ses-actions";
import { Construct } from "constructs";

interface EmailServiceProps {
    hostedZone: IHostedZone;
    sendEmailLambda: IFunction;
    invokers?: IFunction[];
    mailSubdomain?: string;
    domain: string;
    isSandbox?: boolean;
    sandboxRecipients?: string[];
}

export class EmailService extends Construct {
    constructor(scope: Construct, id: string, props: EmailServiceProps) {
        super(scope, id);

        const {
            hostedZone,
            sendEmailLambda,
            invokers,
            mailSubdomain = "mail",
            domain,
            isSandbox = false,
            sandboxRecipients = [],
        } = props;

        const mailDomain = `${mailSubdomain}.${domain}`;
        const region = Stack.of(this).region;
        const account = Stack.of(this).account;

        invokers?.forEach((invoker) => {
            sendEmailLambda.grantInvoke(invoker);
            if (invoker instanceof LambdaFunction) {
                invoker.addEnvironment(
                    "SEND_EMAIL_FUNCTION",
                    sendEmailLambda.functionName,
                );
            }
        });

        const configurationSet = new ConfigurationSet(
            this,
            "ConfigurationSet",
            { reputationMetrics: true },
        );

        configurationSet.addEventDestination("CloudWatch", {
            destination: EventDestination.cloudWatchDimensions([
                {
                    name: "Domain",
                    source: CloudWatchDimensionSource.EMAIL_HEADER,
                    defaultValue: mailDomain.replace(/\./g, "-"),
                },
            ]),
            events: [
                EmailSendingEvent.SEND,
                EmailSendingEvent.DELIVERY,
                EmailSendingEvent.BOUNCE,
                EmailSendingEvent.COMPLAINT,
                EmailSendingEvent.REJECT,
                EmailSendingEvent.DELIVERY_DELAY,
            ],
        });

        const emailIdentity = new EmailIdentity(this, "EmailIdentity", {
            identity: Identity.domain(mailDomain),
            dkimIdentity: DkimIdentity.easyDkim(),
            configurationSet,
        });

        // DKIM CNAME records (3 tokens)
        // Extract token hash to avoid zone name duplication
        const dkimTokens = [
            { name: emailIdentity.dkimDnsTokenName1, value: emailIdentity.dkimDnsTokenValue1 },
            { name: emailIdentity.dkimDnsTokenName2, value: emailIdentity.dkimDnsTokenValue2 },
            { name: emailIdentity.dkimDnsTokenName3, value: emailIdentity.dkimDnsTokenValue3 },
        ];

        dkimTokens.forEach(({ name, value }, i) => {
            const tokenHash = Fn.select(0, Fn.split(".", name));
            new CnameRecord(this, `DkimCname${i + 1}`, {
                zone: hostedZone,
                recordName: Fn.join(".", [tokenHash, "_domainkey", mailSubdomain]),
                domainName: value,
            });
        });

        new MxRecord(this, "MxRecord", {
            zone: hostedZone,
            recordName: mailDomain,
            values: [{ priority: 10, hostName: `inbound-smtp.${region}.amazonaws.com` }],
        });

        new TxtRecord(this, "SpfRecord", {
            zone: hostedZone,
            recordName: mailDomain,
            values: ["v=spf1 include:amazonses.com ~all"],
        });

        new TxtRecord(this, "DmarcRecord", {
            zone: hostedZone,
            recordName: `_dmarc.${mailDomain}`,
            values: ["v=DMARC1; p=quarantine; adkim=s; aspf=s;"],
        });

        const inboundBucket = new Bucket(this, "InboundEmailBucket", {
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [{ expiration: Duration.days(90), prefix: "inbound/" }],
        });

        const ruleSet = new ReceiptRuleSet(this, "ReceiptRuleSet", {
            receiptRuleSetName: `${id}-inbound`,
        });

        ruleSet.addRule("InboundRule", {
            recipients: [mailDomain],
            actions: [new actions.S3({ bucket: inboundBucket, objectKeyPrefix: "inbound/" })],
        });

        if (isSandbox) {
            sandboxRecipients.forEach((email, i) => {
                new EmailIdentity(this, `SandboxRecipient${i}`, {
                    identity: Identity.email(email),
                });
            });
        }

        sendEmailLambda.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["ses:SendEmail", "ses:SendRawEmail"],
                resources: [
                    `arn:aws:ses:${region}:${account}:identity/${mailDomain}`,
                    ...sandboxRecipients.map(
                        (email) => `arn:aws:ses:${region}:${account}:identity/${email}`,
                    ),
                    `arn:aws:ses:${region}:${account}:configuration-set/${configurationSet.configurationSetName}`,
                ],
            }),
        );
    }
}
```

---

## Email Domain Authentication Explained

### Why Use a Mail Subdomain?

Using `mail.example.com` instead of `example.com` directly:

- Isolates email reputation from the root domain
- Prevents conflicts with existing MX records
- Allows independent DMARC policies for transactional vs marketing email
- Makes it easy to move email providers without affecting the main domain

### DNS Records Created

| Record Type | Name | Value | Purpose |
|------------|------|-------|---------|
| CNAME (x3) | `{token}._domainkey.mail` | SES DKIM token | DKIM signing verification |
| MX | `mail.example.com` | `inbound-smtp.{region}.amazonaws.com` | Inbound email routing |
| TXT | `mail.example.com` | `v=spf1 include:amazonses.com ~all` | SPF authorization |
| TXT | `_dmarc.mail.example.com` | `v=DMARC1; p=quarantine; adkim=s; aspf=s;` | DMARC policy |

### DKIM CNAME Record Construction

SES provides three DKIM tokens. The CDK `dkimDnsTokenName` properties return fully qualified domain names (e.g., `abc123._domainkey.mail.staging.example.com`), but `CnameRecord` automatically appends the hosted zone name. To avoid duplication, extract just the token hash and build a relative record name:

```typescript
const tokenHash = Fn.select(0, Fn.split(".", emailIdentity.dkimDnsTokenName1));
new CnameRecord(this, "DkimCname1", {
    zone: hostedZone,
    recordName: Fn.join(".", [tokenHash, "_domainkey", "mail"]),
    domainName: emailIdentity.dkimDnsTokenValue1,
});
```

---

## SES Sandbox vs Production

### Sandbox Mode (Development)

SES starts in sandbox mode, which restricts sending to verified addresses only.

```typescript
if (isSandbox) {
    sandboxRecipients.forEach((email, i) => {
        new EmailIdentity(this, `SandboxRecipient${i}`, {
            identity: Identity.email(email),
        });
    });
}
```

**Sandbox limitations:**
- Can only send to verified email addresses
- 200 emails per 24-hour period
- 1 email per second

### Production Mode

To move out of sandbox:
1. Request production access via the AWS SES console
2. Remove `sandboxRecipients` from the construct (or keep for the IAM policy — they're harmless)
3. SES will then allow sending to any address

---

## Best Practices

1. **Non-blocking**: Always use `InvocationType: "Event"` — email must never block business logic
2. **Graceful degradation**: If `SEND_EMAIL_FUNCTION` is missing, warn and return — don't throw
3. **Centralized sending**: Route all email through a single Lambda for auditing and rate limiting
4. **HTML + Text**: Always provide both bodies — some clients require a text alternative
5. **Separate mail subdomain**: Use `mail.yourdomain.com` to isolate email reputation

## Common Issues

- **"Email address is not verified"**: SES sandbox — add recipient to `sandboxRecipients` or request production access
- **"AccessDenied" on SES SendEmail**: IAM policy must include **both** the identity ARN and the configuration set ARN
- **DKIM records not validating**: Propagation takes up to 72 hours; ensure CNAME records use relative names
- **SEND_EMAIL_FUNCTION not found**: Invoker Lambda must be listed in `invokers` array
