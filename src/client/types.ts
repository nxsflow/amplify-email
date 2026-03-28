// src/client/types.ts

export interface SendEmailInput {
    /** Recipient email address. */
    to: string;
    /** Email subject line. */
    subject: string;
    /** Header text displayed prominently at the top. */
    header?: string;
    /** Main body text. */
    body: string;
    /** Call-to-action button. */
    callToAction?: {
        label: string;
        url: string;
    };
    /** Footer text at the bottom. */
    footer?: string;
    /** Override sender local-part (e.g. "invitations"). */
    sender?: string;
    /** Override sender display name. */
    senderName?: string;
}

export interface SendEmailResult {
    /** SES message ID. Undefined for fire-and-forget invocations. */
    messageId: string | undefined;
}

export interface EmailClient {
    email: {
        /** Send an email using the standard template. Fire-and-forget by default. */
        send(input: SendEmailInput): Promise<SendEmailResult>;
    };
}

export interface EmailConfig {
    sendFunctionName: string;
    domain?: string;
    defaultSender?: string;
    defaultSenderName?: string;
}
