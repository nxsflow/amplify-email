import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/client/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external: [
        "aws-cdk-lib",
        "constructs",
        "@aws-amplify/plugin-types",
        "aws-amplify",
        "@aws-sdk/client-lambda",
        /^node:/,
    ],
});
