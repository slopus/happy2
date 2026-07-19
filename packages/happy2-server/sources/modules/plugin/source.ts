import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import type { RequestOptions } from "node:http";
import type { WebhookUrlPolicy } from "../integrations/ssrf.js";
import { PluginError, type PluginSource } from "./types.js";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface PluginArchiveDownload {
    body: Buffer;
    finalUrl: string;
}

export interface PluginArchiveDownloadOptions {
    onProgress?: (update: { receivedBytes: number; totalBytes?: number }) => void;
    signal?: AbortSignal;
}

export interface PluginArchiveDownloader {
    download(url: string, options?: PluginArchiveDownloadOptions): Promise<PluginArchiveDownload>;
}

export interface RemotePluginSource {
    archiveUrl: string;
    kind: "github" | "zip_url";
    repositoryUrl?: string;
}

/** Downloads bounded public HTTPS archives while pinning every redirect hop to policy-approved addresses. */
export class NodePluginArchiveDownloader implements PluginArchiveDownloader {
    constructor(private readonly urlPolicy: WebhookUrlPolicy) {}

    async download(
        url: string,
        options: PluginArchiveDownloadOptions = {},
    ): Promise<PluginArchiveDownload> {
        let current = url;
        for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
            options.signal?.throwIfAborted();
            const destination = await this.urlPolicy.resolveForDelivery(current);
            const response = await downloadOnce(destination, options);
            if (response.redirect) {
                if (redirects === MAX_REDIRECTS)
                    throw new PluginError(
                        "invalid_package",
                        "Plugin download redirected too many times",
                    );
                current = new URL(response.redirect, destination.url).toString();
                continue;
            }
            return { body: response.body, finalUrl: destination.url };
        }
        throw new Error("Unreachable plugin download redirect state");
    }
}

/** Normalizes an administrator-supplied ZIP or GitHub URL into a remotely checkable source. */
export function remotePluginSource(kind: "github" | "zip_url", value: string): RemotePluginSource {
    if (kind === "zip_url") {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new PluginError("unsupported_source", "ZIP URL must be an absolute HTTPS URL");
        }
        if (url.protocol !== "https:" || url.username || url.password || url.hash)
            throw new PluginError(
                "unsupported_source",
                "ZIP URL must be public HTTPS without credentials or a fragment",
            );
        return { kind, archiveUrl: url.toString() };
    }
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new PluginError("unsupported_source", "GitHub URL is invalid");
    }
    if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "github.com" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new PluginError(
            "unsupported_source",
            "GitHub source must be an https://github.com repository URL",
        );
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || parts.length === 3 || (parts.length > 2 && parts[2] !== "tree"))
        throw new PluginError(
            "unsupported_source",
            "GitHub URL must identify a repository or one repository tree ref",
        );
    const owner = githubSegment(parts[0]!, "owner");
    const repository = githubSegment(parts[1]!.replace(/\.git$/i, ""), "repository");
    const ref = parts[2] === "tree" ? parts.slice(3).join("/") : undefined;
    if (parts[2] === "tree" && !ref)
        throw new PluginError("unsupported_source", "GitHub tree URL must include a ref");
    const repositoryUrl = `https://github.com/${owner}/${repository}`;
    return {
        kind,
        repositoryUrl,
        archiveUrl: `${repositoryUrl}/archive/${ref ? `${ref}.zip` : "HEAD.zip"}`,
    };
}

export function downloadedPluginSource(
    remote: RemotePluginSource,
    packagePath: string,
): PluginSource {
    if (remote.kind === "zip_url") return { kind: "zip_url", reference: remote.archiveUrl };
    const encoded = Buffer.from(
        JSON.stringify({ archiveUrl: remote.archiveUrl, packagePath }),
        "utf8",
    ).toString("base64url");
    return { kind: "github", reference: `github:${encoded}` };
}

export function uploadedPluginSource(packageDigest: string): PluginSource {
    return { kind: "upload", reference: `upload:${packageDigest}` };
}

