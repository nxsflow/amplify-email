import { Construct } from "constructs";
import type { EmailProps, EmailResources } from "./types.js";

// TODO: implement in Phase 1
// import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
// import { EmailIdentity, DkimIdentity, Identity, ConfigurationSet, ... } from "aws-cdk-lib/aws-ses";
// import { CnameRecord, TxtRecord } from "aws-cdk-lib/aws-route53";

/**
 * CDK construct that provisions the full email infrastructure:
 * - SES EmailIdentity with DKIM (EasyDKIM)
 * - Route 53 DNS records (DKIM CNAMEs × 3, SPF TXT, DMARC TXT, MX)
 * - SES ConfigurationSet with CloudWatch event destinations
 * - Send-email NodejsFunction (Node 22, 15s timeout)
 * - IAM: ses:SendEmail granted to the send-email Lambda
 * - Sandbox: EmailIdentity per sandboxRecipients address
 *
 * Instantiated by EmailFactory inside defineEmail().
 */
export class AmplifyEmail extends Construct {
    public readonly resources: EmailResources;

    constructor(scope: Construct, id: string, props: EmailProps) {
        super(scope, id);

        // TODO: implement CDK infrastructure
        // For now, expose a placeholder so the skeleton compiles and tests pass.
        void props;

        // Placeholder — will be replaced by real CDK resources
        this.resources = {
            // biome-ignore lint/suspicious/noExplicitAny: placeholder, not real CDK
            lambda: {} as any,
            emailDomain: props.domain ?? "mail.nxsflow.com",
            sesIdentityArn: "",
            lambdaFunctionName: "",
        };
    }
}
