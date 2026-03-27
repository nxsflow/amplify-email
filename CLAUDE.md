# @nxsflow/amplify-email

Open-source AWS Amplify Gen 2 email category. Exports `defineEmail()` so users can add email infrastructure to any Amplify backend exactly like `defineData()` or `defineFunction()`:

```ts
import { defineEmail } from "@nxsflow/amplify-email";
import { defineBackend } from "@aws-amplify/backend";

export const email = defineEmail({ domain: "mail.nxsflow.com", ... });
defineBackend({ auth, data, email });
```

## Architecture

The library follows the `ConstructFactory<T>` pattern from `@aws-amplify/plugin-types`:

```
defineEmail(props)
  └── EmailFactory (implements ConstructFactory<ResourceProvider<EmailResources>>)
        └── getInstance() → AmplifyEmail CDK construct
              ├── NodejsFunction (send-email Lambda, Node 22, 15s)
              ├── SES EmailIdentity + DkimIdentity.easyDkim()
              ├── Route 53 DNS records (DKIM × 3, SPF, DMARC, MX)
              ├── SES ConfigurationSet + CloudWatch event destinations
              └── IAM: ses:SendEmail granted to the Lambda
```

`EmailResources` exposes `lambda`, `emailDomain`, `sesIdentityArn`, `lambdaFunctionName` for wiring into auth and other functions.

## Key Files

| File                   | Role                                               |
| ---------------------- | -------------------------------------------------- |
| `src/index.ts`         | Public API barrel                                  |
| `src/types.ts`         | `EmailProps` and `EmailResources` interfaces       |
| `src/factory.ts`       | `EmailFactory` + `defineEmail()` — the entry point |
| `src/construct.ts`     | `AmplifyEmail` CDK construct (SES + Lambda + DNS)  |
| `test/unit/factory.test.ts` | Smoke tests for the factory                   |

## Development Commands

```bash
pnpm install          # install deps
pnpm build            # compile to dist/ (tsup, ESM + CJS)
pnpm dev              # watch mode
pnpm test             # run vitest
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm format           # biome format --write
```

## Conventions

- **Tooling**: pnpm, tsup, vitest, biome
- **TypeScript**: strict mode, `moduleResolution: bundler`, ESNext target
- **Imports**: use `.js` extension in source (resolved to `.ts` by bundler)
- **Peer deps**: `aws-cdk-lib ^2`, `constructs ^10`, `@aws-amplify/plugin-types ^1` — never bundled
- **Exports**: dual ESM + CJS via tsup; types via `.d.ts`
- **Singleton**: `EmailFactory` enforces one `defineEmail()` per backend (throws on second call)
