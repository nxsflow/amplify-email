import type { IFunction } from "aws-cdk-lib/aws-lambda";

// ---------------------------------------------------------------------------
// Input props for defineEmail()
// ---------------------------------------------------------------------------

export interface EmailProps {
    /**
     * The mail subdomain to use for sending (e.g. "mail.nxsflow.com").
     * Defaults to "mail.nxsflow.com" when not provided.
     *
     * @default "mail.nxsflow.com"
     */
    domain?: string;

    /**
     * Route 53 hosted zone ID for DNS record creation (DKIM, SPF, DMARC).
     * Required for domain authentication.
     */
    hostedZoneId?: string;

    /**
     * The root domain the hosted zone belongs to (e.g. "nxsflow.com").
     */
    hostedZoneDomain?: string;

    /**
     * Local-part of the default sender address (e.g. "noreply").
     * Full address becomes `${defaultSender}@${domain}`.
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
     * When true, configures SES for sandbox mode and verifies sandboxRecipients.
     *
     * @default false
     */
    isSandbox?: boolean;

    /**
     * Email addresses to verify in SES sandbox mode.
     * Only needed when isSandbox is true.
     */
    sandboxRecipients?: string[];

    // TODO: template overrides, unsubscribe config, email settings link
}

// ---------------------------------------------------------------------------
// Resources exposed after construct instantiation
// ---------------------------------------------------------------------------

export interface EmailResources {
    /** The send-email Lambda function (for grantInvoke, addEnvironment). */
    lambda: IFunction;

    /** The mail domain used for sending (e.g. "mail.nxsflow.com"). */
    emailDomain: string;

    /** SES domain identity ARN — use as Cognito sourceArn. */
    sesIdentityArn: string;

    /** Send-email Lambda function name — pass as SEND_EMAIL_FUNCTION env var. */
    lambdaFunctionName: string;
}
