import type { IFunction } from "aws-cdk-lib/aws-lambda";

// ---------------------------------------------------------------------------
// Input props for defineEmail()
// ---------------------------------------------------------------------------

export interface EmailProps {
    /**
     * Custom mail domain for sending (e.g. "mail.nxsflow.com").
     *
     * When provided together with `hostedZoneId` and `hostedZoneDomain`,
     * the construct creates a verified SES domain identity with EasyDKIM
     * and publishes DKIM, SPF, DMARC, and MX records in Route 53.
     *
     * When omitted, SES uses its default MAIL FROM domain (a subdomain of
     * `amazonses.com`). You can still send email — it just won't carry
     * your own domain's DKIM/DMARC alignment.
     */
    domain?: string;

    /**
     * Route 53 hosted zone ID for DNS record creation (DKIM, SPF, DMARC, MX).
     * Required when `domain` is provided.
     */
    hostedZoneId?: string;

    /**
     * The root domain the hosted zone belongs to (e.g. "nxsflow.com").
     * Required when `domain` is provided.
     */
    hostedZoneDomain?: string;

    /**
     * Local-part of the default sender address (e.g. "noreply").
     * When a custom `domain` is set, the full sender becomes
     * `${defaultSender}@${domain}`.
     *
     * @default "noreply"
     */
    defaultSender?: string;

    /**
     * Display name shown in email clients (e.g. "NexusFlow").
     *
     * @default "NexusFlow"
     */
    defaultSenderName?: string;

    /**
     * When true, creates SES `EmailIdentity` resources for each address
     * in `sandboxRecipients` so they receive verification emails.
     *
     * @default false
     */
    isSandbox?: boolean;

    /**
     * Email addresses to verify in SES sandbox mode.
     * Only used when `isSandbox` is true.
     */
    sandboxRecipients?: string[];

    /**
     * Timeout for the send-email Lambda in seconds.
     *
     * @default 15
     */
    timeoutSeconds?: number;
}

// ---------------------------------------------------------------------------
// Resources exposed after construct instantiation
// ---------------------------------------------------------------------------

export interface EmailResources {
    /** The send-email Lambda function (for grantInvoke, addEnvironment). */
    lambda: IFunction;

    /**
     * The mail domain used for sending.
     * When a custom domain is configured, this is that domain (e.g. "mail.nxsflow.com").
     * When no domain is configured, this is undefined (SES uses amazonses.com).
     */
    emailDomain: string | undefined;

    /**
     * SES domain identity ARN — use as Cognito emailConfiguration.sourceArn.
     * Undefined when no custom domain is configured.
     */
    sesIdentityArn: string | undefined;

    /** Send-email Lambda function name — pass as SEND_EMAIL_FUNCTION env var. */
    lambdaFunctionName: string;
}
