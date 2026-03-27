import type { ConstructFactory, ConstructFactoryGetInstanceProps } from "@aws-amplify/plugin-types";
import type { ResourceProvider } from "@aws-amplify/plugin-types";
import { AmplifyEmail } from "./construct.js";
import type { EmailProps, EmailResources } from "./types.js";

/**
 * Singleton factory for AmplifyEmail constructs.
 * Mirrors the DataFactory / FunctionFactory pattern from @aws-amplify/backend.
 *
 * Only one defineEmail() call is allowed per Amplify backend.
 */
export class EmailFactory implements ConstructFactory<ResourceProvider<EmailResources>> {
    static factoryCount = 0;
    private instance: ResourceProvider<EmailResources> | undefined;

    constructor(private readonly props: EmailProps) {
        EmailFactory.factoryCount++;
        if (EmailFactory.factoryCount > 1) {
            throw new Error(
                "defineEmail() can only be called once per Amplify backend. " +
                    "Pass a single defineEmail() result to defineBackend().",
            );
        }
    }

    getInstance(factoryProps: ConstructFactoryGetInstanceProps): ResourceProvider<EmailResources> {
        if (!this.instance) {
            const emailProps = this.props;
            const provider = factoryProps.constructContainer.getOrCompute({
                resourceGroupName: "email",
                generateContainerEntry: ({ scope }) => {
                    const construct = new AmplifyEmail(scope, "AmplifyEmail", emailProps);
                    return { resources: construct.resources };
                },
            });
            this.instance = provider as ResourceProvider<EmailResources>;
        }
        return this.instance;
    }
}

/**
 * Creates a factory that provides an AmplifyEmail CDK construct to defineBackend().
 *
 * @example
 * ```ts
 * import { defineEmail } from "@nxsflow/amplify-email";
 *
 * export const email = defineEmail({
 *   domain: "mail.nxsflow.com",
 *   hostedZoneId: "Z1234567890",
 *   hostedZoneDomain: "nxsflow.com",
 * });
 * ```
 */
export const defineEmail = (
    props: EmailProps = {},
): ConstructFactory<ResourceProvider<EmailResources>> => new EmailFactory(props);
