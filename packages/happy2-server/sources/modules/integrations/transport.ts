import { createHash } from "node:crypto";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import type {
    WebhookTransport,
    WebhookTransportRequest,
    WebhookTransportResponse,
} from "./types.js";

export interface NodeWebhookTransportOptions {
    timeoutMs?: number;
    maximumRequestBytes?: number;
    maximumResponseBytes?: number;
    userAgent?: string;
}

/**
 * Standard-library webhook transport. It never follows redirects and overrides
 * DNS lookup with an address approved by StrictWebhookUrlPolicy, preserving the
 * original hostname for Host and TLS certificate/SNI verification.
 */
export class NodeWebhookTransport implements WebhookTransport {
    private readonly timeoutMs: number;
    private readonly maximumRequestBytes: number;
    private readonly maximumResponseBytes: number;
    private readonly userAgent: string;

    constructor(options: NodeWebhookTransportOptions = {}) {
        this.timeoutMs = positiveInteger(options.timeoutMs ?? 10_000, "timeoutMs", 120_000);
        this.maximumRequestBytes = positiveInteger(
            options.maximumRequestBytes ?? 1_000_000,
            "maximumRequestBytes",
            10_000_000,
        );
        this.maximumResponseBytes = positiveInteger(
            options.maximumResponseBytes ?? 256_000,
            "maximumResponseBytes",
            2_000_000,
        );
        this.userAgent = options.userAgent ?? "happy2-webhook/1.0";
        if (!this.userAgent || /[\r\n]/.test(this.userAgent))
            throw new TypeError("userAgent must be a valid HTTP header value");
    }

    async deliver(input: WebhookTransportRequest): Promise<WebhookTransportResponse> {
        const url = new URL(input.url);
        if (url.protocol !== "http:" && url.protocol !== "https:")
            throw new Error("Webhook transport supports only HTTP and HTTPS");
        if (url.username || url.password)
            throw new Error("Webhook transport does not allow URL credentials");
        if (input.allowedAddresses.length === 0)
            throw new Error("Webhook transport requires an approved destination address");
        const requestBytes = Buffer.byteLength(input.body, "utf8");
        if (requestBytes > this.maximumRequestBytes)
            throw new Error("Webhook request body exceeds the configured limit");

        const target = selectAddress(input);
        const lookup: LookupFunction = (_hostname, _options, callback) => {
            if (_options.all) callback(null, [target]);
            else callback(null, target.address, target.family);
        };
        const headers: Record<string, string> = {
            ...input.headers,
            "content-length": String(requestBytes),
            "user-agent": this.userAgent,
        };
        const options: RequestOptions = {
            method: "POST",
            headers,
            lookup,
            // Prevent a pooled socket from carrying a later request to an address
            // that was not selected for that delivery.
            agent: false,
            setHost: true,
        };

        return new Promise<WebhookTransportResponse>((resolve, reject) => {
            let settled = false;
            const finish = (
                error: Error | undefined,
                response?: WebhookTransportResponse,
            ): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(response!);
            };
            const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
                url,
                options,
                (response) => {
                    response.once("error", (error) => finish(error));
                    const declaredLength = Number(response.headers["content-length"]);
                    if (
                        Number.isFinite(declaredLength) &&
                        declaredLength > this.maximumResponseBytes
                    ) {
                        response.destroy(
                            new Error("Webhook response body exceeds the configured limit"),
                        );
                        return;
                    }
                    const chunks: Buffer[] = [];
                    let received = 0;
                    response.on("data", (chunk: Buffer | string) => {
                        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        received += buffer.byteLength;
                        if (received > this.maximumResponseBytes) {
                            response.destroy(
                                new Error("Webhook response body exceeds the configured limit"),
                            );
                            return;
                        }
                        chunks.push(buffer);
                    });
                    response.once("end", () =>
                        finish(undefined, {
                            statusCode: response.statusCode ?? 0,
                            body: Buffer.concat(chunks).toString("utf8"),
                        }),
                    );
                },
            );
            const timer = setTimeout(() => {
                request.destroy(new Error("Webhook request timed out"));
            }, this.timeoutMs);
            timer.unref();
            request.once("error", (error) => finish(error));
            request.end(input.body, "utf8");
        });
    }
}

function selectAddress(input: WebhookTransportRequest): { address: string; family: 4 | 6 } {
    const digest = createHash("sha256").update(input.deliveryId, "utf8").digest();
    return input.allowedAddresses[digest.readUInt32BE(0) % input.allowedAddresses.length]!;
}

function positiveInteger(value: number, name: string, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
        throw new TypeError(`${name} must be an integer between 1 and ${maximum}`);
    return value;
}
