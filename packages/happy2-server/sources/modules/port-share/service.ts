import type { ServerConfig } from "../config/type.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { realtimeTopics, type PubSub } from "../realtime/index.js";
import type { TokenService } from "../auth/tokens.js";
import { portShareAuthorizeAccess } from "./portShareAuthorizeAccess.js";
import { portShareCreate } from "./portShareCreate.js";
import { portShareDisable } from "./portShareDisable.js";
import { portShareGetActiveBySubdomain } from "./portShareGetActiveBySubdomain.js";
import { portShareList } from "./portShareList.js";
import { portShareListActive } from "./portShareListActive.js";
import {
    PortShareError,
    type PortShareAudience,
    type PortShareContainerPort,
    type PortShareSummary,
} from "./types.js";

export interface PortShareTargetResolver {
    resolvePortShareTarget(input: {
        agentUserId: string;
        chatId: string;
        containerName: string;
        containerPort: PortShareContainerPort;
    }): Promise<{ host: "127.0.0.1"; port: number }>;
}

export interface PublicPortShare extends Omit<PortShareSummary, "containerName"> {
    url: string;
}

export interface PortShareAccessToken {
    token: string;
    expiresAt: string;
    refreshAfter: string;
    portShare: PublicPortShare;
}

/** Coordinates the durable port-share actions, non-authoritative hostname cache, scoped JWTs, realtime hints, and local sandbox target resolution. */
export class PortShareService {
    private readonly bySubdomain = new Map<string, PortShareSummary>();
    private readonly publicDomain: string;
    private readonly publicUrl: URL;

    constructor(
        private readonly executor: DrizzleExecutor,
        private readonly pubsub: PubSub,
        private readonly tokens: TokenService,
        config: Required<ServerConfig["portSharing"]>,
        private readonly targets: PortShareTargetResolver,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {
        this.publicDomain = config.publicDomain;
        this.publicUrl = new URL(config.publicUrl);
    }

    async start(): Promise<void> {
        this.bySubdomain.clear();
        for (const share of await portShareListActive(this.executor))
            this.bySubdomain.set(share.subdomain, share);
    }

    async create(input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        containerPort: PortShareContainerPort;
        name: string;
        audience: PortShareAudience;
    }): Promise<{
        portShare: PublicPortShare;
        sync: Awaited<ReturnType<typeof portShareCreate>>["hint"];
    }> {
        const result = await portShareCreate(this.executor, input);
        for (const [subdomain, share] of this.bySubdomain)
            if (share.chatId === input.chatId) this.bySubdomain.delete(subdomain);
        this.bySubdomain.set(result.portShare.subdomain, result.portShare);
        await this.publish(result.hint);
        return { portShare: this.publicShare(result.portShare), sync: result.hint };
    }

    async disable(input: { actorUserId: string; chatId: string; portShareId: string }): Promise<{
        portShare: PublicPortShare;
        sync: Awaited<ReturnType<typeof portShareDisable>>["hint"];
    }> {
        const result = await portShareDisable(this.executor, input);
        this.bySubdomain.delete(result.portShare.subdomain);
        await this.publish(result.hint);
        return { portShare: this.publicShare(result.portShare), sync: result.hint };
    }

    async list(actorUserId: string, chatId: string): Promise<PublicPortShare[]> {
        return (await portShareList(this.executor, actorUserId, chatId)).map((share) =>
            this.publicShare(share),
        );
    }

    async issueAccessToken(input: {
        actorUserId: string;
        portShareId: string;
        chatId?: string;
    }): Promise<PortShareAccessToken> {
        const share = await this.authorizedShare(input.actorUserId, input.portShareId);
        if (input.chatId && share.chatId !== input.chatId)
            throw new PortShareError("not_found", "Active port share was not found");
        const issuedAt = Date.now();
        const token = await this.tokens.issuePortShareAccessToken({
            userId: input.actorUserId,
            subdomain: share.subdomain,
        });
        return {
            token,
            refreshAfter: new Date(issuedAt + 15 * 60_000).toISOString(),
            expiresAt: new Date(issuedAt + 60 * 60_000).toISOString(),
            portShare: this.publicShare(share),
        };
    }

    async issueAccessRedemption(input: {
        actorUserId: string;
        portShareId: string;
        returnTo: string;
    }): Promise<string> {
        const share = await this.authorizedShare(input.actorUserId, input.portShareId);
        const token = await this.tokens.issuePortShareRedemptionToken({
            userId: input.actorUserId,
        });
        const url = new URL("/.happy2/auth/redeem", this.publicShare(share).url);
        url.searchParams.set("token", token);
        url.searchParams.set("returnTo", input.returnTo);
        return url.toString();
    }

    async redeemAccess(host: string | undefined, token: string | undefined): Promise<string> {
        if (!token)
            throw new PortShareError("forbidden", "Port-share redemption token is required");
        let claims: Awaited<ReturnType<TokenService["verifyPortShareRedemptionToken"]>>;
        try {
            claims = await this.tokens.verifyPortShareRedemptionToken(token);
        } catch {
            throw new PortShareError(
                "forbidden",
                "Port-share redemption token is invalid or expired",
            );
        }
        const share = await this.authorizedHostShare(host, claims.userId);
        return this.tokens.issuePortShareAccessToken({
            userId: claims.userId,
            subdomain: share.subdomain,
        });
    }

