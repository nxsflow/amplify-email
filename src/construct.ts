import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Duration, Fn, Stack } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
    CnameRecord,
    HostedZone,
    type IHostedZone,
    MxRecord,
    TxtRecord,
} from "aws-cdk-lib/aws-route53";
import {
    CloudWatchDimensionSource,
    ConfigurationSet,
    DkimIdentity,
    EmailIdentity,
    EmailSendingEvent,
    EventDestination,
    Identity,
} from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";
import type { EmailProps, EmailResources } from "./types.js";

const HANDLER_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "functions",
    "send",
);

/**
 * CDK construct that provisions email infrastructure for an Amplify backend.
 *
 * **With a custom domain** (`domain` + `hostedZoneId` + `hostedZoneDomain`):
 *   - SES EmailIdentity with EasyDKIM
 *   - Route 53 DNS records (DKIM CNAMEs × 3, SPF TXT, DMARC TXT, MX)
 *   - SES ConfigurationSet with CloudWatch event destinations
 *   - Send-email Lambda (Node 22, 15 s)
 *   - IAM: ses:SendEmail scoped to the domain identity
 *
 * **Without a custom domain** (zero-config):
 *   - SES uses its default amazonses.com MAIL FROM domain
 *   - Send-email Lambda is still created
 *   - Sandbox recipients are verified if `isSandbox` is true
 */
export class AmplifyEmail extends Construct {
    public readonly resources: EmailResources;

