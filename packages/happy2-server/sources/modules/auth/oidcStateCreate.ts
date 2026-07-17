import { type DrizzleExecutor } from "../drizzle.js";
import { authOidcStates } from "../schema.js";
/**
 * Persists one authOidcStates callback bundle containing the provider, PKCE verifier, nonce, redirect URI, and ten-minute expiry.
 * Keeping those correlated values in one row gives consumption one authoritative state lookup while callers remain responsible for generating their secrets.
 */
export async function oidcStateCreate(
    executor: DrizzleExecutor,
    state: string,
    provider: string,
    verifier: string,
    nonce: string,
    redirectUri: string,
): Promise<void> {
    await executor.insert(authOidcStates).values({
        state,
        provider,
        codeVerifier: verifier,
        nonce,
        redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
}
