import {
    Match,
    Show,
    Switch,
    createEffect,
    createSignal,
    onCleanup,
    onMount,
    type JSX,
} from "solid-js";
import { happyStateCreate, type HappyState } from "happy2-state";
import {
    Banner,
    Button,
    Fade,
    OnboardingScreen,
    type OnboardingScreenState,
    TextField,
    WindowDragRegion,
    onboardingBackgroundUrl,
} from "happy2-ui";
import {
    createServerClient,
    ServerError,
    type AuthMethods,
    type PublicSetupPhase,
    type PublicSetupRegistration,
    type User,
} from "../server";
import { createAuthenticatedTransport } from "../stateTransport";
import type { DesktopNavigation, DesktopOnboardingStep } from "../navigation/desktopRouteTypes";
import { preAuthOnboardingStep } from "../onboarding/onboardingRoute";

export type AuthSession = {
    state: HappyState;
    user: User;
    updateUser: (user: User) => void;
    /**
     * Adopt a freshly uploaded avatar file as the current user's photo. Owns the
     * displayable object URL (revoking the previous one) so the change shows live
     * everywhere the session user is rendered.
     */
    setAvatar: (photoFileId: string) => Promise<void>;
};
type AuthGateProps = {
    serverUrl: string;
    children: (session: AuthSession) => JSX.Element;
    showWindowDragRegion?: boolean;
    /** When provided, the pre-application onboarding step is reflected into the URL. */
    navigation?: DesktopNavigation;
};
type Mode = "loading" | "sign-in" | "onboarding" | "ready" | "unavailable";
const tokenKey = "happy2.session-token";
/* The <form> is a single child of the OnboardingScreen form slot, so the slot's gap
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
    const [phase, setPhase] = createSignal<PublicSetupPhase>();
    const [registration, setRegistration] = createSignal<PublicSetupRegistration>();
    const [user, setUser] = createSignal<User>();
    const [state, setState] = createSignal<HappyState>();
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
    const token = () => localStorage.getItem(tokenKey) ?? undefined;

    async function resolveSession(
        value?: string,
        options: { profileRequired?: boolean; allowRefresh?: boolean } = {},
    ) {
        const { profileRequired = false, allowRefresh = true } = options;
        if (value) localStorage.setItem(tokenKey, value);
        else localStorage.removeItem(tokenKey);
        /* A freshly issued token can already tell us the account has no active
         * profile. Enter onboarding on the saved bearer without probing the
         * protected /v0/me route, which intentionally answers 401 until a
         * profile exists. */
        if (profileRequired) {
            setMode("onboarding");
            return;
        }
        setLoadingMessage("Loading your profile.");
        setMode("loading");
        const nextState = happyStateCreate({
            transport: createAuthenticatedTransport(props.serverUrl, value),
        });
        try {
            const response = await client.me(value);
            await nextState.syncStart();
            const profile = await loadAvatar(response.user, nextState);
            state()?.[Symbol.dispose]();
            setState(nextState);
            setUser(profile);
            setMode("ready");
        } catch (reason) {
            nextState[Symbol.dispose]();
            if (!(reason instanceof ServerError) || reason.status !== 401) throw reason;
            if (value && allowRefresh) {
                try {
                    const refreshed = await client.refresh(value);
                    return resolveSession(refreshed.token, {
                        profileRequired: refreshed.profileRequired,
                        allowRefresh: false,
                    });
                } catch (refreshReason) {
                    if (!(refreshReason instanceof ServerError) || refreshReason.status !== 401)
                        throw refreshReason;
                    localStorage.removeItem(tokenKey);
                    if (methods()?.method === "cloudflare_access")
                        return resolveSession(undefined, { allowRefresh: false });
                    setMode("sign-in");
                    return;
                }
            }
            setMode(methods()?.method === "cloudflare_access" ? "onboarding" : "sign-in");
        }
    }
    async function loadAvatar(profile: User, model: HappyState): Promise<User> {
        if (!profile.photoFileId) return profile;
        try {
            if (avatarUrl) URL.revokeObjectURL(avatarUrl);
            const contents = await model.fileDownload(profile.photoFileId);
            avatarUrl = URL.createObjectURL(new Blob([contents]));
            return { ...profile, avatarUrl };
        } catch {
            return profile;
        }
    }
    async function setAvatar(photoFileId: string): Promise<void> {
        const current = user();
        const model = state();
        if (!current || !model) return;
        const contents = await model.fileDownload(photoFileId);
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
        avatarUrl = URL.createObjectURL(new Blob([contents]));
        setUser({ ...current, photoFileId, avatarUrl });
    }
    onCleanup(() => {
        state()?.[Symbol.dispose]();
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    });
    /* The current pre-application onboarding step, or undefined once the app can
     * take over. Bootstrap vs. sign-in is chosen from the public setup phase and
     * registration availability together, so a fresh server routes to first-account
     * creation while a provisional-account-before-profile reload (phase still
     * bootstrap_required but registration closed) routes to sign-in to resume. */
    const preAppStep = (): DesktopOnboardingStep | undefined => {
        if (mode() === "sign-in")
            return phase()
                ? preAuthOnboardingStep(phase()!, registration() ?? "closed")
                : "sign-in";
        if (mode() === "onboarding") return "profile";
        return undefined;
    };
    /* Reflect the durable pre-application step into the URL so a reload resumes
     * the same centered screen. The server-configuration steps take over URL
     * ownership once the workspace state exists (see ServerOnboarding). */
    createEffect(() => {
        const navigation = props.navigation;
        const step = preAppStep();
        if (!navigation || !step) return;
        const current = navigation.get();
        if (current.primary.kind === "onboarding" && current.primary.step === step) return;
        navigation.navigate(
            {
                ...current,
                primary: { kind: "onboarding", step },
                panel: undefined,
                overlay: undefined,
            },
            { replace: true },
        );
    });
    /* Probes the server for its authentication method and public setup phase, then
     * routes to the first pre-application step. It is the single entry the mount
     * and the unavailable-screen retry both call, so recovery happens in place —
     * no remount and no location.reload — and the email/password/profile signals
     * keep whatever the user has already typed. The public setup status is
     * required for canonical fresh-install routing, so a failure surfaces the
     * unavailable screen instead of silently guessing sign-in. */
    async function probeServer(): Promise<void> {
        setError(undefined);
        setPending(true);
        setLoadingMessage("Checking the server and your saved session.");
        setMode("loading");
        try {
            const [supported, setupStatus] = await Promise.all([
                client.methods(),
                client.setupStatus(),
            ]);
            setMethods(supported);
            setPhase(setupStatus.phase);
            setRegistration(setupStatus.registration);
            /* Open the password screen on first-account creation only while
             * registration actually permits bootstrap creation. A provisional
             * bootstrap account whose registration has closed must default to
             * sign-in so it can authenticate and resume profile creation. */
            if (
                supported.method === "password" &&
                preAuthOnboardingStep(setupStatus.phase, setupStatus.registration) ===
                    "bootstrap-account"
            )
                setIsRegistering(true);
            const saved = token();
            if (saved) await resolveSession(saved);
            else if (supported.method === "cloudflare_access") {
                setLoadingMessage("Checking your Cloudflare Access session.");
                await resolveSession(undefined, { allowRefresh: false });
            } else setMode("sign-in");
        } catch (reason) {
            setError(message(reason));
            setMode("unavailable");
        } finally {
            setPending(false);
        }
    }
    onMount(() => void probeServer());
    async function submitCredentials(event: SubmitEvent) {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
            const response = isRegistering()
                ? await client.register(email(), password())
                : await client.login(email(), password());
            await resolveSession(response.token, { profileRequired: response.profileRequired });
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
        if (!saved && methods()?.method !== "cloudflare_access") return setMode("sign-in");
        setPending(true);
        setError(undefined);
        try {
            await client.createProfile({ firstName: firstName(), username: username() }, saved);
            await resolveSession(saved, { allowRefresh: false });
        } catch (reason) {
            setError(message(reason));
        } finally {
            setPending(false);
        }
    }
    const isPasswordSignIn = () => mode() === "sign-in" && methods()?.method === "password";
    const loadingHeadline = { kicker: "Connecting to your workspace", title: "One moment." };
    const headline = (): { kicker?: string; title: string; copy?: string } => {
        switch (mode()) {
            case "loading":
                return loadingHeadline;
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

    /* The OnboardingScreen for one crossfade layer. `state` is fixed by the layer's
     * screen key (not read live) so an outgoing loading layer keeps its spinner
     * while the incoming form fades in over it — a real crossfade, not a morph. */
    const renderGate = (state: OnboardingScreenState) => (
        <>
            <Show when={props.showWindowDragRegion}>
                <WindowDragRegion />
            </Show>
            <OnboardingScreen
                backgroundUrl={onboardingBackgroundUrl}
                brand={{ name: "Happy (2)" }}
                copy={state === "loading" ? undefined : headline().copy}
                data-testid="auth-onboarding-screen"
                kicker={state === "loading" ? loadingHeadline.kicker : headline().kicker}
                loadingLabel={loadingMessage()}
                state={state}
                title={state === "loading" ? loadingHeadline.title : headline().title}
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
                        <Button
                            disabled={pending()}
                            onClick={() => void probeServer()}
                            type="button"
                        >
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
            </OnboardingScreen>
        </>
    );
    /* One stable session object whose `state`/`user` are getters, so every
       consumer reactively tracks profile and avatar changes instead of holding
       the snapshot captured when the gate first opened. */
    const session: AuthSession = {
        get state() {
            return state()!;
        },
        get user() {
            return user()!;
        },
        updateUser: setUser,
        setAvatar,
    };

    /* True once the session is fully resolved and the workspace can take over. */
    const sessionReady = () =>
        mode() === "ready" &&
        !!user() &&
        (!!token() || methods()?.method === "cloudflare_access") &&
        !!state();

    /* Coarse screen identity that drives the crossfade. Finer changes (loading
     * message, sign-in vs. onboarding, error banners) stay within one key and
     * update in place; only crossing these boundaries dissolves. */
    const screenKey = (): "loading" | "auth" | "app" => {
        if (sessionReady()) return "app";
        if (mode() === "loading") return "loading";
        return "auth";
    };

    const renderScreen = (key: string | number) => {
        if (key === "app") return props.children(session);
        return renderGate(key === "loading" ? "loading" : "form");
    };

    return <Fade active={screenKey()} data-testid="auth-gate" render={renderScreen} />;
}
function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
