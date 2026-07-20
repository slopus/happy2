import {
    useCallback,
    useLayoutEffect,
    useReducer,
    useRef,
    type CSSProperties,
    type FormEvent,
} from "react";
import type { ReactNode } from "react";
import { happyStateCreate, type HappyState } from "happy2-state";
import {
    Banner,
    Button,
    Fade,
    OnboardingScreen,
    TextField,
    WindowDragRegion,
    onboardingBackgroundUrl,
} from "happy2-ui";
import { createServerClient, ServerError, type User } from "../server";
import { createAuthenticatedTransport } from "../stateTransport";
import { terminalDriverCreate } from "../terminalDriver";
import type { AuthSession } from "./AuthGate";
type DevTokenGateProps = {
    /** Request origin for auth and state. Empty string means the app's own origin. */
    serverUrl: string;
    children: (session: AuthSession) => ReactNode;
    showWindowDragRegion?: boolean;
};
type Mode = "input" | "loading" | "ready";
type DevTokenModel = {
    mode: Mode;
    /** The development token the user is typing; never persisted anywhere. */
    token: string;
    user?: User;
    state?: HappyState;
    error?: string;
    pending: boolean;
};
type SessionResponse = Awaited<ReturnType<ReturnType<typeof createServerClient>["me"]>>;
const initialModel: DevTokenModel = { mode: "loading", token: "", pending: true };
/* The <form> is the single child of the OnboardingScreen form slot, so space its
   fields here — otherwise the token field butts up against the submit button. */
const formStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
/**
 * The authentication boundary for a cookie-authenticated web deployment. The user
 * first resumes a prior HttpOnly cookie with a bearer-free `/v0/me`. If that
 * request is unauthenticated, the user types a development token and validates it
 * once through `/v0/auth/web/session`; the gateway turns that bearer verification
 * into the HttpOnly `happy2_auth_token` cookie. Every later request carries no
 * Authorization header and relies on the browser attaching the cookie, so this
 * component never reads or writes `document.cookie` or persists the token.
 */
