import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, gt } from "drizzle-orm";
import { authOidcStates } from "../schema.js";

/**
 * Deletes and returns the unexpired authOidcStates bundle matching an opaque callback state value.
 * A single delete-returning statement makes the PKCE verifier and nonce one-time even when concurrent callback retries present the same state.
 */
export async function oidcStateConsume(
    executor: DrizzleExecutor,
    state: string,
): Promise<
    | {
          provider: string;
          verifier: string;
          nonce: string;
          redirectUri: string;
      }
    | undefined
> {
    const [row] = await executor
        .delete(authOidcStates)
        .where(
            and(
                eq(authOidcStates.state, state),
                gt(authOidcStates.expiresAt, new Date().toISOString()),
            ),
        )
        .returning({
            provider: authOidcStates.provider,
            verifier: authOidcStates.codeVerifier,
            nonce: authOidcStates.nonce,
            redirectUri: authOidcStates.redirectUri,
        });
    return row;
}
