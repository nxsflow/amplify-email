import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    // Externalize all peer dependencies — they are provided by the consumer
    external: ["aws-cdk-lib", "constructs", "@aws-amplify/plugin-types"],
});
