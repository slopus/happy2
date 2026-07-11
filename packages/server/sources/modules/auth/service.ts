import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { ServerConfig } from "../config/type.js";
import { Database, type ActiveSession } from "../database.js";
import { hashPassword, randomToken, verifyPassword } from "./crypto.js";
import { smtpTransport } from "./email.js";
import { bearerToken, requestMetadata } from "./metadata.js";
import { authorizationUrl, exchangeCode } from "./oidc.js";
import { TokenService } from "./tokens.js";

type Body = Record<string, unknown>;
export interface Authenticated {
    session: ActiveSession;
    userId: string;
}

export class AuthService {
    private readonly passwordPepper: string | undefined;

    constructor(
        private readonly config: ServerConfig,
        private readonly database: Database,
        private readonly tokens: TokenService,
    ) {
        this.passwordPepper = config.auth.password.enabled
            ? process.env.RIGGED_PASSWORD_PEPPER
            : undefined;
        if (config.auth.password.enabled && !this.passwordPepper) {
            throw new Error(
                "RIGGED_PASSWORD_PEPPER must be initialized before starting password authentication",
            );
        }
    }

    async authenticate(request: FastifyRequest): Promise<Authenticated | undefined> {
        const token = bearerToken(request);
        if (!token) return undefined;
        try {
            const claims = await this.tokens.verify(token);
            const session = await this.database.findActiveSession(claims.sessionId);
            return session && session.userId === claims.userId
                ? { session, userId: claims.userId }
                : undefined;
        } catch {
            return undefined;
        }
    }

    async registerPassword(
        body: unknown,
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string } | "invalid"> {
        const accountEmail = email(body);
        const accountPassword = validatedPassword(body);
        if (!accountEmail || !accountPassword) return "invalid";
        const user = await this.database.createPasswordUser(
            accountEmail,
            await hashPassword(accountPassword, this.passwordPepper!),
        );
        return this.issue(user.id, request);
    }

    async loginPassword(
        body: unknown,
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string } | undefined> {
        const accountEmail = email(body);
        const accountPassword = value(body, "password");
        if (!accountEmail || !accountPassword) return undefined;
        const user = await this.database.findPasswordUser(accountEmail);
        if (
            !user?.password_hash ||
            !(await verifyPassword(accountPassword, user.password_hash, this.passwordPepper!))
        )
            return undefined;
        return this.issue(user.id, request);
    }

    async requestMagicLink(body: unknown): Promise<void> {
        const accountEmail = email(body);
        if (!accountEmail) return;
        const token = randomToken();
        await this.database.createMagicLink(accountEmail, token);
        const link = new URL(this.config.auth.magicLink.redirectUrl!);
        link.searchParams.set("token", token);
        await smtpTransport().sendMail({
            from: process.env.EMAIL_FROM ?? this.config.auth.magicLink.from,
            to: accountEmail,
            subject: "Sign in to Rigged",
            text: `Open this sign-in link in Rigged. It expires in 15 minutes:\n${link}`,
        });
    }

    async verifyMagicLink(
        body: unknown,
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string } | undefined> {
        const token = value(body, "token");
        if (!token) return undefined;
        const user = await this.database.consumeMagicLink(token);
        return user ? this.issue(user.id, request) : undefined;
    }

    async startOidc(providerName: string): Promise<string | undefined> {
        const provider = this.config.auth.oidc.get(providerName);
        if (!provider) return undefined;
        const state = randomUUID();
        const verifier = randomToken();
        const nonce = randomToken();
        const redirectUri = `${this.config.server.publicUrl}${provider.redirectPath}`;
        await this.database.createOidcState(state, provider.id, verifier, nonce, redirectUri);
        return authorizationUrl(provider, redirectUri, state, verifier, nonce);
    }

    async completeOidc(
        providerName: string,
        query: { code?: string; state?: string; error?: string },
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string } | "authorization_failed" | "invalid_state"> {
        const provider = this.config.auth.oidc.get(providerName);
        if (!provider || !query.code || !query.state || query.error) return "authorization_failed";
        const state = await this.database.consumeOidcState(query.state);
        if (!state || state.provider !== provider.id) return "invalid_state";
        const identity = await exchangeCode(
            provider,
            query.code,
            state.verifier,
            state.redirectUri,
            state.nonce,
        );
        const user = await this.database.findOrCreateOidcUser(
            provider.id,
            identity.subject,
            identity.email,
        );
        return this.issue(user.id, request);
    }

    async refresh(
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string } | undefined> {
        const current = await this.authenticate(request);
        if (!current) return undefined;
        const session = await this.database.refreshSession(
            current.session.id,
            expiry(this.config),
            requestMetadata(request),
        );
        return session
            ? {
                  token: await this.tokens.issue(session.id, session.userId),
                  expiresAt: session.expiresAt.toISOString(),
              }
            : undefined;
    }

    async logout(request: FastifyRequest): Promise<boolean> {
        const current = await this.authenticate(request);
        if (!current) return false;
        await this.database.revokeSession(current.session.id, requestMetadata(request));
        return true;
    }

    private async issue(
        userId: string,
        request: FastifyRequest,
    ): Promise<{ token: string; expiresAt: string }> {
        const session = await this.database.createSession(
            userId,
            expiry(this.config),
            requestMetadata(request),
        );
        return {
            token: await this.tokens.issue(session.id, userId),
            expiresAt: session.expiresAt.toISOString(),
        };
    }
}

function value(body: unknown, key: string): string | undefined {
    const found = (body as Body | undefined)?.[key];
    return typeof found === "string" ? found : undefined;
}

function email(body: unknown): string | undefined {
    const result = value(body, "email")?.trim().toLowerCase();
    return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) && result.length <= 320
        ? result
        : undefined;
}

function validatedPassword(body: unknown): string | undefined {
    const result = value(body, "password");
    return result && result.length >= 12 && result.length <= 1024 ? result : undefined;
}

function expiry(config: ServerConfig): Date {
    return new Date(Date.now() + config.jwt.expiryDays * 86_400_000);
}
