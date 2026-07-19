import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());

vi.mock("node:https", () => ({ request }));

import { NodePluginPackageLinkDownloader } from "./packageLinkDownloader.js";

describe("NodePluginPackageLinkDownloader", () => {
    test("returns the pinned address array when Node requests all lookup results", async () => {
        request.mockImplementation((_url, options, onResponse) => {
            const handle = new EventEmitter() as EventEmitter & { end(): void };
            handle.end = () => {
                options.lookup(
                    "downloads.example.com",
                    { all: true },
                    (
                        error: Error | null,
                        addresses: Array<{ address: string; family: number }>,
                    ) => {
                        expect(error).toBeNull();
                        expect(addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);

                        const response = new EventEmitter() as EventEmitter & {
                            headers: Record<string, string>;
                            statusCode: number;
                        };
                        response.headers = {};
                        response.statusCode = 200;
                        onResponse(response);
                        response.emit("data", Buffer.from("zip"));
                        response.emit("end");
                    },
                );
            };
            return handle;
        });

        const downloader = new NodePluginPackageLinkDownloader({
            validateForStorage: (url) => url,
            resolveForDelivery: async (url) => ({
                url,
                addresses: [{ address: "93.184.216.34", family: 4 }],
            }),
        });

        await expect(
            downloader.download("https://downloads.example.com/plugin.zip"),
        ).resolves.toEqual({
            body: Buffer.from("zip"),
            url: "https://downloads.example.com/plugin.zip",
        });
    });
});
