import { Match, Show, Switch, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { createClientState, type ClientState } from "happy2-state";
import {
    AuthScreen,
    Banner,
    Button,
    TextField,
    WindowDragRegion,
    onboardingBackgroundUrl,
} from "happy2-ui";
import { createServerClient, ServerError, type AuthMethods, type User } from "../server";
import { createAuthenticatedTransport } from "../stateTransport";

export type AuthSession = {
    state: ClientState;
    user: User;
    updateUser: (user: User) => void;
};
type AuthGateProps = {
    serverUrl: string;
    children: (session: AuthSession) => JSX.Element;
    showWindowDragRegion?: boolean;
};
type Mode = "loading" | "sign-in" | "onboarding" | "ready" | "unavailable";
const tokenKey = "happy2.session-token";
/* The <form> is a single child of the AuthScreen form slot, so the slot's gap
   can't reach its fields — space them here so the last field never butts up
   against the submit button. */
const formStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

export function AuthGate(props: AuthGateProps) {
    const client = createServerClient(props.serverUrl);
    const [mode, setMode] = createSignal<Mode>("loading");
    const [methods, setMethods] = createSignal<AuthMethods>();
    const [user, setUser] = createSignal<User>();
    const [state, setState] = createSignal<ClientState>();
    const [isRegistering, setIsRegistering] = createSignal(false);
    const [email, setEmail] = createSignal("");
    const [password, setPassword] = createSignal("");
    const [firstName, setFirstName] = createSignal("");
    const [username, setUsername] = createSignal("");
    const [error, setError] = createSignal<string>();
    const [pending, setPending] = createSignal(false);
    const [loadingMessage, setLoadingMessage] = createSignal(
        "Checking the server and your saved session.",
    );
    let avatarUrl: string | undefined;
    const token = () => localStorage.getItem(tokenKey);

    async function resolveSession(value: string, allowRefresh = true) {
        localStorage.setItem(tokenKey, value);
        setLoadingMessage("Loading your profile.");
        setMode("loading");
        const nextState = createClientState(createAuthenticatedTransport(props.serverUrl, value));
        try {
            const response = await client.me(value);
            await nextState.start();
            const profile = await loadAvatar(response.user, nextState);
            state()?.stop();
            setState(nextState);
            setUser(profile);
            setMode("ready");
        } catch (reason) {
            nextState.stop();
            if (!(reason instanceof ServerError) || reason.status !== 401) throw reason;
            if (allowRefresh) {
                try {
                    const refreshed = await client.refresh(value);
                    return resolveSession(refreshed.token, false);
                } catch (refreshReason) {
                    if (!(refreshReason instanceof ServerError) || refreshReason.status !== 401)
                        throw refreshReason;
                    localStorage.removeItem(tokenKey);
                    setMode("sign-in");
                    return;
                }
            }
            setMode("onboarding");
        }
    }
    async function loadAvatar(profile: User, model: ClientState): Promise<User> {
        if (!profile.photoFileId) return profile;
        try {
            if (avatarUrl) URL.revokeObjectURL(avatarUrl);
            const contents = await model.execute("downloadFile", { fileId: profile.photoFileId });
            avatarUrl = URL.createObjectURL(new Blob([contents]));
            return { ...profile, avatarUrl };
        } catch {
            return profile;
        }
    }
    onCleanup(() => {
        state()?.stop();
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    });
    onMount(async () => {
        try {
            const supported = await client.methods();
            setMethods(supported);
            const saved = token();
            if (saved) await resolveSession(saved);
            else setMode("sign-in");
        } catch (reason) {
            setError(message(reason));
            setMode("unavailable");
        }
    });
    async function submitCredentials(event: SubmitEvent) {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
            const response = isRegistering()
                ? await client.register(email(), password())
                : await client.login(email(), password());
            await resolveSession(response.token);
        } catch (reason) {
            setError(message(reason));
            setMode("sign-in");
        } finally {
            setPending(false);
        }
    }
    async function submitProfile(event: SubmitEvent) {
        event.preventDefault();
        const saved = token();
        if (!saved) return setMode("sign-in");
        setPending(true);
        setError(undefined);
        try {
            await client.createProfile({ firstName: firstName(), username: username() }, saved);
            await resolveSession(saved, false);
        } catch (reason) {
            setError(message(reason));
        } finally {
            setPending(false);
        }
    }
    const isPasswordSignIn = () => mode() === "sign-in" && methods()?.method === "password";
    const headline = (): { kicker?: string; title: string; copy?: string } => {
        switch (mode()) {
            case "loading":
                return { kicker: "Connecting to your workspace", title: "One moment." };
            case "unavailable":
                return {
                    kicker: "Connection needed",
                    title: "Server not found.",
                    copy: "Start it with pnpm dev:server, or set VITE_HAPPY2_SERVER_URL.",
                };
            case "onboarding":
                return {
                    kicker: "Profile required",
                    title: "Make it yours.",
                    copy: "A profile activates your account and unlocks the workspace.",
                };
            case "sign-in":
                if (methods()?.method === "password")
                    return {
                        kicker: isRegistering() ? "Create your account" : "Welcome back",
                        title: isRegistering() ? "Set up Happy (2)." : "Sign in to Happy (2).",
                        copy: isRegistering()
                            ? "Your profile comes next."
                            : "Use the account you already created.",
                    };
                return {
                    kicker: "Authentication configured",
                    title:
                        methods()?.method === "magic_link"
                            ? "Check your email."
                            : "Continue in your browser.",
                    copy: `This workspace currently uses ${
                        methods()?.method?.replace("_", " ") ?? "no"
                    } authentication. Password sign-in is unavailable.`,
                };
            default:
                return { title: "One moment." };
        }
    };
    const submitLabel = () =>
        pending() ? "Working…" : isRegistering() ? "Create account" : "Sign in";

    const gate = (
        <>
            <Show when={props.showWindowDragRegion}>
                <WindowDragRegion />
            </Show>
            <AuthScreen
                backgroundUrl={onboardingBackgroundUrl}
                brand={{ name: "Happy (2)" }}
                copy={headline().copy}
                kicker={headline().kicker}
                loadingLabel={loadingMessage()}
                state={mode() === "loading" ? "loading" : "form"}
                title={headline().title}
                footer={
                    <Show when={isPasswordSignIn() && methods()?.signupEnabled}>
                        <Button
                            onClick={() => {
                                setIsRegistering(!isRegistering());
                                setError(undefined);
                            }}
                            size="small"
                            type="button"
                            variant="ghost"
                        >
                            {isRegistering() ? "I already have an account" : "Create a new account"}
                        </Button>
                    </Show>
                }
            >
                <Switch>
                    <Match when={mode() === "unavailable"}>
                        <Show when={error()}>
                            {(reason) => (
                                <Banner tone="danger" title="Connection failed">
                                    {reason()}
                                </Banner>
                            )}
                        </Show>
                        <Button onClick={() => location.reload()} type="button">
                            Try again
                        </Button>
                    </Match>
                    <Match when={isPasswordSignIn()}>
                        <form onSubmit={submitCredentials} style={formStyle}>
                            <TextField
                                autocomplete="email"
                                fullWidth
                                label="Email"
                                onValueChange={setEmail}
                                required
                                type="email"
                                value={email()}
                            />
                            <TextField
                                autocomplete="current-password"
                                fullWidth
                                label="Password"
                                onValueChange={setPassword}
                                required
                                type="password"
                                value={password()}
                            />
                            <Show when={error()}>
                                {(reason) => (
                                    <Banner tone="danger" title="Sign-in failed">
                                        {reason()}
                                    </Banner>
                                )}
                            </Show>
                            <Button disabled={pending()} fullWidth type="submit">
                                {submitLabel()}
                            </Button>
                        </form>
                    </Match>
                    <Match when={mode() === "onboarding"}>
                        <form onSubmit={submitProfile} style={formStyle}>
                            <TextField
                                autocomplete="given-name"
                                fullWidth
                                label="First name"
                                onValueChange={setFirstName}
                                required
                                value={firstName()}
                            />
                            <TextField
                                autocomplete="username"
                                fullWidth
                                label="Username"
                                onValueChange={setUsername}
                                required
                                value={username()}
                            />
                            <Show when={error()}>
                                {(reason) => (
                                    <Banner tone="danger" title="Could not activate">
                                        {reason()}
                                    </Banner>
                                )}
                            </Show>
                            <Button disabled={pending()} fullWidth type="submit">
                                {pending() ? "Activating…" : "Activate workspace"}
                            </Button>
                        </form>
                    </Match>
                </Switch>
            </AuthScreen>
        </>
    );
    return (
        <Show
            when={
                mode() === "ready" && user() && token()
                    ? state()
                        ? {
                              state: state()!,
                              user: user()!,
                              updateUser: setUser,
                          }
                        : undefined
                    : undefined
            }
            fallback={gate}
        >
            {(session) => props.children(session())}
        </Show>
    );
}
function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
