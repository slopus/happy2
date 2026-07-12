import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { IntegrationError } from "./types.js";

export interface ResolvedWebhookUrl {
    url: string;
    addresses: ReadonlyArray<{ address: string; family: 4 | 6 }>;
}

export interface WebhookUrlPolicy {
    validateForStorage(value: string): string;
    resolveForDelivery(value: string): Promise<ResolvedWebhookUrl>;
}

export interface StrictWebhookUrlPolicyOptions {
    allowedPorts?: readonly number[];
    resolve?: (hostname: string) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;
}

/**
 * Rejects credentials, non-HTTPS URLs, local hostnames, non-approved ports, and
 * every non-public resolved address. Delivery transports must pin their socket to
 * one of the returned addresses so DNS rebinding cannot bypass this decision.
 */
export class StrictWebhookUrlPolicy implements WebhookUrlPolicy {
    private readonly allowedPorts: Set<number>;
    private readonly resolve: (
        hostname: string,
    ) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;

    constructor(options: StrictWebhookUrlPolicyOptions = {}) {
        const ports = options.allowedPorts ?? [443];
        if (
            ports.length === 0 ||
            ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65_535)
        )
            throw new TypeError("allowedPorts must contain valid TCP ports");
        this.allowedPorts = new Set(ports);
        this.resolve =
            options.resolve ??
            (async (hostname) => {
                const results = await lookup(hostname, { all: true, verbatim: true });
                return results.map(({ address, family }) => ({
                    address,
                    family: family === 6 ? 6 : 4,
                }));
            });
    }

    validateForStorage(value: string): string {
        let url: URL;
        try {
            url = new URL(value);
        } catch {
            throw new IntegrationError("invalid", "Webhook URL must be an absolute HTTPS URL");
        }
        if (url.protocol !== "https:")
            throw new IntegrationError("invalid", "Webhook URL must use HTTPS");
        if (url.username || url.password)
            throw new IntegrationError("invalid", "Webhook URL must not contain credentials");
        if (url.hash)
            throw new IntegrationError("invalid", "Webhook URL must not contain a fragment");
        const port = url.port ? Number(url.port) : 443;
        if (!this.allowedPorts.has(port))
            throw new IntegrationError("invalid", "Webhook URL uses a disallowed port");

        const hostname = unbracket(url.hostname).replace(/\.$/, "").toLowerCase();
        const literalFamily = isIP(hostname);
        if (!hostname || (!literalFamily && isLocalHostname(hostname)))
            throw new IntegrationError("invalid", "Webhook URL hostname is not public");
        if (literalFamily && !isPublicAddress(hostname))
            throw new IntegrationError("invalid", "Webhook URL address is not public");
        return url.toString();
    }

    async resolveForDelivery(value: string): Promise<ResolvedWebhookUrl> {
        const normalized = this.validateForStorage(value);
        const hostname = unbracket(new URL(normalized).hostname);
        const literalFamily = isIP(hostname);
        const addresses = literalFamily
            ? [{ address: hostname, family: literalFamily as 4 | 6 }]
            : await this.resolve(hostname);
        if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address)))
            throw new IntegrationError("forbidden", "Webhook URL resolved to a non-public address");
        return { url: normalized, addresses: deduplicate(addresses) };
    }
}

export function isPublicAddress(value: string): boolean {
    const family = isIP(value);
    if (family === 4) return isPublicIpv4(value);
    if (family === 6) return isPublicIpv6(value);
    return false;
}

function isLocalHostname(hostname: string): boolean {
    if (!hostname.includes(".")) return true;
    return (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".home.arpa")
    );
}

function isPublicIpv4(value: string): boolean {
    const octets = value.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => octet < 0 || octet > 255)) return false;
    const [a, b, c] = octets as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    // IETF special-purpose/documentation networks are not valid callback targets.
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
}

function isPublicIpv6(value: string): boolean {
    const bytes = ipv6Bytes(value);
    if (!bytes) return false;
    const mapped =
        bytes.subarray(0, 10).every((byte) => byte === 0) &&
        bytes[10] === 0xff &&
        bytes[11] === 0xff;
    if (mapped) return isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
    // Restrict callbacks to global unicast 2000::/3 and reject special transition/docs ranges.
    if ((bytes[0]! & 0xe0) !== 0x20) return false;
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8)
        return false;
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00)
        return false;
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
    return true;
}

function ipv6Bytes(value: string): Uint8Array | undefined {
    const normalized = unbracket(value).split("%", 1)[0]!;
    const halves = normalized.split("::");
    if (halves.length > 2) return undefined;
    const left = parseIpv6Half(halves[0]!);
    const right = parseIpv6Half(halves[1] ?? "");
    if (!left || !right) return undefined;
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1))
        return undefined;
    const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
    if (words.length !== 8) return undefined;
    const bytes = new Uint8Array(16);
    words.forEach((word, index) => {
        bytes[index * 2] = word >> 8;
        bytes[index * 2 + 1] = word & 0xff;
    });
    return bytes;
}

function parseIpv6Half(value: string): number[] | undefined {
    if (!value) return [];
    const parts = value.split(":");
    const words: number[] = [];
    for (const [index, part] of parts.entries()) {
        if (part.includes(".")) {
            if (index !== parts.length - 1 || !isIP(part)) return undefined;
            const octets = part.split(".").map(Number);
            words.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
        } else {
            if (!/^[a-f0-9]{1,4}$/i.test(part)) return undefined;
            words.push(Number.parseInt(part, 16));
        }
    }
    return words;
}

function unbracket(hostname: string): string {
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function deduplicate(
    addresses: ReadonlyArray<{ address: string; family: 4 | 6 }>,
): Array<{ address: string; family: 4 | 6 }> {
    const seen = new Set<string>();
    return addresses.filter(({ address, family }) => {
        const key = `${family}:${address}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
