import { userUpdateProfile } from "../user/userUpdateProfile.js";
import { userTouchAccess } from "../user/userTouchAccess.js";
import { userFindActiveByAccount } from "../user/userFindActiveByAccount.js";
import { userCreateProfile } from "../user/userCreateProfile.js";
import { sessionRevoke } from "./sessionRevoke.js";
import { sessionRefresh } from "./sessionRefresh.js";
import { sessionFindActive } from "./sessionFindActive.js";
import { sessionCreate } from "./sessionCreate.js";
import { oidcStateCreate } from "./oidcStateCreate.js";
import { oidcStateConsume } from "./oidcStateConsume.js";
import { magicLinkCreate } from "./magicLinkCreate.js";
import { magicLinkConsume } from "./magicLinkConsume.js";
import { accountRegisterPassword } from "./accountRegisterPassword.js";
import { accountFindPassword } from "./accountFindPassword.js";
import { accountFindOrCreateOidc } from "./accountFindOrCreateOidc.js";
import { accountFindOidc } from "./accountFindOidc.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { createId } from "@paralleldrive/cuid2";
import type { FastifyRequest } from "fastify";
import type { ServerConfig } from "../config/type.js";
import { AccountExistsError, RegistrationClosedError } from "./errors.js";
import type { ActiveSession } from "./types.js";
import type { CreateProfile, User } from "../user/types.js";
import { hashPassword, randomToken, verifyPassword } from "./crypto.js";
import { smtpTransport } from "./email.js";
import { bearerToken, requestMetadata } from "./metadata.js";
import { cloudflareAccessIdentity, type CloudflareAccessIdentity } from "./cloudflare-access.js";
import { authorizationUrl, exchangeCode } from "./oidc.js";
import { TokenService } from "./tokens.js";
import { accessTouchThrottle } from "./impl/accessTouchThrottle.js";
type Body = Record<string, unknown>;
export interface AuthenticatedAccount {
    accountId: string;
    session?: ActiveSession;
    cloudflareAccess?: CloudflareAccessIdentity;
}
export interface Authenticated extends AuthenticatedAccount {
    user: User;
}
export interface AuthToken {
    token: string;
    expiresAt: string;
    profileRequired: boolean;
}
export class AuthService {
    private readonly passwordPepper: string | undefined;
    private readonly shouldTouchAccess = accessTouchThrottle();
    constructor(
        private readonly config: ServerConfig,
        private readonly executor: DrizzleExecutor,
        private readonly tokens: TokenService,
    ) {
        this.passwordPepper = config.auth.password.enabled
            ? process.env.HAPPY2_PASSWORD_PEPPER
            : undefined;
        if (config.auth.password.enabled && !this.passwordPepper)
            throw new Error(
                "HAPPY2_PASSWORD_PEPPER must be initialized before starting password authentication",
            );
    }

    /** Account authentication is reserved for account-management paths such as creating a profile. */
    async authenticateAccount(request: FastifyRequest): Promise<AuthenticatedAccount | undefined> {
        const token = bearerToken(request);
        if (token) {
            try {
                const claims = await this.tokens.verify(token);
                const session = await sessionFindActive(this.executor, claims.sessionId);
                return session && session.accountId === claims.accountId
                    ? {
                          session,
                          accountId: claims.accountId,
                      }
                    : undefined;
            } catch {
                return undefined;
            }
        }
        const identity = await cloudflareAccessIdentity(request, this.config.auth.cloudflareAccess);
        if (!identity) return undefined;
        const provider = `cloudflare-access:${this.config.auth.cloudflareAccess.teamDomain}`;
        let account = await accountFindOidc(this.executor, provider, identity.subject);
        if (!account) {
            try {
                account = await accountFindOrCreateOidc(
                    this.executor,
                    provider,
                    identity.subject,
                    identity.email,
                );
            } catch (error) {
                if (error instanceof RegistrationClosedError) return undefined;
                throw error;
            }
        }
        return account.bannedAt || account.deletedAt
            ? undefined
            : {
                  accountId: account.id,
                  cloudflareAccess: identity,
              };
    }

