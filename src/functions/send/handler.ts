// src/functions/send/handler.ts
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { renderStandardTemplate } from "../../templates/standard.js";

const ses = new SESv2Client({});

export interface SendEmailPayload {
    /** Full recipient email address. */
    to: string;
    /** Email subject line. */
    subject: string;
    /** Header text for the standard template. */
    header?: string;
    /** Main body text — used by the standard template. */
    body: string;
    /** Call-to-action button for the standard template. */
    callToAction?: { label: string; url: string };
    /** Footer text for the standard template. */
    footer?: string;
    /** Override sender local-part. Falls back to DEFAULT_SENDER env. */
    sender?: string;
    /** Override sender display name. Falls back to DEFAULT_SENDER_NAME env. */
    senderName?: string;
}

export interface SendEmailResult {
    messageId: string | undefined;
}

export const handler = async (event: SendEmailPayload): Promise<SendEmailResult> => {
    const emailDomain = process.env.EMAIL_DOMAIN;
    const defaultSender = process.env.DEFAULT_SENDER ?? "noreply";
    const defaultSenderName = process.env.DEFAULT_SENDER_NAME ?? "";

    const sender = event.sender ?? defaultSender;
    const senderName = event.senderName ?? defaultSenderName;

    // Render template
    const { html: htmlBody, text: textBody } = renderStandardTemplate({
        body: event.body,
        ...(event.header !== undefined && { header: event.header }),
        ...(event.callToAction !== undefined && { callToAction: event.callToAction }),
        ...(event.footer !== undefined && { footer: event.footer }),
        ...(senderName ? { brandName: senderName } : {}),
    });

    // Build the From address
    let fromAddress: string;
    if (emailDomain) {
        const address = `${sender}@${emailDomain}`;
        fromAddress = senderName ? `"${senderName}" <${address}>` : address;
    } else {
        fromAddress = sender.includes("@")
            ? senderName
                ? `"${senderName}" <${sender}>`
                : sender
            : sender;
    }

    const result = await ses.send(
        new SendEmailCommand({
            FromEmailAddress: fromAddress,
            Destination: { ToAddresses: [event.to] },
            Content: {
                Simple: {
                    Subject: { Data: event.subject, Charset: "UTF-8" },
                    Body: {
                        Text: { Data: textBody, Charset: "UTF-8" },
                        Html: { Data: htmlBody, Charset: "UTF-8" },
                    },
                },
            },
        }),
    );

    console.log("Email sent:", { messageId: result.MessageId, to: event.to });
    return { messageId: result.MessageId };
};
