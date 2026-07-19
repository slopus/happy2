import {
    useLayoutEffect,
    useReducer,
    useRef,
    type CSSProperties,
    type FormEvent,
    type ReactNode,
} from "react";
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
    /** Deployment capability discovered before authentication; no Settings re-fetch is needed. */
    devTokensEnabled: boolean;
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
    children: (session: AuthSession) => ReactNode;
    showWindowDragRegion?: boolean;
    /** When provided, the pre-application onboarding step is reflected into the URL. */
    navigation?: DesktopNavigation;
    /**
     * Cookie deployments (the web gateway) authenticate every request through a
     * same-origin HttpOnly cookie the gateway issues on the first successful bearer
     * request. When true the gate persists no bearer in `localStorage`, keeps the
     * establishing bearer only in memory, and builds a bearer-free workspace
     * transport so subsequent state requests ride the cookie. Header deployments
     * (native) leave it unset and behave exactly as before.
     */
    cookieAuth?: boolean;
};
type Mode = "loading" | "sign-in" | "onboarding" | "ready" | "unavailable";
type AuthModel = {
    mode: Mode;
    methods?: AuthMethods;
    phase?: PublicSetupPhase;
    registration?: PublicSetupRegistration;
    user?: User;
    state?: HappyState;
    isRegistering: boolean;
    email: string;
    password: string;
    firstName: string;
    username: string;
    error?: string;
    pending: boolean;
    loadingMessage: string;
};
const initialAuthModel: AuthModel = {
    mode: "loading",
    isRegistering: false,
    email: "",
    password: "",
    firstName: "",
    username: "",
    pending: false,
    loadingMessage: "Checking the server and your saved session.",
};
const tokenKey = "happy2.session-token";
/* The <form> is a single child of the OnboardingScreen form slot, so the slot's gap
   can't reach its fields — space them here so the last field never butts up
   against the submit button. */
const formStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
export function AuthGate(props: AuthGateProps) {
    const clientRef = useRef<ReturnType<typeof createServerClient> | undefined>(undefined);
    clientRef.current ??= createServerClient(props.serverUrl);
    const client = clientRef.current;
    const [model, update] = useReducer(
        (current: AuthModel, patch: Partial<AuthModel>) => ({ ...current, ...patch }),
        initialAuthModel,
    );
    const {
        mode,
        methods,
        phase,
        registration,
        user,
        state,
        isRegistering,
        email,
        password,
        firstName,
        username,
        error,
        pending,
        loadingMessage,
    } = model;
    const stateRef = useRef<HappyState | undefined>(undefined);
    const methodsRef = useRef<AuthMethods | undefined>(undefined);
    const avatarUrlRef = useRef<string | undefined>(undefined);
    const cookieAuth = props.cookieAuth === true;
    /* Cookie mode keeps the establishing bearer only in memory: it authorizes the
       one `/v0/me`/`createProfile` request that makes the gateway set the cookie,
       and is never written to `localStorage`. Header mode persists it as before. */
    const bearerRef = useRef<string | undefined>(undefined);
    const token = () =>
        cookieAuth ? bearerRef.current : (localStorage.getItem(tokenKey) ?? undefined);
    const persistToken = (value?: string) => {
        if (cookieAuth) {
            bearerRef.current = value;
            return;
        }
        if (value) localStorage.setItem(tokenKey, value);
        else localStorage.removeItem(tokenKey);
    };
    async function resolveSession(
        value?: string,
        options: {
            profileRequired?: boolean;
            allowRefresh?: boolean;
        } = {},
    ) {
        const { profileRequired = false, allowRefresh = true } = options;
        persistToken(value);
        /* A freshly issued token can already tell us the account has no active
         * profile. Enter onboarding on the saved bearer without probing the
         * protected /v0/me route, which intentionally answers 401 until a
         * profile exists. */
        if (profileRequired) {
            update({ mode: "onboarding" });
            return;
        }
        update({ loadingMessage: "Loading your profile.", mode: "loading" });
        let nextState: HappyState | undefined;
        try {
            /* Cookie bootstrap (a bearer in hand) verifies through the gateway's
               `/v0/auth/web/session`, the only request that mints the cookie. A
               cookie-only resume (no bearer) reads the normal `/v0/me`, which the
               browser authenticates with the already-set cookie and which never
               mints one. Header mode keeps its bearer `/v0/me`. */
            const response =
                cookieAuth && value !== undefined
                    ? await client.webSession(value)
                    : await client.me(cookieAuth ? undefined : value);
            nextState = happyStateCreate({
                initialPermissions: response.permissions,
                // Cookie mode rides the HttpOnly cookie the verification above just
                // established, so its transport carries no Authorization header.
                transport: createAuthenticatedTransport(
                    props.serverUrl,
                    cookieAuth ? undefined : value,
                ),
            });
            await nextState.syncStart();
            const profile = await loadAvatar(response.user, nextState);
            stateRef.current?.[Symbol.dispose]();
            stateRef.current = nextState;
            update({ state: nextState, user: profile, mode: "ready" });
        } catch (reason) {
            nextState?.[Symbol.dispose]();
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
                    persistToken(undefined);
                    if (methodsRef.current?.method === "cloudflare_access")
                        return resolveSession(undefined, { allowRefresh: false });
                    update({ mode: "sign-in" });
                    return;
                }
            }
            update({
                mode: methodsRef.current?.method === "cloudflare_access" ? "onboarding" : "sign-in",
            });
        }
    }
    async function loadAvatar(profile: User, model: HappyState): Promise<User> {
        if (!profile.photoFileId) return profile;
        try {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            const contents = await model.fileDownload(profile.photoFileId);
            avatarUrlRef.current = URL.createObjectURL(new Blob([contents]));
            return { ...profile, avatarUrl: avatarUrlRef.current };
        } catch {
            return profile;
        }
    }
    async function setAvatar(photoFileId: string): Promise<void> {
        const current = user;
        const model = state;
        if (!current || !model) return;
        const contents = await model.fileDownload(photoFileId);
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        avatarUrlRef.current = URL.createObjectURL(new Blob([contents]));
        update({ user: { ...current, photoFileId, avatarUrl: avatarUrlRef.current } });
    }
    useLayoutEffect(
        () => () => {
            stateRef.current?.[Symbol.dispose]();
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        },
        [],
    );
    /* The current pre-application onboarding step, or undefined once the app can
     * take over. Bootstrap vs. sign-in is chosen from the public setup phase and
     * registration availability together, so a fresh server routes to first-account
     * creation while a provisional-account-before-profile reload (phase still
     * bootstrap_required but registration closed) routes to sign-in to resume. */
    const preAppStep: DesktopOnboardingStep | undefined = (() => {
        if (mode === "sign-in")
            return phase ? preAuthOnboardingStep(phase!, registration ?? "closed") : "sign-in";
        if (mode === "onboarding") return "profile";
        return undefined;
    })();
    /* Reflect the durable pre-application step into the URL so a reload resumes
     * the same centered screen. The server-configuration steps take over URL
     * ownership once the workspace state exists (see ServerOnboarding). */
    useLayoutEffect(() => {
        const navigation = props.navigation;
        const step = preAppStep;
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
    }, [preAppStep, props.navigation]);
    /* Probes the server for its authentication method and public setup phase, then
     * routes to the first pre-application step. It is the single entry the mount
     * and the unavailable-screen retry both call, so recovery happens in place —
     * no remount and no location.reload — and the email/password/profile fields
     * keep whatever the user has already typed. The public setup status is
     * required for canonical fresh-install routing, so a failure surfaces the
     * unavailable screen instead of silently guessing sign-in. */
    async function probeServer(): Promise<void> {
        update({
            error: undefined,
            pending: true,
            loadingMessage: "Checking the server and your saved session.",
            mode: "loading",
        });
        try {
            const [supported, setupStatus] = await Promise.all([
                client.methods(),
                client.setupStatus(),
            ]);
            methodsRef.current = supported;
            update({
                methods: supported,
                phase: setupStatus.phase,
                registration: setupStatus.registration,
            });
            /* Open the password screen on first-account creation only while
             * registration actually permits bootstrap creation. A provisional
             * bootstrap account whose registration has closed must default to
             * sign-in so it can authenticate and resume profile creation. */
            if (
                supported.method === "password" &&
                preAuthOnboardingStep(setupStatus.phase, setupStatus.registration) ===
                    "bootstrap-account"
            )
                update({ isRegistering: true });
            const saved = token();
            if (saved) await resolveSession(saved);
            else if (supported.method === "cloudflare_access") {
                update({ loadingMessage: "Checking your Cloudflare Access session." });
                await resolveSession(undefined, { allowRefresh: false });
            } else if (cookieAuth) {
                /* An existing HttpOnly cookie can't be read from JavaScript, so
                   probe it directly with a bearer-free `/v0/me`: a live cookie
                   resumes the workspace, and its absence falls through to sign-in. */
                update({ loadingMessage: "Checking your saved session." });
                await resolveSession(undefined, { allowRefresh: false });
            } else update({ mode: "sign-in" });
        } catch {
            /* The probe reason is deliberately dropped: it carries raw upstream
               and network detail (hosts, ports, exception text) that must never
               reach the product-safe unavailable screen. */
            update({ error: undefined, mode: "unavailable" });
        } finally {
            update({ pending: false });
        }
    }
    const initialProbeStarted = useRef(false);
    useLayoutEffect(() => {
        if (initialProbeStarted.current) return;
        initialProbeStarted.current = true;
        void probeServer();
    });
    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        update({ pending: true, error: undefined });
        try {
            const response = isRegistering
                ? await client.register(email, password)
                : await client.login(email, password);
            await resolveSession(response.token, { profileRequired: response.profileRequired });
        } catch (reason) {
            update({ error: message(reason), mode: "sign-in" });
        } finally {
            update({ pending: false });
        }
    }
    async function submitProfile(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const saved = token();
        if (!saved && methods?.method !== "cloudflare_access") {
            update({ mode: "sign-in" });
            return;
        }
        update({ pending: true, error: undefined });
        try {
            await client.createProfile({ firstName: firstName, username: username }, saved);
            await resolveSession(saved, { allowRefresh: false });
        } catch (reason) {
            update({ error: message(reason) });
        } finally {
            update({ pending: false });
        }
    }
    const isPasswordSignIn = () => mode === "sign-in" && methods?.method === "password";
    const loadingHeadline = { kicker: "Connecting to your workspace", title: "One moment." };
    const headline = (): {
        kicker?: string;
        title: string;
        copy?: string;
    } => {
        switch (mode) {
            case "loading":
                return loadingHeadline;
            case "unavailable":
                return {
                    kicker: "Connection needed",
                    title: "Can't reach your workspace.",
                    copy: "We couldn't connect to your workspace. Check your connection and try again.",
                };
            case "onboarding":
                return {
                    kicker: "Profile required",
                    title: "Make it yours.",
                    copy: "A profile activates your account and unlocks the workspace.",
                };
            case "sign-in":
                if (methods?.method === "password")
                    return {
                        kicker: isRegistering ? "Create your account" : "Welcome back",
                        title: isRegistering ? "Set up Happy (2)." : "Sign in to Happy (2).",
                        copy: isRegistering
                            ? "Your profile comes next."
                            : "Use the account you already created.",
                    };
                return {
                    kicker: "Authentication configured",
                    title:
                        methods?.method === "magic_link"
                            ? "Check your email."
                            : "Continue in your browser.",
                    copy: `This workspace currently uses ${methods?.method?.replace("_", " ") ?? "no"} authentication. Password sign-in is unavailable.`,
                };
            default:
                return { title: "One moment." };
        }
    };
    const submitLabel = () => (pending ? "Working…" : isRegistering ? "Create account" : "Sign in");
    // Loading, sign-in, and profile activation update inside one stable gate
    // layer. Only the body scrollport remounts when the mode lifetime changes.
    const renderGate = () => (
        <>
            {props.showWindowDragRegion ? <WindowDragRegion /> : null}
            <OnboardingScreen
                backgroundUrl={onboardingBackgroundUrl}
                bodyKey={mode}
                brand={{ name: "Happy (2)" }}
                copy={mode === "loading" ? undefined : headline().copy}
                data-testid="auth-onboarding-screen"
                kicker={mode === "loading" ? loadingHeadline.kicker : headline().kicker}
                loadingLabel={loadingMessage}
                state={mode === "loading" ? "loading" : "form"}
                title={mode === "loading" ? loadingHeadline.title : headline().title}
                footer={
                    isPasswordSignIn() && methods?.signupEnabled ? (
                        <Button
                            onClick={() => {
                                update({ isRegistering: !isRegistering, error: undefined });
                            }}
                            size="small"
                            type="button"
                            variant="ghost"
                        >
                            {isRegistering ? "I already have an account" : "Create a new account"}
                        </Button>
                    ) : null
                }
            >
                {mode === "unavailable" ? (
                    /* The fixed headline/copy plus this retry are the complete
                       unavailable state. No error Banner: the probe failure carries
                       raw upstream/network detail (hosts, ports, exception text) that
                       must never render, and it is dropped in probeServer's catch. */
                    <Button disabled={pending} onClick={() => void probeServer()} type="button">
                        Try again
                    </Button>
                ) : isPasswordSignIn() ? (
                    <form onSubmit={submitCredentials} style={formStyle}>
                        <TextField
                            autoComplete="email"
                            fullWidth
                            label="Email"
                            onValueChange={(value) => update({ email: value })}
                            required
                            type="email"
                            value={email}
                        />
                        <TextField
                            autoComplete="current-password"
                            fullWidth
                            label="Password"
                            onValueChange={(value) => update({ password: value })}
                            required
                            type="password"
                            value={password}
                        />
                        {error
                            ? ((reason) => (
                                  <Banner tone="danger" title="Sign-in failed">
                                      {reason}
                                  </Banner>
                              ))(error)
                            : null}
                        <Button disabled={pending} fullWidth type="submit">
                            {submitLabel()}
                        </Button>
                    </form>
                ) : mode === "onboarding" ? (
                    <form onSubmit={submitProfile} style={formStyle}>
                        <TextField
                            autoComplete="given-name"
                            fullWidth
                            label="First name"
                            onValueChange={(value) => update({ firstName: value })}
                            required
                            value={firstName}
                        />
                        <TextField
                            autoComplete="username"
                            fullWidth
                            label="Username"
                            onValueChange={(value) => update({ username: value })}
                            required
                            value={username}
                        />
                        {error
                            ? ((reason) => (
                                  <Banner tone="danger" title="Could not activate">
                                      {reason}
                                  </Banner>
                              ))(error)
                            : null}
                        <Button disabled={pending} fullWidth type="submit">
                            {pending ? "Activating…" : "Activate workspace"}
                        </Button>
                    </form>
                ) : null}
            </OnboardingScreen>
        </>
    );
    /* One stable session object whose `state`/`user` are getters, so every
       consumer reactively tracks profile and avatar changes instead of holding
       the snapshot captured when the gate first opened. */
    const session: AuthSession = {
        get state() {
            return state!;
        },
        get user() {
            return user!;
        },
        get devTokensEnabled() {
            return methods?.devTokensEnabled === true;
        },
        updateUser: (nextUser) => update({ user: nextUser }),
        setAvatar,
    };
    /* True once the session is fully resolved and the workspace can take over. */
    const sessionReady = () =>
        mode === "ready" &&
        !!user &&
        (cookieAuth || !!token() || methods?.method === "cloudflare_access") &&
        !!state;
    // Fade is reserved for the pre-app gate → app dissolve. Probe resolution
    // and every form-mode transition retain the same card DOM node.
    const screenKey = (): "gate" | "app" => (sessionReady() ? "app" : "gate");
    const renderScreen = (key: string | number) => {
        if (key === "app") return props.children(session);
        return renderGate();
    };
    return <Fade active={screenKey()} data-testid="auth-gate" render={renderScreen} />;
}
function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
