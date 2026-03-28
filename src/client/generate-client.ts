// src/client/generate-client.ts

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { Amplify } from "aws-amplify";
import type { EmailClient, EmailConfig, SendEmailInput, SendEmailResult } from "./types.js";

let clientSingleton: EmailClient | undefined;
let lambda: LambdaClient | undefined;

function readConfig(): EmailConfig {
    const config = Amplify.getConfig();
    const emailConfig = (config as Record<string, unknown>).custom as
        | Record<string, unknown>
        | undefined;
    const email = emailConfig?.email as Partial<EmailConfig> | undefined;

    if (!email) {
        throw new Error(
            "@nxsflow/amplify-email: No email configuration found in Amplify outputs. " +
                "Make sure defineEmail() is passed to defineBackend() and the backend is deployed.",
        );
    }

    if (!email.sendFunctionName) {
        throw new Error(
            "@nxsflow/amplify-email: sendFunctionName is missing from email configuration. " +
                "Redeploy your backend to generate updated outputs.",
        );
    }

    return email as EmailConfig;
}

function createClient(config: EmailConfig): EmailClient {
    return {
        email: {
            async send(input: SendEmailInput): Promise<SendEmailResult> {
                if (!lambda) {
                    lambda = new LambdaClient({});
                }
                await lambda.send(
                    new InvokeCommand({
                        FunctionName: config.sendFunctionName,
                        InvocationType: "Event",
                        Payload: new TextEncoder().encode(JSON.stringify(input)),
                    }),
                );

                // Fire-and-forget: no messageId available
                return { messageId: undefined };
            },
        },
    };
}

export function generateClient(): EmailClient {
    if (!clientSingleton) {
        const config = readConfig();
        clientSingleton = createClient(config);
    }
    return clientSingleton;
}

/** Reset the singleton — for testing only. */
export function resetClient(): void {
    clientSingleton = undefined;
}
