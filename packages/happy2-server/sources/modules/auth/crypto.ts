import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
const N = 16_384;
const KEY_LENGTH = 64;

export function randomToken(): string {
    return randomBytes(32).toString("base64url");
}

function protectedPassword(password: string, pepper: string): string {
    return `${password}\u0000${pepper}`;
}

function scrypt(
    password: string,
    salt: Buffer,
    length: number,
    options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
    return new Promise((resolve, reject) =>
        nodeScrypt(password, salt, length, options, (error, derived) =>
            error ? reject(error) : resolve(derived),
        ),
    );
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(protectedPassword(password, pepper), salt, KEY_LENGTH, {
        N,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
    });
    return `scrypt$${N}$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
    password: string,
    encoded: string,
    pepper: string,
): Promise<boolean> {
    const [scheme, n, r, p, salt, expected] = encoded.split("$");
    if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
    const derived = await scrypt(
        protectedPassword(password, pepper),
        Buffer.from(salt, "base64url"),
        Buffer.from(expected, "base64url").length,
        { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
    );
    const expectedBuffer = Buffer.from(expected, "base64url");
    return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer);
}
