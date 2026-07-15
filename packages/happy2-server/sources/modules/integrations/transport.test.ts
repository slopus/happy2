import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { NodeWebhookTransport } from "./transport.js";
import type { WebhookTransportRequest } from "./types.js";

const servers: Server[] = [];

afterEach(async () => {
    for (const server of servers.splice(0)) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});

describe("NodeWebhookTransport", () => {
    it("pins the approved address, preserves Host, and does not follow redirects", async () => {
        let finalRequests = 0;
        const server = await listen(
            createServer((request, response) => {
                if (request.url === "/redirect") {
                    expect(request.headers.host).toMatch(/^hooks\.example\.invalid:/);
                    response.writeHead(302, { location: "/final" }).end("redirect");
                    return;
                }
                finalRequests += 1;
                response.end("must not be reached");
            }),
        );
        const port = (server.address() as AddressInfo).port;
        const transport = new NodeWebhookTransport();
        const response = await transport.deliver(
            request(`http://hooks.example.invalid:${port}/redirect`),
        );

        expect(response).toEqual({ statusCode: 302, body: "redirect" });
        expect(finalRequests).toBe(0);
    });

    it("enforces request, response, and total-time limits", async () => {
        const server = await listen(
            createServer((request, response) => {
                if (request.url === "/large") {
                    response.end("x".repeat(100));
                    return;
                }
                // Leave the response open so the transport deadline owns cancellation.
            }),
        );
        const port = (server.address() as AddressInfo).port;
        const base = `http://hooks.example.invalid:${port}`;

        await expect(
            new NodeWebhookTransport({ maximumRequestBytes: 4 }).deliver({
                ...request(`${base}/large`),
                body: "too large",
            }),
        ).rejects.toThrow("request body");
        await expect(
            new NodeWebhookTransport({ maximumResponseBytes: 32 }).deliver(
                request(`${base}/large`),
            ),
        ).rejects.toThrow("response body");
        await expect(
            new NodeWebhookTransport({ timeoutMs: 30 }).deliver(request(`${base}/slow`)),
        ).rejects.toThrow("timed out");
    });
});

function request(url: string): WebhookTransportRequest {
    return {
        deliveryId: "delivery_1",
        eventId: "event_1",
        eventType: "message.created",
        url,
        allowedAddresses: [{ address: "127.0.0.1", family: 4 }],
        body: JSON.stringify({ hello: "world" }),
        headers: { "content-type": "application/json" },
    };
}

async function listen(server: Server): Promise<Server> {
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
    });
    return server;
}