    constructor(scope: Construct, id: string, props: EmailProps) {
        super(scope, id);

        const {
            domain,
            hostedZoneId,
            hostedZoneDomain,
            defaultSender = "noreply",
            defaultSenderName = "NexusFlow",
            isSandbox = false,
            sandboxRecipients = [],
            timeoutSeconds = 15,
        } = props;

        const region = Stack.of(this).region;
        const account = Stack.of(this).account;
        // -----------------------------------------------------------------
        // Send-email Lambda
        // -----------------------------------------------------------------

        const sendFn = new NodejsFunction(this, "SendEmailFunction", {
            entry: path.join(HANDLER_DIR, "handler.ts"),
            handler: "handler",
            runtime: Runtime.NODEJS_22_X,
            timeout: Duration.seconds(timeoutSeconds),
            bundling: {
                // AWS SDK v3 is included in the Node 22 Lambda runtime
                externalModules: ["@aws-sdk/*"],
            },
            environment: {
                ...(domain ? { EMAIL_DOMAIN: domain } : {}),
                DEFAULT_SENDER: defaultSender,
                DEFAULT_SENDER_NAME: defaultSenderName,
            },
        });

        // -----------------------------------------------------------------
        // SES ConfigurationSet (always created — tracks send/delivery/bounce)
        // -----------------------------------------------------------------

        const configurationSet = new ConfigurationSet(this, "ConfigurationSet", {
            reputationMetrics: true,
        });

        const dimensionDefault = domain ? domain.replace(/\./g, "-") : "ses-default";

        configurationSet.addEventDestination("CloudWatch", {
            destination: EventDestination.cloudWatchDimensions([
                {
                    name: "Domain",
                    source: CloudWatchDimensionSource.EMAIL_HEADER,
                    defaultValue: dimensionDefault,
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

        // -----------------------------------------------------------------
        // Custom domain: SES identity + DNS records
        // -----------------------------------------------------------------

        let sesIdentityArn: string | undefined;

        if (domain && hostedZoneId && hostedZoneDomain) {
            sesIdentityArn = this.setupCustomDomain({
                sendFn,
                configurationSet,
                domain,
                hostedZoneId,
                hostedZoneDomain,
                sandboxRecipients,
                region,
                account,
            });
        } else {
            // No custom domain — grant broad SES send permission so the Lambda
            // can send from any verified identity in the account.
            sendFn.addToRolePolicy(
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["ses:SendEmail", "ses:SendRawEmail"],
                    resources: [`arn:aws:ses:${region}:${account}:identity/*`],
                }),
            );
        }

        // -----------------------------------------------------------------
        // Sandbox mode: verify individual recipient addresses
        // -----------------------------------------------------------------

        if (isSandbox) {
            for (const [i, email] of sandboxRecipients.entries()) {
                new EmailIdentity(this, `SandboxRecipient${i}`, {
                    identity: Identity.email(email),
                });
            }
        }

        // -----------------------------------------------------------------
        // Expose resources
        // -----------------------------------------------------------------

        this.resources = {
            lambda: sendFn,
            emailDomain: domain,
            sesIdentityArn,
            lambdaFunctionName: sendFn.functionName,
        };
    }

    // -----------------------------------------------------------------
    // Private: custom domain setup (SES identity + DNS + scoped IAM)
    // -----------------------------------------------------------------

    private setupCustomDomain(opts: {
        sendFn: NodejsFunction;
        configurationSet: ConfigurationSet;
        domain: string;
        hostedZoneId: string;
        hostedZoneDomain: string;
        sandboxRecipients: string[];
        region: string;
        account: string;
    }): string {
        const {
            sendFn,
            configurationSet,
            domain,
            hostedZoneId,
            hostedZoneDomain,
            sandboxRecipients,
            region,
            account,
        } = opts;

        const hostedZone: IHostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
            hostedZoneId,
            zoneName: hostedZoneDomain,
        });

        const emailIdentity = new EmailIdentity(this, "EmailIdentity", {
            identity: Identity.domain(domain),
            dkimIdentity: DkimIdentity.easyDkim(),
            configurationSet,
        });

        // --- DKIM CNAME records × 3 ---
        // dkimDnsTokenName returns the full FQDN; CnameRecord auto-appends
        // the zone, so we extract only the token hash to build a relative name.
        const mailSubdomain = domain.replace(`.${hostedZoneDomain}`, "");
        const dkimTokens = [
            {
                name: emailIdentity.dkimDnsTokenName1,
                value: emailIdentity.dkimDnsTokenValue1,
            },
            {
                name: emailIdentity.dkimDnsTokenName2,
                value: emailIdentity.dkimDnsTokenValue2,
            },
            {
                name: emailIdentity.dkimDnsTokenName3,
                value: emailIdentity.dkimDnsTokenValue3,
            },
        ];

        for (const [i, { name, value }] of dkimTokens.entries()) {
            const tokenHash = Fn.select(0, Fn.split(".", name));
            new CnameRecord(this, `DkimCname${i + 1}`, {
                zone: hostedZone,
                recordName: Fn.join(".", [tokenHash, "_domainkey", mailSubdomain]),
                domainName: value,
            });
        }

        // --- MX record (inbound routing to SES) ---
        new MxRecord(this, "MxRecord", {
            zone: hostedZone,
            recordName: domain,
            values: [{ priority: 10, hostName: `inbound-smtp.${region}.amazonaws.com` }],
        });

        // --- SPF TXT record ---
        new TxtRecord(this, "SpfRecord", {
            zone: hostedZone,
            recordName: domain,
            values: ["v=spf1 include:amazonses.com ~all"],
        });

        // --- DMARC TXT record ---
        new TxtRecord(this, "DmarcRecord", {
            zone: hostedZone,
            recordName: `_dmarc.${domain}`,
            values: ["v=DMARC1; p=quarantine; adkim=s; aspf=s;"],
        });

        // --- IAM: allow the Lambda to send through this domain ---
        sendFn.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ["ses:SendEmail", "ses:SendRawEmail"],
                resources: [
                    `arn:aws:ses:${region}:${account}:identity/${domain}`,
                    ...sandboxRecipients.map(
                        (email) => `arn:aws:ses:${region}:${account}:identity/${email}`,
                    ),
                    `arn:aws:ses:${region}:${account}:configuration-set/${configurationSet.configurationSetName}`,
                ],
            }),
        );

        return `arn:aws:ses:${region}:${account}:identity/${domain}`;
    }
}