    async activeShareIdForHost(host: string | undefined): Promise<string> {
        const subdomain = this.subdomainForHost(host);
        if (!subdomain) throw new PortShareError("not_found", "Port share was not found");
        const share = await portShareGetActiveBySubdomain(this.executor, subdomain);
        if (!share) throw new PortShareError("not_found", "Active port share was not found");
        this.bySubdomain.set(subdomain, share);
        return share.id;
    }

    subdomainForHost(host: string | undefined): string | undefined {
        const hostname = normalizedRequestHostname(host);
        const suffix = `.${this.publicDomain}`;
        if (!hostname?.endsWith(suffix)) return undefined;
        const subdomain = hostname.slice(0, -suffix.length);
        return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) ? subdomain : undefined;
    }

    async authenticateAccess(
        host: string | undefined,
        token: string | undefined,
    ): Promise<{ portShare: PublicPortShare; userId: string }> {
        const verified = await this.verifiedAccess(host, token);
        return {
            userId: verified.userId,
            portShare: this.publicShare(verified.share),
        };
    }

    async authorize(
        host: string | undefined,
        token: string | undefined,
    ): Promise<{ portShare: PublicPortShare; upstream: string; userId?: string }> {
        const hinted = await this.hostShare(host);
        const verified =
            hinted.audience === "internet"
                ? { share: await this.authorizedHostShare(host), userId: undefined }
                : await this.verifiedAccess(host, token);
        const target = await this.targets.resolvePortShareTarget({
            agentUserId: verified.share.agentUserId,
            chatId: verified.share.chatId,
            containerName: verified.share.containerName,
            containerPort: verified.share.containerPort,
        });
        return {
            userId: verified.userId,
            portShare: this.publicShare(verified.share),
            upstream: `http://${target.host}:${target.port}`,
        };
    }

    private async verifiedAccess(
        host: string | undefined,
        token: string | undefined,
    ): Promise<{ userId: string; share: PortShareSummary }> {
        if (!token) throw new PortShareError("forbidden", "Port-share access token is required");
        let claims: Awaited<ReturnType<TokenService["verifyPortShareAccessToken"]>>;
        try {
            claims = await this.tokens.verifyPortShareAccessToken(token);
        } catch {
            throw new PortShareError("forbidden", "Port-share access token is invalid or expired");
        }
        const subdomain = this.subdomainForHost(host);
        if (!subdomain) throw new PortShareError("not_found", "Port share was not found");
        if (claims.subdomain !== subdomain)
            throw new PortShareError("forbidden", "Port-share credential belongs to another host");
        const share = await this.authorizedHostShare(host, claims.userId);
        return { userId: claims.userId, share };
    }

    private async cachedShare(subdomain: string): Promise<PortShareSummary | undefined> {
        const cached = this.bySubdomain.get(subdomain);
        if (cached) return cached;
        const share = await portShareGetActiveBySubdomain(this.executor, subdomain);
        if (share) this.bySubdomain.set(subdomain, share);
        return share;
    }

    private publicShare(share: PortShareSummary): PublicPortShare {
        const url = new URL(this.publicUrl);
        url.hostname = `${share.subdomain}.${this.publicDomain}`;
        const { containerName: _, ...publicFields } = share;
        return { ...publicFields, url: url.toString().replace(/\/$/, "") };
    }

    private async authorizedShare(
        actorUserId: string,
        portShareId: string,
    ): Promise<PortShareSummary> {
        const share = await portShareAuthorizeAccess(this.executor, actorUserId, portShareId);
        if (!share) throw new PortShareError("not_found", "Active port share was not found");
        this.bySubdomain.set(share.subdomain, share);
        return share;
    }

    private async hostShare(host: string | undefined): Promise<PortShareSummary> {
        const subdomain = this.subdomainForHost(host);
        if (!subdomain) throw new PortShareError("not_found", "Port share was not found");
        const share = await this.cachedShare(subdomain);
        if (!share) throw new PortShareError("not_found", "Active port share was not found");
        return share;
    }

    private async authorizedHostShare(
        host: string | undefined,
        userId?: string,
    ): Promise<PortShareSummary> {
        const hinted = await this.hostShare(host);
        const share = await portShareAuthorizeAccess(this.executor, userId, hinted.id);
        if (share) {
            this.bySubdomain.set(share.subdomain, share);
            return share;
        }
        const current = await portShareGetActiveBySubdomain(this.executor, hinted.subdomain);
        if (!current) {
            this.bySubdomain.delete(hinted.subdomain);
            throw new PortShareError("not_found", "Active port share was not found");
        }
        this.bySubdomain.set(current.subdomain, current);
        throw new PortShareError("forbidden", "User cannot access this port share");
    }

    private async publish(
        hint: Awaited<ReturnType<typeof portShareCreate>>["hint"],
    ): Promise<void> {
        const event = { type: "sync" as const, ...hint };
        const results = await Promise.allSettled([
            this.pubsub.publish(realtimeTopics.server, event),
            ...hint.chats.map(({ chatId }) =>
                this.pubsub.publish(realtimeTopics.chat(chatId), event),
            ),
        ]);
        for (const result of results) if (result.status === "rejected") this.onError(result.reason);
    }
}

function normalizedRequestHostname(host: string | undefined): string | undefined {
    if (!host) return undefined;
    try {
        return new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
        return undefined;
    }
}
