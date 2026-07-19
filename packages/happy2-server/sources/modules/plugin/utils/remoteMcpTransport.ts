import { createId } from "@paralleldrive/cuid2";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { WebhookUrlPolicy } from "../../integrations/ssrf.js";
import type { WebhookTransport } from "../../integrations/types.js";

interface RemoteMcpTransportOptions {
    headers: Readonly<Record<string, string>>;
    installationId: string;
    remoteTransport: WebhookTransport;
    signal?: AbortSignal;
    url: string;
    urlPolicy: WebhookUrlPolicy;
}

/** MCP client transport that preserves Happy's public-address pinning for every remote request. */
export class RemotePluginMcpTransport implements Transport {
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: <T extends JSONRPCMessage>(message: T) => void;
    sessionId?: string;
    private closed = false;
    private protocolVersion?: string;

    constructor(private readonly options: RemoteMcpTransportOptions) {}

    async start(): Promise<void> {
        if (this.closed) throw new Error("Remote plugin MCP transport is closed");
        this.options.signal?.throwIfAborted();
    }

    setProtocolVersion(version: string): void {
        this.protocolVersion = version;
    }

    async send(message: JSONRPCMessage): Promise<void> {
        if (this.closed) throw new Error("Remote plugin MCP transport is closed");
        this.options.signal?.throwIfAborted();
        const destination = await this.options.urlPolicy.resolveForDelivery(this.options.url);
        const eventId = createId();
        const response = await this.options.remoteTransport.deliver({
            allowedAddresses: destination.addresses,
            body: JSON.stringify(message),
            deliveryId: `plugin-mcp:${this.options.installationId}:${eventId}`,
            eventId,
            eventType: "plugin.mcp.request",
            headers: {
                ...this.options.headers,
                accept: "application/json, text/event-stream",
                "content-type": "application/json",
                ...(this.protocolVersion ? { "mcp-protocol-version": this.protocolVersion } : {}),
                ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
            },
            url: destination.url,
        });
        this.options.signal?.throwIfAborted();
        if (response.statusCode < 200 || response.statusCode >= 300)
            throw new Error(`Remote MCP request returned HTTP ${response.statusCode}`);
        const nextSessionId = response.headers?.["mcp-session-id"];
        if (nextSessionId) this.sessionId = nextSessionId;
        for (const received of jsonRpcMessages(response.body ?? "")) this.onmessage?.(received);
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        if (this.sessionId) {
            try {
                const destination = await this.options.urlPolicy.resolveForDelivery(
                    this.options.url,
                );
                const eventId = createId();
                const response = await this.options.remoteTransport.deliver({
                    allowedAddresses: destination.addresses,
                    body: "",
                    deliveryId: `plugin-mcp-close:${this.options.installationId}:${eventId}`,
                    eventId,
                    eventType: "plugin.mcp.close",
                    headers: {
                        ...this.options.headers,
                        ...(this.protocolVersion
                            ? { "mcp-protocol-version": this.protocolVersion }
                            : {}),
                        "mcp-session-id": this.sessionId,
                    },
                    method: "DELETE",
                    url: destination.url,
                });
                if (
                    (response.statusCode < 200 || response.statusCode >= 300) &&
                    response.statusCode !== 405
                )
                    throw new Error(
                        `Remote MCP session close returned HTTP ${response.statusCode}`,
                    );
            } catch (error) {
                this.onerror?.(error instanceof Error ? error : new Error(String(error)));
            }
        }
        this.onclose?.();
    }
}

function jsonRpcMessages(body: string): JSONRPCMessage[] {
    const trimmed = body.trim();
    if (!trimmed) return [];
    const direct = jsonRpcMessage(trimmed);
    if (direct) return [direct];
    const messages: JSONRPCMessage[] = [];
    let data: string[] = [];
    const flush = () => {
        const message = jsonRpcMessage(data.join("\n"));
        if (message) messages.push(message);
        data = [];
    };
    for (const line of body.split(/\r?\n/)) {
        if (!line) flush();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    flush();
    if (!messages.length) throw new Error("Remote MCP returned an invalid JSON-RPC response");
    return messages;
}

function jsonRpcMessage(source: string): JSONRPCMessage | undefined {
    if (!source) return undefined;
    try {
        const value = JSON.parse(source) as unknown;
        return value && typeof value === "object" && !Array.isArray(value)
            ? (value as JSONRPCMessage)
            : undefined;
    } catch {
        return undefined;
    }
}
