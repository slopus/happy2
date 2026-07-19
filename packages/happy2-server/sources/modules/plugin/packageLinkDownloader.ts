import { request } from "node:https";
import type { LookupFunction } from "node:net";
import type { WebhookUrlPolicy } from "../integrations/ssrf.js";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export interface PluginPackageLinkDownload {
    body: Buffer;
    url: string;
}

export interface PluginPackageLinkDownloader {
    download(url: string, signal?: AbortSignal): Promise<PluginPackageLinkDownload>;
}

/** Downloads bounded plugin ZIP links through the server's public-address policy with DNS-pinned HTTPS sockets and revalidated redirects. */
export class NodePluginPackageLinkDownloader implements PluginPackageLinkDownloader {
    constructor(private readonly policy: WebhookUrlPolicy) {}

    async download(url: string, signal?: AbortSignal): Promise<PluginPackageLinkDownload> {
        const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
        const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout;
        try {
            return await this.downloadFollowing(url, bounded, 0);
        } catch (error) {
            if (timeout.aborted && !signal?.aborted)
                throw new Error("Plugin link download timed out");
            throw error;
        }
    }

    private async downloadFollowing(
        input: string,
        signal: AbortSignal | undefined,
        redirects: number,
    ): Promise<PluginPackageLinkDownload> {
        const resolved = await this.policy.resolveForDelivery(input);
        const response = await downloadPinned(resolved.url, resolved.addresses[0]!, signal);
        if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
            if (redirects >= MAX_REDIRECTS)
                throw new Error("Plugin link redirected too many times");
            return this.downloadFollowing(
                new URL(response.location, resolved.url).toString(),
                signal,
                redirects + 1,
            );
        }
        if (response.statusCode < 200 || response.statusCode >= 300)
            throw new Error(`Plugin link returned HTTP ${response.statusCode}`);
        return { body: response.body, url: resolved.url };
    }
}

function downloadPinned(
    input: string,
    address: { address: string; family: 4 | 6 },
    signal?: AbortSignal,
): Promise<{ body: Buffer; location?: string; statusCode: number }> {
    const url = new URL(input);
    const lookup: LookupFunction = (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
    };
    return new Promise((resolve, reject) => {
        const requestHandle = request(
            url,
            {
                headers: { accept: "application/zip, application/octet-stream" },
                lookup,
                signal,
            },
            (response) => {
                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on("data", (chunk: Buffer) => {
                    bytes += chunk.byteLength;
                    if (bytes > MAX_ARCHIVE_BYTES) {
                        response.destroy(new Error("Plugin link exceeds 20 MiB"));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.once("error", reject);
                response.once("end", () =>
                    resolve({
                        body: Buffer.concat(chunks),
                        ...(typeof response.headers.location === "string"
                            ? { location: response.headers.location }
                            : {}),
                        statusCode: response.statusCode ?? 0,
                    }),
                );
            },
        );
        requestHandle.once("error", reject);
        requestHandle.end();
    });
}
