import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { SandboxTerminalHandle } from "../../sandbox/index.js";
import { NdjsonStreamTransport } from "./ndjsonStreamTransport.js";

describe("NdjsonStreamTransport", () => {
    it("forwards stderr chunks to the installation diagnostic collector", async () => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => stdin.once("finish", () => resolve({ exitCode: 0, signal: null })),
        );
        const chunks: string[] = [];
        const transport = new NdjsonStreamTransport(
            { stdin, stdout, stderr, wait, close: () => undefined },
            (chunk) => chunks.push(chunk),
        );
        await transport.start();

        stderr.write("Error: native module failed to load\n");

        expect(chunks).toEqual(["Error: native module failed to load\n"]);
        await transport.close();
    });

    it("limits individual frames rather than a chunk containing several valid frames", async () => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => stdin.once("finish", () => resolve({ exitCode: 0, signal: null })),
        );
        const handle: SandboxTerminalHandle = {
            stdin,
            stdout,
            stderr,
            wait,
            close: () => undefined,
        };
        const transport = new NdjsonStreamTransport(handle);
        const messages: JSONRPCMessage[] = [];
        transport.onmessage = (message) => messages.push(message);
        await transport.start();

        const payload = "x".repeat(5 * 1024 * 1024);
        stdout.write(
            `${JSON.stringify({ jsonrpc: "2.0", method: "first", params: { payload } })}\n${JSON.stringify({ jsonrpc: "2.0", method: "second", params: { payload } })}\n`,
        );

        expect(messages).toHaveLength(2);
        expect(
            messages.map((message) => ("method" in message ? message.method : undefined)),
        ).toEqual(["first", "second"]);
        await transport.close();
    });

    it("rejects parsed JSON that is not a JSON-RPC message", async () => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => stdin.once("finish", () => resolve({ exitCode: 0, signal: null })),
        );
        const transport = new NdjsonStreamTransport({
            stdin,
            stdout,
            stderr,
            wait,
            close: () => undefined,
        });
        const failure = new Promise<Error>((resolve) => {
            transport.onerror = resolve;
        });
        await transport.start();

        stdout.write("{}\n");

        await expect(failure).resolves.toMatchObject({
            message: "Plugin MCP process emitted invalid JSON-RPC",
        });
        await transport.close();
    });

    it("stops dispatching buffered frames when a message callback closes the transport", async () => {
        const stdin = new PassThrough();
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const wait = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
            (resolve) => stdin.once("finish", () => resolve({ exitCode: 0, signal: null })),
        );
        const transport = new NdjsonStreamTransport({
            stdin,
            stdout,
            stderr,
            wait,
            close: () => undefined,
        });
        const messages: JSONRPCMessage[] = [];
        let closed: Promise<void> | undefined;
        transport.onmessage = (message) => {
            messages.push(message);
            closed = transport.close();
        };
        await transport.start();

        stdout.write(
            `${JSON.stringify({ jsonrpc: "2.0", method: "first" })}\n${JSON.stringify({ jsonrpc: "2.0", method: "second" })}\n`,
        );

        await closed;
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ method: "first" });
    });
});
