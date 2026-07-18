import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const CIPHER = "aes-256-gcm";
const CONTEXT = Buffer.from("happy2:plugin-variable:v1", "utf8");

export interface PluginSecretContext {
    installationId: string;
    key: string;
}

export interface PluginSecretProtector {
    protect(secret: string, context: PluginSecretContext): Promise<string>;
    reveal(ciphertext: string, context: PluginSecretContext): Promise<string>;
}

/** Authenticated envelope dedicated to recoverable plugin environment variables. */
export class AesGcmPluginSecretProtector implements PluginSecretProtector {
    private readonly key: Buffer;

    constructor(key: Uint8Array) {
        if (key.byteLength !== 32) throw new TypeError("Plugin secret key must be 32 bytes");
        this.key = Buffer.from(key);
    }

    static fromBase64(value: string): AesGcmPluginSecretProtector {
        if (!value) throw new TypeError("Plugin secret key is required");
        return new AesGcmPluginSecretProtector(Buffer.from(value, "base64url"));
    }

    async protect(secret: string, context: PluginSecretContext): Promise<string> {
        if (!secret) throw new TypeError("Plugin secret must not be empty");
        const nonce = randomBytes(12);
        const cipher = createCipheriv(CIPHER, this.key, nonce);
        cipher.setAAD(aad(context));
        const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v1.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
    }

    async reveal(envelope: string, context: PluginSecretContext): Promise<string> {
        const [version, nonceValue, ciphertextValue, tagValue, unexpected] = envelope.split(".");
        if (version !== "v1" || !nonceValue || !ciphertextValue || !tagValue || unexpected)
            throw new Error("Invalid plugin secret envelope");
        try {
            const decipher = createDecipheriv(
                CIPHER,
                this.key,
                Buffer.from(nonceValue, "base64url"),
            );
            decipher.setAAD(aad(context));
            decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
            return Buffer.concat([
                decipher.update(Buffer.from(ciphertextValue, "base64url")),
                decipher.final(),
            ]).toString("utf8");
        } catch {
            throw new Error("Plugin secret could not be authenticated");
        }
    }
}

function aad(context: PluginSecretContext): Buffer {
    if (!context.installationId || !context.key)
        throw new TypeError("Plugin secret context is required");
    return Buffer.concat([
        CONTEXT,
        Buffer.from("\0", "utf8"),
        Buffer.from(context.installationId, "utf8"),
        Buffer.from("\0", "utf8"),
        Buffer.from(context.key, "utf8"),
    ]);
}
