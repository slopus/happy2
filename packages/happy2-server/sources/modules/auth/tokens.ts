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
    agentCall?: {
        actorUserId: string;
        agentUserId: string;
        callId: string;
        chatId: string;
        sessionId: string;
    };
}
export interface PluginChatClaims {
    installationId: string;
    chatId: string;
    actorUserId: string;
    agentUserId: string;
}
export interface PluginUserClaims {
    installationId: string;
    userId: string;
}
export interface PluginMessageClaims {
    installationId: string;
    messageId: string;
    actorUserId: string;
}
export interface PortShareAccessClaims {
    subdomain: string;
    userId: string;
}
export interface PortShareRedemptionClaims {
    userId: string;
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
        const token = new SignJWT({
            cid: claims.containerInstanceId,
            prm: claims.permissions,
            ...(claims.agentCall
                ? {
                      act: claims.agentCall.actorUserId,
                      agt: claims.agentCall.agentUserId,
                      cll: claims.agentCall.callId,
                      cht: claims.agentCall.chatId,
                      ses: claims.agentCall.sessionId,
                  }
                : {}),
        })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-runtime",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-runtime`)
            .setSubject(claims.installationId)
            .setIssuedAt();
        if (claims.agentCall) token.setExpirationTime("5m");
        return token.sign(this.privateKey);
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
            ...(typeof payload.act === "string" &&
            typeof payload.agt === "string" &&
            typeof payload.cll === "string" &&
            typeof payload.cht === "string" &&
            typeof payload.ses === "string"
                ? {
                      agentCall: {
                          actorUserId: payload.act,
                          agentUserId: payload.agt,
                          callId: payload.cll,
                          chatId: payload.cht,
                          sessionId: payload.ses,
                      },
                  }
                : {}),
        };
    }

    async issuePluginChatToken(claims: PluginChatClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({
            cht: claims.chatId,
            act: claims.actorUserId,
            agt: claims.agentUserId,
        })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-chat",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-chat`)
            .setSubject(claims.installationId)
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(this.privateKey);
    }

    async verifyPluginChatToken(token: string): Promise<PluginChatClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/plugin-chat`,
            algorithms: ["RS256"],
            typ: "happy2-plugin-chat",
        });
        if (
            typeof payload.sub !== "string" ||
            typeof payload.cht !== "string" ||
            typeof payload.act !== "string" ||
            typeof payload.agt !== "string"
        )
            throw new Error("JWT has invalid plugin chat claims");
        return {
            installationId: payload.sub,
            chatId: payload.cht,
            actorUserId: payload.act,
            agentUserId: payload.agt,
        };
    }

    async issuePluginUserToken(claims: PluginUserClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT()
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-user",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-user`)
            .setSubject(claims.installationId)
            .setIssuedAt()
            .setJti(claims.userId)
            .setExpirationTime("5m")
            .sign(this.privateKey);
    }

    async verifyPluginUserToken(token: string): Promise<PluginUserClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/plugin-user`,
            algorithms: ["RS256"],
            typ: "happy2-plugin-user",
        });
        if (typeof payload.sub !== "string" || typeof payload.jti !== "string")
            throw new Error("JWT has invalid plugin user claims");
        return { installationId: payload.sub, userId: payload.jti };
    }

    async issuePluginMessageToken(claims: PluginMessageClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({ act: claims.actorUserId })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-plugin-message",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/plugin-message`)
            .setSubject(claims.installationId)
            .setIssuedAt()
            .setJti(claims.messageId)
            .setExpirationTime("5m")
            .sign(this.privateKey);
    }

    async verifyPluginMessageToken(token: string): Promise<PluginMessageClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/plugin-message`,
            algorithms: ["RS256"],
            typ: "happy2-plugin-message",
        });
        if (
            typeof payload.sub !== "string" ||
            typeof payload.jti !== "string" ||
            typeof payload.act !== "string"
        )
            throw new Error("JWT has invalid plugin message claims");
        return {
            installationId: payload.sub,
            messageId: payload.jti,
            actorUserId: payload.act,
        };
    }

    async issuePortShareAccessToken(claims: PortShareAccessClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT({ hst: claims.subdomain })
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-port-share",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/port-share`)
            .setSubject(claims.userId)
            .setIssuedAt()
            .setExpirationTime("1h")
            .sign(this.privateKey);
    }

    async verifyPortShareAccessToken(token: string): Promise<PortShareAccessClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/port-share`,
            algorithms: ["RS256"],
            typ: "happy2-port-share",
        });
        if (typeof payload.sub !== "string" || typeof payload.hst !== "string")
            throw new Error("JWT has invalid port-share claims");
        return {
            userId: payload.sub,
            subdomain: payload.hst,
        };
    }

    async issuePortShareRedemptionToken(claims: PortShareRedemptionClaims): Promise<string> {
        if (!this.privateKey) throw new Error("This server has no JWT signing key");
        return new SignJWT()
            .setProtectedHeader({
                alg: "RS256",
                kid: this.config.jwt.keyId,
                typ: "happy2-port-share-redemption",
            })
            .setIssuer(this.config.jwt.issuer)
            .setAudience(`${this.config.jwt.audience}/port-share-redemption`)
            .setSubject(claims.userId)
            .setIssuedAt()
            .setExpirationTime("1m")
            .sign(this.privateKey);
    }

    async verifyPortShareRedemptionToken(token: string): Promise<PortShareRedemptionClaims> {
        const { payload } = await jwtVerify(token, this.publicKey, {
            issuer: this.config.jwt.issuer,
            audience: `${this.config.jwt.audience}/port-share-redemption`,
            algorithms: ["RS256"],
            typ: "happy2-port-share-redemption",
        });
        if (typeof payload.sub !== "string")
            throw new Error("JWT has invalid port-share redemption claims");
        return { userId: payload.sub };
    }
}

function environmentPem(name: string): string | undefined {
    const direct = process.env[name];
    if (direct) return direct.replace(/\\n/g, "\n");
    const encoded = process.env[`${name}_B64`];
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : undefined;
}
