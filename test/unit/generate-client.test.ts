// test/unit/generate-client.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the aws-amplify module
vi.mock("aws-amplify", () => ({
    Amplify: {
        getConfig: vi.fn(),
    },
}));

// Mock the Lambda client
vi.mock("@aws-sdk/client-lambda", () => {
    const invoke = vi.fn().mockResolvedValue({
        StatusCode: 202,
        Payload: undefined,
    });
    return {
        // biome-ignore lint/complexity/useArrowFunction: vitest 4 requires function keyword for constructor mocks
        LambdaClient: vi.fn().mockImplementation(function () {
            return { send: invoke };
        }),
        // biome-ignore lint/complexity/useArrowFunction: vitest 4 requires function keyword for constructor mocks
        InvokeCommand: vi.fn().mockImplementation(function (input) {
            return input;
        }),
        __mockInvoke: invoke,
    };
});

import { Amplify } from "aws-amplify";
import { generateClient, resetClient } from "../../src/client/generate-client.js";

describe("generateClient", () => {
    beforeEach(() => {
        resetClient();
        vi.mocked(Amplify.getConfig).mockReturnValue({
            custom: {
                email: {
                    sendFunctionName: "test-send-function",
                    domain: "mail.example.com",
                    defaultSender: "noreply",
                    defaultSenderName: "TestApp",
                },
            },
        } as ReturnType<typeof Amplify.getConfig>);
    });

    it("returns a client with email.send method", () => {
        const client = generateClient();
        expect(client.email).toBeDefined();
        expect(typeof client.email.send).toBe("function");
    });

    it("returns the same singleton on repeated calls", () => {
        const client1 = generateClient();
        const client2 = generateClient();
        expect(client1).toBe(client2);
    });

    it("throws if email config is missing from Amplify config", () => {
        vi.mocked(Amplify.getConfig).mockReturnValue({} as ReturnType<typeof Amplify.getConfig>);
        expect(() => generateClient()).toThrow("email");
    });

    it("throws if sendFunctionName is missing", () => {
        vi.mocked(Amplify.getConfig).mockReturnValue({
            custom: { email: {} },
        } as ReturnType<typeof Amplify.getConfig>);
        expect(() => generateClient()).toThrow("sendFunctionName");
    });

    it("email.send invokes the Lambda with the correct payload", async () => {
        const { __mockInvoke } = (await import("@aws-sdk/client-lambda")) as unknown as {
            __mockInvoke: ReturnType<typeof vi.fn>;
        };
        const client = generateClient();

        await client.email.send({
            to: "user@example.com",
            subject: "Hello",
            body: "World",
            header: "Greetings",
        });

        expect(__mockInvoke).toHaveBeenCalled();
        // biome-ignore lint/style/noNonNullAssertion: test assertion after toHaveBeenCalled check
        const invocation = vi.mocked(__mockInvoke).mock.calls[0]![0];
        expect(invocation.FunctionName).toBe("test-send-function");
        expect(invocation.InvocationType).toBe("Event");
        const payload = JSON.parse(new TextDecoder().decode(invocation.Payload));
        expect(payload.to).toBe("user@example.com");
        expect(payload.subject).toBe("Hello");
        expect(payload.body).toBe("World");
        expect(payload.header).toBe("Greetings");
    });
});
