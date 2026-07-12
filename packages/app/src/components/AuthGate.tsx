import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import {
    createServerClient,
    ServerError,
    type AuthMethods,
    type ServerClient,
    type User,
} from "../server";

export type AuthSession = { client: ServerClient; token: string; user: User };
type AuthGateProps = { serverUrl: string; children: (session: AuthSession) => JSX.Element };
type Mode = "loading" | "sign-in" | "onboarding" | "ready" | "unavailable";
const tokenKey = "rigged.session-token";

export function AuthGate(props: AuthGateProps) {
    const client = createServerClient(props.serverUrl);
    const [mode, setMode] = createSignal<Mode>("loading");
    const [methods, setMethods] = createSignal<AuthMethods>();
    const [user, setUser] = createSignal<User>();
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
        try {
            const response = await client.me(value);
            const profile = await loadAvatar(response.user, value);
            setUser(profile);
            setMode("ready");
        } catch (reason) {
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
    async function loadAvatar(profile: User, value: string): Promise<User> {
        if (!profile.photoFileId) return profile;
        try {
            if (avatarUrl) URL.revokeObjectURL(avatarUrl);
            avatarUrl = await client.avatar(profile.photoFileId, value);
            return { ...profile, avatarUrl };
        } catch {
            return profile;
        }
    }
    onCleanup(() => {
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
            const response = await client.createProfile(
                { firstName: firstName(), username: username() },
                saved,
            );
            setUser(response.user);
            setMode("ready");
        } catch (reason) {
            setError(message(reason));
        } finally {
            setPending(false);
        }
    }
    const gate = (
        <main class="auth-shell">
            <div class="auth-mast">
                <div class="auth-mark">R</div>
                <span>Rigged</span>
                <small>Private workspace</small>
            </div>
            <section class="auth-card" aria-live="polite">
                <Show when={mode() === "loading"}>
                    <p class="auth-kicker">Connecting to your workspace</p>
                    <h1>One moment.</h1>
                    <p class="auth-copy">{loadingMessage()}</p>
                    <div class="auth-loader" aria-label="Loading workspace" role="status">
                        <span />
                        <span />
                        <span />
                    </div>
                </Show>
                <Show when={mode() === "unavailable"}>
                    <p class="auth-kicker">Connection needed</p>
                    <h1>Server not found.</h1>
                    <p class="auth-copy">
                        Start it with <code>pnpm dev:server</code>, or set{" "}
                        <code>VITE_RIGGED_SERVER_URL</code>.
                    </p>
                    <button class="auth-button" type="button" onClick={() => location.reload()}>
                        Try again
                    </button>
                </Show>
                <Show when={mode() === "sign-in" && methods()?.method === "password"}>
                    <p class="auth-kicker">
                        {isRegistering() ? "Create your account" : "Welcome back"}
                    </p>
                    <h1>{isRegistering() ? "Set up Rigged." : "Sign in to Rigged."}</h1>
                    <p class="auth-copy">
                        {isRegistering()
                            ? "Your profile comes next."
                            : "Use the account you already created."}
                    </p>
                    <form class="auth-form" onSubmit={submitCredentials}>
                        <label>
                            Email
                            <input
                                required
                                type="email"
                                value={email()}
                                onInput={(event) => setEmail(event.currentTarget.value)}
                            />
                        </label>
                        <label>
                            Password
                            <input
                                required
                                minlength="12"
                                type="password"
                                value={password()}
                                onInput={(event) => setPassword(event.currentTarget.value)}
                            />
                        </label>
                        <Show when={error()}>
                            <p class="auth-error">{error()}</p>
                        </Show>
                        <button class="auth-button" disabled={pending()} type="submit">
                            {pending()
                                ? "Working…"
                                : isRegistering()
                                  ? "Create account"
                                  : "Sign in"}
                        </button>
                    </form>
                    <Show when={methods()?.signupEnabled}>
                        <button
                            class="auth-text-button"
                            type="button"
                            onClick={() => {
                                setIsRegistering(!isRegistering());
                                setError(undefined);
                            }}
                        >
                            {isRegistering() ? "I already have an account" : "Create a new account"}
                        </button>
                    </Show>
                </Show>
                <Show when={mode() === "sign-in" && methods()?.method !== "password"}>
                    <p class="auth-kicker">Authentication configured</p>
                    <h1>
                        {methods()?.method === "magic_link"
                            ? "Check your email."
                            : "Continue in your browser."}
                    </h1>
                    <p class="auth-copy">
                        This workspace currently uses {methods()?.method?.replace("_", " ") ?? "no"}{" "}
                        authentication. Password sign-in is unavailable.
                    </p>
                </Show>
                <Show when={mode() === "onboarding"}>
                    <p class="auth-kicker">Profile required</p>
                    <h1>Make it yours.</h1>
                    <p class="auth-copy">
                        A profile activates your account and unlocks the workspace.
                    </p>
                    <form class="auth-form" onSubmit={submitProfile}>
                        <label>
                            First name
                            <input
                                required
                                value={firstName()}
                                onInput={(event) => setFirstName(event.currentTarget.value)}
                            />
                        </label>
                        <label>
                            Username
                            <input
                                required
                                pattern="[A-Za-z0-9_-]{3,32}"
                                value={username()}
                                onInput={(event) => setUsername(event.currentTarget.value)}
                            />
                        </label>
                        <Show when={error()}>
                            <p class="auth-error">{error()}</p>
                        </Show>
                        <button class="auth-button" disabled={pending()} type="submit">
                            {pending() ? "Activating…" : "Activate workspace"}
                        </button>
                    </form>
                </Show>
            </section>
        </main>
    );
    return (
        <Show
            when={
                mode() === "ready" && user() && token()
                    ? { client, token: token()!, user: user()! }
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
