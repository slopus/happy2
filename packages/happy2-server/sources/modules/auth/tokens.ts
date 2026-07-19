import { readFile } from "node:fs/promises";
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import type { ServerConfig } from "../config/type.js";

export interface SessionClaims {
    sessionId: string;
    accountId: string;
}
export interface PluginRuntimeClaims {
    installationId: string;
    containerInstanceId: string;
    permissions: string[];
}
export interface PluginChatClaims {
    installationId: string;
    chatId: string;
}
export interface TokenKeyPair {
    privateKey?: string;
    publicKey: string;
}
type SigningKey = Awaited<ReturnType<typeof importSPKI>>;

export class TokenService {
    private constructor(
        private readonly config: ServerConfig,
        private readonly publicKey: SigningKey,
        private readonly privateKey?: SigningKey,
    ) {}

    static async create(config: ServerConfig, keys?: TokenKeyPair): Promise<TokenService> {
        const privatePem =
            keys?.privateKey ??
            (config.jwt.privateKeyPath
                ? await readFile(config.jwt.privateKeyPath, "utf8")
                : environmentPem("HAPPY2_JWT_PRIVATE_KEY"));
        const publicPem =
            keys?.publicKey ??
            (config.jwt.publicKeyPath
                ? await readFile(config.jwt.publicKeyPath, "utf8")
                : environmentPem("HAPPY2_JWT_PUBLIC_KEY"));
        if (!publicPem)
            throw new Error(
                "A JWT public key is required (jwt.public_key_path or HAPPY2_JWT_PUBLIC_KEY_B64)",
            );
        const publicKey = await importSPKI(publicPem, "RS256");
        const privateKey = privatePem ? await importPKCS8(privatePem, "RS256") : undefined;
        return new TokenService(config, publicKey, privateKey);
    }

    async issue(sessionId: string, accountId: string): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({ sid: sessionId })
            .setProtectedHeader({ alg: "RS256", kid: this.config.jwt.keyId, typ: "JWT" })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(this.config.jwt.audience)
            .setSubject(accountId)
            .setIssuedAt()
            .setExpirationTime(`${this.config.jwt.expiryDays}d`)
            .sign(this.privateKey);
    }

    async verify(token: string): Promise<SessionClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: this.config.jwt.audience,
            algorithms: ["RS256"],
        });
        if (typeof payload.sid !== "string" || typeof payload.sub !== "string")
            throw new Error("JWT has invalid session claims");
        return { sessionId: payload.sid, accountId: payload.sub };
    }

    async issueFileUrlToken(fileId: string, expiresInSeconds: number): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT()
            .setProtectedHeader({ alg: "RS256", kid: this.config.jwt.keyId, typ: "happy2-file" })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/file`)
            .setSubject(fileId)
            .setIssuedAt()
            .setExpirationTime(`${expiresInSeconds}s`)
            .sign(this.privateKey);
    }

    async verifyFileUrlToken(token: string): Promise<string> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/file`,
            algorithms: ["RS256"],
        });
        if (typeof payload.sub !== "string") throw new Error("JWT has invalid file claims");
        return payload.sub;
    }

    async issuePluginRuntimeToken(claims: PluginRuntimeClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({ cid: claims.containerInstanceId, prm: claims.permissions })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-runtime",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-runtime`)
            .setSubject(claims.installationId)
            .setIssuedAt()
            .sign(this.privateKey);
    }

    async verifyPluginRuntimeToken(token: string): Promise<PluginRuntimeClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/plugin-runtime`,
            algorithms: ["RS256"],
            typ: "happy2-plugin-runtime",
        });
        if (
            typeof payload.sub !== "string" ||
            typeof payload.cid !== "string" ||
            !Array.isArray(payload.prm) ||
            !payload.prm.every((permission) => typeof permission === "string")
        )
            throw new Error("JWT has invalid plugin runtime claims");
        return {
            installationId: payload.sub,
            containerInstanceId: payload.cid,
            permissions: payload.prm,
        };
    }

    async issuePluginChatToken(claims: PluginChatClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({ cht: claims.chatId })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-chat",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-chat`)
            .setSubject(claims.installationId)
            .setIssuedAt()
            .sign(this.privateKey);
    }

    async verifyPluginChatToken(token: string): Promise<PluginChatClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/plugin-chat`,
            algorithms: ["RS256"],
            typ: "happy2-plugin-chat",
        });
        if (typeof payload.sub !== "string" || typeof payload.cht !== "string")
            throw new Error("JWT has invalid plugin chat claims");
        return { installationId: payload.sub, chatId: payload.cht };
    }
}

function environmentPem(name: string): string | undefined {
    const direct = process.env[name];
    if (direct) return direct.replace(/\\n/g, "\n");
    const encoded = process.env[`${name}_B64`];
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : undefined;
}
