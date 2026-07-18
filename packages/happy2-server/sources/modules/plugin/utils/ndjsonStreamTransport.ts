import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { SandboxTerminalHandle } from "../../sandbox/index.js";

const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
const GRACEFUL_CLOSE_MS = 250;

/** MCP transport over one long-lived newline-delimited stdio process in a plugin container. */
export class NdjsonStreamTransport implements Transport {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
    private buffer = "";
    private started = false;
    private closed = false;

    constructor(private readonly handle: SandboxTerminalHandle) {}

    async start(): Promise<void> {
        if (this.started) throw new Error("Plugin MCP transport was already started");
        this.started = true;
        this.handle.stdout.setEncoding("utf8");
        this.handle.stdout.on("data", (chunk: string) => this.read(chunk));
        this.handle.stdout.on("error", (error) => this.onerror?.(error));
        this.handle.stdin.on("error", (error) => this.onerror?.(error));
        this.handle.stderr.on("data", () => undefined);
        void this.handle.wait.then(
            ({ exitCode, signal }) => {
                if (this.closed) return;
                const detail = signal ? `signal ${signal}` : `exit code ${exitCode ?? -1}`;
                this.onerror?.(new Error(`Plugin MCP process stopped with ${detail}`));
                void this.close();
            },
            (error: unknown) => {
                if (!this.closed)
                    this.onerror?.(error instanceof Error ? error : new Error(String(error)));
                void this.close();
            },
        );
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (!this.started || this.closed) throw new Error("Plugin MCP transport is not open");
        const line = `${JSON.stringify(message)}\n`;
        if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES)
            throw new Error("Plugin MCP message exceeds the 8 MiB limit");
        await new Promise<void>((resolve, reject) =>
            this.handle.stdin.write(line, "utf8", (error) => (error ? reject(error) : resolve())),
        );
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.handle.stdin.end();
        const exited = await Promise.race([
            this.handle.wait.then(
                () => true,
                () => true,
            ),
            new Promise<false>((resolve) => {
                const timer = setTimeout(() => resolve(false), GRACEFUL_CLOSE_MS);
                timer.unref();
            }),
        ]);
        if (!exited) this.handle.close();
        this.onclose?.();
    }

    private read(chunk: string): void {
        if (this.closed) return;
        this.buffer += chunk;
        for (;;) {
            const newline = this.buffer.indexOf("\n");
            if (newline < 0) {
                if (Buffer.byteLength(this.buffer, "utf8") > MAX_MESSAGE_BYTES) {
                    this.onerror?.(new Error("Plugin MCP output exceeded the 8 MiB message limit"));
                    void this.close();
                }
                return;
            }
            const line = this.buffer.slice(0, newline).replace(/\r$/, "");
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
                this.onerror?.(new Error("Plugin MCP output exceeded the 8 MiB message limit"));
                void this.close();
                return;
            }
            try {
                const message = JSONRPCMessageSchema.parse(JSON.parse(line));
                this.onmessage?.(message);
                if (this.closed) return;
            } catch {
                this.onerror?.(new Error("Plugin MCP process emitted invalid JSON-RPC"));
                void this.close();
                return;
            }
        }
    }
}
