import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";

/* AuthGate drives the password onboarding flow end to end against the real
 * server contract. A newly registered (or freshly signed-in) password account
 * holds a valid bearer but has no active profile; the token-issuance responses
 * now carry `profileRequired`, so the gate must enter onboarding without ever
 * probing the protected /v0/me route (which intentionally answers 401 until a
 * profile exists). These tests exercise that boundary through a routed fetch
 * mock so bearer handling and route usage are observable. */

const expiresAt = "2026-07-16T01:00:00.000Z";
const tokenKey = "happy2.session-token";
type Handler = (init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/* A never-resolving realtime stream: `start()` fires the SSE subscribe and
 * forgets it, so leaving it pending keeps the workspace live without frames. */
const hangingStream = () => new Promise<Response>(() => {});

function routedFetch(routes: Record<string, Handler>) {
    return vi.fn((input: string, init: RequestInit = {}) => {
        const { pathname } = new URL(input);
        const method = (init.method ?? "GET").toUpperCase();
        const handler = routes[`${method} ${pathname}`];
        if (handler) return Promise.resolve(handler(init));
        // Permissive fallback for the workspace's background state fetches.
        return Promise.resolve(json({}));
    });
}

const authHeader = (init: RequestInit) =>
    (init.headers as Record<string, string> | undefined)?.authorization;

function callsTo(fetchMock: ReturnType<typeof routedFetch>, method: string, pathname: string) {
    return fetchMock.mock.calls.filter(([input, init]) => {
        const call = init ?? {};
        return (
            new URL(input as string).pathname === pathname &&
            ((call.method ?? "GET") as string).toUpperCase() === method
        );
    });
}

function stubLocalStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
    });
    return store;
}

const passwordMethods: Handler = () =>
    json({ role: "all", method: "password", signupEnabled: true });

/* A durable setup status whose route is already complete, so the onboarding
 * boundary hands straight off to the workspace. */
const completeSetup = () =>
    json({
        server: {
            schemaVersion: 1,
            complete: true,
            canManage: true,
            registration: "open",
            steps: {},
        },
        user: { profile: "complete", complete: true, steps: {} },
        route: { scope: "complete" },
        complete: true,
    });

const workspaceRoutes: Record<string, Handler> = {
    "GET /v0/sync/state": () =>
        json({ state: { generation: "1", sequence: "0" }, serverTime: expiresAt }),
    "GET /v0/chats": () => json({ chats: [] }),
    "GET /v0/sync/events": () => hangingStream(),
    "GET /v0/setup": completeSetup,
    "GET /v0/setup/status": () =>
        json({ schemaVersion: 1, phase: "complete", registration: "open" }),
};

async function fillAndSubmitCredentials(screen: ReturnType<typeof render>, submitLabel: string) {
    // The form mounts once the async auth-methods probe resolves.
    await screen.findByRole("button", { name: submitLabel });
    const email = screen.container.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = screen.container.querySelector<HTMLInputElement>('input[type="password"]')!;
    fireEvent.input(email, { target: { value: "ada@example.com" } });
    fireEvent.input(password, { target: { value: "correct horse" } });
    fireEvent.submit(email.closest("form")!);
}

afterEach(() => vi.unstubAllGlobals());