    /** Product routes use active Users, never bare authentication accounts. */
    async authenticate(request: FastifyRequest): Promise<Authenticated | undefined> {
        const account = await this.authenticateAccount(request);
        if (!account) return undefined;
        const user = await userFindActiveByAccount(this.executor, account.accountId);
        if (!user) return undefined;
        if (this.shouldTouchAccess(account.session?.id, user.id))
            await userTouchAccess(this.executor, account.session?.id, user.id);
        return {
            ...account,
            user,
        };
    }
    async registerPassword(
        body: unknown,
        request: FastifyRequest,
    ): Promise<AuthToken | "invalid" | "registration_closed" | "account_exists"> {
        const accountEmail = email(body);
        const accountPassword = validatedPassword(body);
        if (!accountEmail || !accountPassword) return "invalid";
        try {
            const account = await accountRegisterPassword(
                this.executor,
                accountEmail,
                await hashPassword(accountPassword, this.passwordPepper!),
            );
            return this.issue(account.id, request);
        } catch (error) {
            if (error instanceof RegistrationClosedError) return "registration_closed";
            if (error instanceof AccountExistsError) return "account_exists";
            throw error;
        }
    }
    async loginPassword(body: unknown, request: FastifyRequest): Promise<AuthToken | undefined> {
        const accountEmail = email(body);
        const accountPassword = value(body, "password");
        if (!accountEmail || !accountPassword) return undefined;
        const account = await accountFindPassword(this.executor, accountEmail);
        if (
            !account?.passwordHash ||
            account.bannedAt ||
            account.deletedAt ||
            !(await verifyPassword(accountPassword, account.passwordHash, this.passwordPepper!))
        )
            return undefined;
        return this.issue(account.id, request);
    }
    async createProfile(
        body: unknown,
        request: FastifyRequest,
    ): Promise<User | "invalid" | "unauthorized" | "registration_closed"> {
        const account = await this.authenticateAccount(request);
        if (!account) return "unauthorized";
        const profile = validatedProfile(body);
        if (!profile) return "invalid";
        try {
            return await userCreateProfile(this.executor, account.accountId, profile);
        } catch (error) {
            if (error instanceof RegistrationClosedError) return "registration_closed";
            throw error;
        }
    }
    async updateProfile(
        body: unknown,
        request: FastifyRequest,
    ): Promise<User | "invalid" | "unauthorized"> {
        const current = await this.authenticate(request);
        if (!current) return "unauthorized";
        const profile = validatedProfile(body);
        if (!profile) return "invalid";
        return (await userUpdateProfile(this.executor, current.user.id, profile)) ?? "unauthorized";
    }
    async requestMagicLink(body: unknown): Promise<boolean> {
        const accountEmail = email(body);
        if (!accountEmail) return false;
        const token = randomToken();
        if (!(await magicLinkCreate(this.executor, accountEmail, token))) return false;
        const link = new URL(this.config.auth.magicLink.redirectUrl!);
        link.searchParams.set("token", token);
        await smtpTransport().sendMail({
            from: process.env.EMAIL_FROM ?? this.config.auth.magicLink.from,
            to: accountEmail,
            subject: "Sign in to Happy (2)",
            text: `Open this sign-in link in Happy (2). It expires in 15 minutes:\n${link}`,
        });
        return true;
    }
    async verifyMagicLink(body: unknown, request: FastifyRequest): Promise<AuthToken | undefined> {
        const token = value(body, "token");
        if (!token) return undefined;
        const account = await magicLinkConsume(this.executor, token);
        return account && !account.bannedAt && !account.deletedAt
            ? this.issue(account.id, request)
            : undefined;
    }
    async startOidc(providerName: string): Promise<string | undefined> {
        const provider = this.config.auth.oidc.get(providerName);
        if (!provider) return undefined;
        const state = createId();
        const verifier = randomToken();
        const nonce = randomToken();
        const redirectUri = `${this.config.server.publicUrl}${provider.redirectPath}`;
        await oidcStateCreate(this.executor, state, provider.id, verifier, nonce, redirectUri);
        return authorizationUrl(provider, redirectUri, state, verifier, nonce);
    }
    async completeOidc(
        providerName: string,
        query: {
            code?: string;
            state?: string;
            error?: string;
        },
        request: FastifyRequest,
    ): Promise<AuthToken | "authorization_failed" | "invalid_state" | "registration_closed"> {
        const provider = this.config.auth.oidc.get(providerName);
        if (!provider || !query.code || !query.state || query.error) return "authorization_failed";
        const state = await oidcStateConsume(this.executor, query.state);
        if (!state || state.provider !== provider.id) return "invalid_state";
        const identity = await exchangeCode(
            provider,
            query.code,
            state.verifier,
            state.redirectUri,
            state.nonce,
        );
        let account;
        try {
            account = await accountFindOrCreateOidc(
                this.executor,
                provider.id,
                identity.subject,
                identity.email,
            );
        } catch (error) {
            if (error instanceof RegistrationClosedError) return "registration_closed";
            throw error;
        }
        if (account.bannedAt || account.deletedAt) return "authorization_failed";
        return this.issue(account.id, request);
    }
    async refresh(request: FastifyRequest): Promise<AuthToken | undefined> {
        const account = await this.authenticateAccount(request);
        if (!account?.session) return undefined;
        const session = await sessionRefresh(
            this.executor,
            account.session.id,
            expiry(this.config),
            requestMetadata(request),
        );
        return session
            ? {
                  token: await this.tokens.issue(session.id, session.accountId),
                  expiresAt: session.expiresAt.toISOString(),
                  profileRequired: !(await userFindActiveByAccount(
                      this.executor,
                      session.accountId,
                  )),
              }
            : undefined;
    }
    async logout(request: FastifyRequest): Promise<boolean | "managed_by_cloudflare_access"> {
        const account = await this.authenticateAccount(request);
        if (!account) return false;
        if (!account.session) return "managed_by_cloudflare_access";
        await sessionRevoke(this.executor, account.session.id, requestMetadata(request));
        return true;
    }
    private async issue(accountId: string, request: FastifyRequest): Promise<AuthToken> {
        const session = await sessionCreate(
            this.executor,
            accountId,
            expiry(this.config),
            requestMetadata(request),
        );
        return {
            token: await this.tokens.issue(session.id, accountId),
            expiresAt: session.expiresAt.toISOString(),
            profileRequired: !(await userFindActiveByAccount(this.executor, accountId)),
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
function optional(value: string | undefined, maximum: number): string | undefined {
    const normalized = value?.trim();
    return normalized && normalized.length <= maximum ? normalized : undefined;
}
function validatedProfile(body: unknown): CreateProfile | undefined {
    const firstName = optional(value(body, "firstName"), 100);
    const username = optional(value(body, "username"), 32)?.toLowerCase();
    if (!firstName || !username || !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) return undefined;
    const lastName = optional(value(body, "lastName"), 100);
    const suppliedEmail = value(body, "email");
    const profileEmail = suppliedEmail ? email(body) : undefined;
    if (suppliedEmail && !profileEmail) return undefined;
    const phone = optional(value(body, "phone"), 32);
    return {
        firstName,
        lastName,
        username,
        email: profileEmail,
        phone,
    };
}
function expiry(config: ServerConfig): Date {
    return new Date(Date.now() + config.jwt.expiryDays * 86_400_000);
}
