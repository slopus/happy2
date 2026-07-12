import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";

const CIPHER = "aes-256-gcm";
const CONTEXT = Buffer.from("rigged:integration-signing-secret:v1", "utf8");

export interface SecretProtector {
    protect(secret: string): Promise<string>;
    reveal(ciphertext: string): Promise<string>;
}

/** AES-GCM envelope used for signing secrets that must be recovered by delivery workers. */
export class AesGcmSecretProtector implements SecretProtector {
    private readonly key: Buffer;

    constructor(key: Uint8Array) {
        if (key.byteLength !== 32) throw new TypeError("Integration secret key must be 32 bytes");
        this.key = Buffer.from(key);
    }

    static fromBase64(value: string): AesGcmSecretProtector {
        if (!value) throw new TypeError("Integration secret key is required");
        return new AesGcmSecretProtector(Buffer.from(value, "base64url"));
    }

    async protect(secret: string): Promise<string> {
        if (!secret) throw new TypeError("Secret must not be empty");
        const nonce = randomBytes(12);
        const cipher = createCipheriv(CIPHER, this.key, nonce);
        cipher.setAAD(CONTEXT);
        const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `v1.${nonce.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
    }

    async reveal(envelope: string): Promise<string> {
        const [version, nonceValue, ciphertextValue, tagValue, unexpected] = envelope.split(".");
        if (
            version !== "v1" ||
            !nonceValue ||
            !ciphertextValue ||
            !tagValue ||
            unexpected !== undefined
        )
            throw new Error("Invalid integration secret envelope");
        try {
            const decipher = createDecipheriv(
                CIPHER,
                this.key,
                Buffer.from(nonceValue, "base64url"),
            );
            decipher.setAAD(CONTEXT);
            decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
            return Buffer.concat([
                decipher.update(Buffer.from(ciphertextValue, "base64url")),
                decipher.final(),
            ]).toString("utf8");
        } catch {
            throw new Error("Integration secret could not be authenticated");
        }
    }
}

export function generateApiToken(): string {
    return `rgd_api_${randomBytes(32).toString("base64url")}`;
}

export function generateIncomingWebhookToken(): string {
    return `rgd_hook_${randomBytes(32).toString("base64url")}`;
}

export function generateSigningSecret(): string {
    return `rgd_sign_${randomBytes(32).toString("base64url")}`;
}

export function tokenPrefix(token: string): string {
    return token.slice(0, 20);
}

export function secretHash(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function hashesEqual(left: string, right: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