describe("AuthGate password onboarding", () => {
    it("registers a new account and enters onboarding without probing /v0/me", async () => {
        const fetchMock = routedFetch({
            "GET /v0/auth/methods": passwordMethods,
            "POST /v0/auth/password/register": () =>
                json({ token: "registered-token", expiresAt, profileRequired: true }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const store = stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);

        // Switch the password screen from sign-in to registration, then submit.
        fireEvent.click(await screen.findByRole("button", { name: "Create a new account" }));
        await fillAndSubmitCredentials(screen, "Create account");

        expect(await screen.findByText("Make it yours.")).toBeTruthy();
        // The freshly issued token is persisted for the profile-creation call…
        expect(store.get(tokenKey)).toBe("registered-token");
        // …and the gate never hits the protected product route to get there.
        expect(callsTo(fetchMock, "GET", "/v0/me")).toHaveLength(0);
    });

    it("signs a returning profile-less account straight into onboarding", async () => {
        const fetchMock = routedFetch({
            "GET /v0/auth/methods": passwordMethods,
            "POST /v0/auth/password/login": () =>
                json({ token: "login-token", expiresAt, profileRequired: true }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const store = stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);
        await fillAndSubmitCredentials(screen, "Sign in");

        expect(await screen.findByText("Make it yours.")).toBeTruthy();
        expect(store.get(tokenKey)).toBe("login-token");
        expect(callsTo(fetchMock, "GET", "/v0/me")).toHaveLength(0);
    });

    it("restores a saved profile-less session into onboarding via refresh", async () => {
        const fetchMock = routedFetch({
            "GET /v0/auth/methods": passwordMethods,
            // The saved bearer is valid but the account is still profile-less.
            "GET /v0/me": () => json({ error: "unauthorized" }, 401),
            "POST /v0/auth/refresh": () =>
                json({ token: "refreshed-token", expiresAt, profileRequired: true }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const store = stubLocalStorage({ [tokenKey]: "saved-token" });

        const screen = render(<App serverUrl="http://server" />);

        expect(await screen.findByText("Make it yours.")).toBeTruthy();
        // Refresh runs automatically on the saved bearer — no manual control.
        const refreshes = callsTo(fetchMock, "POST", "/v0/auth/refresh");
        expect(refreshes).toHaveLength(1);
        expect(authHeader(refreshes[0]![1] ?? {})).toBe("Bearer saved-token");
        // The rotated token replaces the stale one for profile creation.
        expect(store.get(tokenKey)).toBe("refreshed-token");
    });

    it("signs in an active profile and loads the workspace", async () => {
        const fetchMock = routedFetch({
            ...workspaceRoutes,
            "GET /v0/auth/methods": passwordMethods,
            "POST /v0/auth/password/login": () =>
                json({ token: "active-token", expiresAt, profileRequired: false }),
            "GET /v0/me": () =>
                json({ user: { id: "u_ada", firstName: "Ada", username: "ada", kind: "human" } }),
        });
        vi.stubGlobal("fetch", fetchMock);
        stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);
        await fillAndSubmitCredentials(screen, "Sign in");

        // Reaching the workspace proves the active profile resolved normally.
        expect(await screen.findByLabelText("Ada — online")).toBeTruthy();
        const meCalls = callsTo(fetchMock, "GET", "/v0/me");
        expect(meCalls).toHaveLength(1);
        expect(authHeader(meCalls[0]![1] ?? {})).toBe("Bearer active-token");
    });

    it("opens first-account creation automatically for a fresh bootstrap server", async () => {
        const fetchMock = routedFetch({
            "GET /v0/auth/methods": passwordMethods,
            "GET /v0/setup/status": () =>
                json({ schemaVersion: 1, phase: "bootstrap_required", registration: "bootstrap" }),
        });
        vi.stubGlobal("fetch", fetchMock);
        stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);

        // The account-creation form is the default — no toggle from sign-in needed.
        expect(await screen.findByRole("button", { name: "Create account" })).toBeTruthy();
        // The footer offers the return path, confirming registration is the default view.
        // (findAllByRole tolerates the crossfade briefly mounting both layers.)
        expect(
            (await screen.findAllByRole("button", { name: "I already have an account" })).length,
        ).toBeGreaterThan(0);
    });

    it("resumes a provisional bootstrap account into sign-in after a token-less reload", async () => {
        // The one bootstrap account was created but its profile was not, then the
        // local token was lost on reload. Phase stays bootstrap_required while
        // registration is now closed and signup is disabled.
        const fetchMock = routedFetch({
            "GET /v0/auth/methods": () =>
                json({ role: "all", method: "password", signupEnabled: false }),
            "GET /v0/setup/status": () =>
                json({ schemaVersion: 1, phase: "bootstrap_required", registration: "closed" }),
            // The existing account signs in and still needs its profile.
            "POST /v0/auth/password/login": () =>
                json({ token: "resume-token", expiresAt, profileRequired: true }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const store = stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);

        // Sign in is shown so the existing account can authenticate — not a
        // create-account form that would only 403.
        expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
        // Registration is closed, so no switch-to-create toggle is offered.
        expect(screen.queryByRole("button", { name: "Create a new account" })).toBeNull();

        // Authenticating resumes profile creation for the provisional account.
        await fillAndSubmitCredentials(screen, "Sign in");
        expect(await screen.findByText("Make it yours.")).toBeTruthy();
        expect(store.get(tokenKey)).toBe("resume-token");
        expect(callsTo(fetchMock, "POST", "/v0/auth/password/register")).toHaveLength(0);
    });

    it("retries the server probe in place without location.reload and preserves form state", async () => {
        let methodsCalls = 0;
        const fetchMock = vi.fn((input: string) => {
            const { pathname } = new URL(input);
            if (pathname === "/v0/auth/methods") {
                methodsCalls += 1;
                return methodsCalls === 1
                    ? Promise.reject(new TypeError("network down"))
                    : Promise.resolve(
                          json({ role: "all", method: "password", signupEnabled: true }),
                      );
            }
            if (pathname === "/v0/setup/status")
                return Promise.resolve(
                    json({
                        schemaVersion: 1,
                        phase: "configuration_required",
                        registration: "closed",
                    }),
                );
            if (pathname === "/v0/auth/password/login")
                return Promise.resolve(json({ error: "invalid_credentials" }, 401));
            return Promise.resolve(json({}));
        });
        vi.stubGlobal("fetch", fetchMock);
        stubLocalStorage();

        const screen = render(<App serverUrl="http://server" />);

        // The failed initial probe surfaces the unavailable screen with a retry control.
        const retry = await screen.findByRole("button", { name: "Try again" });
        fireEvent.click(retry);

        // Recovery happens in place — the same mounted gate re-probes and resolves to
        // sign-in. A page reload would neither re-invoke this fetch mock's second
        // methods call nor keep the component's signals, so the incremented probe
        // count proves the retry ran probeServer() rather than location.reload().
        await screen.findByRole("button", { name: "Sign in" });
        expect(methodsCalls).toBe(2);

        // A transient login failure keeps the typed email in place (no reload/remount).
        const email = screen.container.querySelector<HTMLInputElement>('input[type="email"]')!;
        const password =
            screen.container.querySelector<HTMLInputElement>('input[type="password"]')!;
        fireEvent.input(email, { target: { value: "ada@example.com" } });
        fireEvent.input(password, { target: { value: "correct horse" } });
        fireEvent.submit(email.closest("form")!);
        expect(await screen.findByText("Sign-in failed")).toBeTruthy();
        expect(email.value).toBe("ada@example.com");
    });
});