export function DevTokenGate(props: DevTokenGateProps) {
    const clientRef = useRef<ReturnType<typeof createServerClient> | undefined>(undefined);
    clientRef.current ??= createServerClient(props.serverUrl);
    const client = clientRef.current;
    const [model, update] = useReducer(
        (current: DevTokenModel, patch: Partial<DevTokenModel>) => ({ ...current, ...patch }),
        initialModel,
    );
    const { mode, token, user, state, error, pending } = model;
    const stateRef = useRef<HappyState | undefined>(undefined);
    const avatarUrlRef = useRef<string | undefined>(undefined);
    const sessionResumeStarted = useRef(false);
    const loadAvatar = useCallback(async (profile: User, workspace: HappyState): Promise<User> => {
        if (!profile.photoFileId) return profile;
        try {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            const contents = await workspace.fileDownload(profile.photoFileId);
            avatarUrlRef.current = URL.createObjectURL(new Blob([contents]));
            return { ...profile, avatarUrl: avatarUrlRef.current };
        } catch {
            return profile;
        }
    }, []);
    async function setAvatar(photoFileId: string): Promise<void> {
        const current = user;
        const workspace = state;
        if (!current || !workspace) return;
        const contents = await workspace.fileDownload(photoFileId);
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        avatarUrlRef.current = URL.createObjectURL(new Blob([contents]));
        update({ user: { ...current, photoFileId, avatarUrl: avatarUrlRef.current } });
    }
    /* This callback's stable identity ensures the one-time resume effect cannot run
       again merely because its model update renders the gate. */
    const sessionStart = useCallback(
        async (response: SessionResponse) => {
            let nextState: HappyState | undefined;
            try {
                nextState = happyStateCreate({
                    initialPermissions: response.permissions,
                    transport: createAuthenticatedTransport(props.serverUrl),
                    terminalDriverCreate,
                });
                await nextState.syncStart();
                const profile = await loadAvatar(response.user, nextState);
                stateRef.current?.[Symbol.dispose]();
                stateRef.current = nextState;
                update({ state: nextState, user: profile, mode: "ready", pending: false });
            } catch (reason) {
                nextState?.[Symbol.dispose]();
                throw reason;
            }
        },
        [loadAvatar, props.serverUrl],
    );
    const sessionResume = useCallback(async () => {
        try {
            await sessionStart(await client.me());
        } catch (reason) {
            if (reason instanceof ServerError && reason.status === 401)
                update({ mode: "input", pending: false });
            else update({ mode: "input", pending: false, error: tokenError(reason) });
        }
    }, [client, sessionStart]);
    /* Validate the typed token with one bearer `/v0/auth/web/session`, which is the
       request the gateway converts into the HttpOnly cookie, then build a bearer-free
       transport so every later call authenticates through that cookie. A rejected
       token keeps the screen on its input mode with a product-safe error and no
       session. */
    async function submitToken(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = token.trim();
        if (!value || pending) return;
        update({ pending: true, error: undefined, mode: "loading" });
        try {
            await sessionStart(await client.webSession(value));
        } catch (reason) {
            update({ mode: "input", pending: false, error: tokenError(reason) });
        }
    }
    useLayoutEffect(
        () => () => {
            stateRef.current?.[Symbol.dispose]();
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        },
        [],
    );
    useLayoutEffect(() => {
        if (sessionResumeStarted.current) return;
        sessionResumeStarted.current = true;
        void sessionResume();
    }, [sessionResume]);
    const renderGate = () => (
        <>
            {props.showWindowDragRegion ? <WindowDragRegion /> : null}
            <OnboardingScreen
                backgroundUrl={onboardingBackgroundUrl}
                bodyKey="input"
                brand={{ name: "Happy (2)" }}
                copy={
                    mode === "loading"
                        ? undefined
                        : "Enter your development token to open this workspace."
                }
                data-testid="dev-token-gate-screen"
                kicker={mode === "loading" ? "Connecting to your workspace" : "Development access"}
                loadingLabel="Signing in with your development token."
                state={mode === "loading" ? "loading" : "form"}
                title={mode === "loading" ? "One moment." : "Sign in to Happy (2)."}
            >
                {mode === "loading" ? null : (
                    <form onSubmit={submitToken} style={formStyle}>
                        <TextField
                            autoComplete="off"
                            fullWidth
                            label="Development token"
                            onValueChange={(value) => update({ token: value })}
                            required
                            value={token}
                        />
                        {error ? (
                            <Banner tone="danger" title="Sign-in failed">
                                {error}
                            </Banner>
                        ) : null}
                        <Button
                            disabled={pending || token.trim().length === 0}
                            fullWidth
                            type="submit"
                        >
                            {pending ? "Working…" : "Sign in"}
                        </Button>
                    </form>
                )}
            </OnboardingScreen>
        </>
    );
    /* One stable session object whose `state`/`user` are getters, so every consumer
       reactively tracks profile and avatar changes. */
    const session: AuthSession = {
        get state() {
            return state!;
        },
        get user() {
            return user!;
        },
        get devTokensEnabled() {
            return true;
        },
        updateUser: (nextUser) => update({ user: nextUser }),
        setAvatar,
    };
    const sessionReady = () => mode === "ready" && !!user && !!state;
    const screenKey = (): "gate" | "app" => (sessionReady() ? "app" : "gate");
    const renderScreen = (key: string | number) => {
        if (key === "app") return props.children(session);
        return renderGate();
    };
    return <Fade active={screenKey()} data-testid="dev-token-auth-gate" render={renderScreen} />;
}
/* A product-safe message for a failed validation: a rejected token is distinct from
   an unreachable origin, but neither leaks raw upstream/network detail. */
function tokenError(reason: unknown): string {
    if (reason instanceof ServerError && reason.status !== 0)
        return "That development token wasn't accepted. Check it and try again.";
    return "We couldn't reach your workspace. Check your connection and try again.";
}
