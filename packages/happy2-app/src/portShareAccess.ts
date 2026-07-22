import { UserError, type PortShareAccess, type PortShareAccessTarget } from "happy2-state";

const SESSION_PATH = "/.happy2/auth/session";
const PORT_SHARE_AUTHORIZATION_HEADER = "X-Happy2-Port-Share-Authorization";

/**
 * The desktop/web capability that opens a chat port share in an external browser
 * window. `reserve()` runs synchronously inside the originating click so the
 * pop-up is attributed to the user gesture; the reserved window is then driven
 * to the share only after the cross-origin bearer→cookie exchange succeeds.
 *
 * The exchange must run in the same browser context that then opens the share:
 * `fetch` sets the host-only HttpOnly cookie in this context's jar, and the
 * reserved `window` reads it back when navigated. Handing the URL to the OS
 * browser instead (a separate cookie jar) would arrive unauthenticated, so this
 * deliberately opens an in-context window rather than a system-browser handoff.
 *
 * Because that cookie jar is shared with the still-open external tab, the state
 * refresh lease can keep the tab authenticated by re-running only the exchange
 * (`exchange`) at each `refreshAfter` — no re-navigation, and the tokens never
 * leave this function.
 */
export function portShareAccessCreate(): PortShareAccess {
    return {
        reserve(): PortShareAccessTarget | null {
            // Synchronous within the click; a blocked pop-up returns null so the
            // owning surface can report it as a displayable failure.
            const target = window.open("about:blank", "_blank");
            if (!target) return null;
            let handedOff = false;
            const exchange = async (url: string, token: string): Promise<void> => {
                const response = await fetch(`${url}${SESSION_PATH}`, {
                    method: "GET",
                    headers: { [PORT_SHARE_AUTHORIZATION_HEADER]: `Bearer ${token}` },
                    credentials: "include",
                    cache: "no-store",
                });
                if (!response.ok)
                    throw new UserError(
                        "The shared preview could not authorize this session. It may have been disabled.",
                    );
            };
            return {
                async navigate(url, token) {
                    await exchange(url, token);
                    // Sever the opener while the reserved window is still same-origin
                    // (about:blank), then point it at the now-authenticated share.
                    try {
                        target.opener = null;
                    } catch {
                        // A same-origin reserved window always allows this.
                    }
                    handedOff = true;
                    target.location.replace(url);
                },
                // Refresh: reissue the host cookie in this jar without touching the
                // already-navigated external tab.
                exchange,
                get closed() {
                    return target.closed;
                },
                release() {
                    if (handedOff) return;
                    try {
                        target.close();
                    } catch {
                        // Already closed by the user or the environment.
                    }
                },
            };
        },
    };
}
