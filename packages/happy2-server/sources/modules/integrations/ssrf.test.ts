import { describe, expect, it } from "vitest";
import { isPublicAddress, StrictWebhookUrlPolicy } from "./ssrf.js";

describe("StrictWebhookUrlPolicy", () => {
    it("rejects non-HTTPS, credentials, local names, private addresses, and custom ports", () => {
        const policy = new StrictWebhookUrlPolicy();
        for (const url of [
            "http://hooks.example.com/events",
            "https://user:password@hooks.example.com/events",
            "https://localhost/events",
            "https://service.internal/events",
            "https://127.0.0.1/events",
            "https://10.1.2.3/events",
            "https://[::1]/events",
            "https://hooks.example.com:8443/events",
        ]) {
            expect(() => policy.validateForStorage(url), url).toThrow();
        }
        expect(policy.validateForStorage("https://hooks.example.com/events?version=1")).toBe(
            "https://hooks.example.com/events?version=1",
        );
        expect(policy.validateForStorage("https://[2606:4700:4700::1111]/events")).toBe(
            "https://[2606:4700:4700::1111]/events",
        );
    });

    it("rejects DNS answers if any address is non-public and deduplicates safe answers", async () => {
        const unsafe = new StrictWebhookUrlPolicy({
            resolve: async () => [
                { address: "8.8.8.8", family: 4 },
                { address: "192.168.1.8", family: 4 },
            ],
        });
        await expect(unsafe.resolveForDelivery("https://hooks.example.com/event")).rejects.toThrow(
            "non-public",
        );

        const safe = new StrictWebhookUrlPolicy({
            resolve: async () => [
                { address: "8.8.8.8", family: 4 },
                { address: "8.8.8.8", family: 4 },
                { address: "2606:4700:4700::1111", family: 6 },
            ],
        });
        await expect(safe.resolveForDelivery("https://hooks.example.com/event")).resolves.toEqual({
            url: "https://hooks.example.com/event",
            addresses: [
                { address: "8.8.8.8", family: 4 },
                { address: "2606:4700:4700::1111", family: 6 },
            ],
        });
    });
});

describe("isPublicAddress", () => {
    it("recognizes public addresses without allowing private or transition ranges", () => {
        expect(isPublicAddress("8.8.8.8")).toBe(true);
        expect(isPublicAddress("192.168.0.1")).toBe(false);
        expect(isPublicAddress("203.0.113.1")).toBe(false);
        expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
        expect(isPublicAddress("fd00::1")).toBe(false);
        expect(isPublicAddress("2001:db8::1")).toBe(false);
        expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    });
});