export function remotePluginSourceFromInstalled(source: PluginSource): RemotePluginSource & {
    packagePath?: string;
} {
    if (source.kind === "zip_url") return remotePluginSource("zip_url", source.reference);
    if (source.kind !== "github" || !source.reference.startsWith("github:"))
        throw new PluginError(
            "unsupported_source",
            "This plugin source cannot be checked remotely",
        );
    try {
        const parsed = JSON.parse(
            Buffer.from(source.reference.slice("github:".length), "base64url").toString("utf8"),
        ) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        const archiveUrl = (parsed as Record<string, unknown>).archiveUrl;
        const packagePath = (parsed as Record<string, unknown>).packagePath;
        if (typeof archiveUrl !== "string" || typeof packagePath !== "string") throw new Error();
        return { kind: "github", archiveUrl, packagePath };
    } catch {
        throw new PluginError("invalid_package", "Installed GitHub plugin source is malformed");
    }
}

async function downloadOnce(
    destination: Awaited<ReturnType<WebhookUrlPolicy["resolveForDelivery"]>>,
    options: PluginArchiveDownloadOptions,
): Promise<{ body: Buffer; redirect?: string }> {
    const url = new URL(destination.url);
    if (url.protocol !== "https:")
        throw new PluginError("unsupported_source", "Plugin downloads require HTTPS");
    if (!destination.addresses.length) throw new Error("Plugin download has no approved address");
    const digest = createHash("sha256").update(destination.url).digest();
    const target = destination.addresses[digest.readUInt32BE(0) % destination.addresses.length]!;
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [target]);
        else callback(null, target.address, target.family);
    };
    const requestOptions: RequestOptions = {
        agent: false,
        headers: {
            accept: "application/zip, application/octet-stream",
            "user-agent": "happy2-plugin/1.0",
        },
        lookup,
        method: "GET",
        setHost: true,
    };
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error: Error | undefined, result?: { body: Buffer; redirect?: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve(result!);
        };
        const request = httpsRequest(url, requestOptions, (response) => {
            const status = response.statusCode ?? 0;
            if ([301, 302, 303, 307, 308].includes(status)) {
                response.resume();
                const location = response.headers.location;
                if (!location) return finish(new Error("Plugin download redirect has no location"));
                finish(undefined, { body: Buffer.alloc(0), redirect: location });
                return;
            }
            if (status < 200 || status >= 300) {
                response.resume();
                finish(
                    new PluginError("invalid_package", `Plugin download returned HTTP ${status}`),
                );
                return;
            }
            const declared = Number(response.headers["content-length"]);
            if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) {
                response.destroy(new Error("Plugin ZIP exceeds the 50 MiB download limit"));
                return;
            }
            const chunks: Buffer[] = [];
            let receivedBytes = 0;
            response.on("data", (chunk: Buffer | string) => {
                const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                receivedBytes += body.byteLength;
                if (receivedBytes > MAX_ARCHIVE_BYTES) {
                    response.destroy(new Error("Plugin ZIP exceeds the 50 MiB download limit"));
                    return;
                }
                chunks.push(body);
                options.onProgress?.({
                    receivedBytes,
                    ...(Number.isFinite(declared) && declared >= 0 ? { totalBytes: declared } : {}),
                });
            });
            response.once("error", (error) => finish(error));
            response.once("end", () => finish(undefined, { body: Buffer.concat(chunks) }));
        });
        const timer = setTimeout(
            () => request.destroy(new Error("Plugin download timed out")),
            DOWNLOAD_TIMEOUT_MS,
        );
        timer.unref();
        const abort = () =>
            request.destroy(options.signal?.reason ?? new Error("Plugin download aborted"));
        options.signal?.addEventListener("abort", abort, { once: true });
        request.once("error", (error) => finish(error));
        request.end();
    });
}

function githubSegment(value: string, name: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(value))
        throw new PluginError("unsupported_source", `GitHub ${name} is invalid`);
    return value;
}
