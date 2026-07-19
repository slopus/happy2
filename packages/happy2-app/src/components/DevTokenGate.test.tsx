import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { DevTokenGate } from "./DevTokenGate";
import type { AuthSession } from "./AuthGate";

/* DevTokenGate is the cookie-authenticated web sign-in. The user types a
 * development token; it is validated exactly once through an `Authorization:
 * Bearer` header on the gateway's `/v0/auth/web/session` endpoint, which is the
 * only request the web gateway turns into an HttpOnly `happy2_auth_token` cookie —
 * a direct `/v0/me` never mints one. Every request after that omits the
 * Authorization header and rides the cookie the browser attaches — which
 * JavaScript never sees. These tests prove that boundary: nothing is requested
 * until the user submits a token, the bootstrap `/v0/auth/web/session` is the only
 * request carrying a bearer, a direct `/v0/me` is never issued during bootstrap, no
 * auth-method/setup probe runs, the gate never writes `document.cookie` or the
 * session-token localStorage key, and an invalid token leaves the deployment
 * unauthenticated on the same screen. The gate is rendered with a minimal child
 * that reads the session, so a successful load exercises no downstream product
 * surface and raises no React runtime or error-boundary console errors. */

const developmentToken = "happy2_dev_workspacetoken";
const bearerKey = "happy2.session-token";
const expiresAt = "2026-07-16T01:00:00.000Z";

type Handler = (init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

// A never-resolving realtime stream keeps the workspace live without frames.
const hangingStream = () => new Promise<Response>(() => {});

function routedFetch(routes: Record<string, Handler>) {
    return vi.fn((input: string, init: RequestInit = {}) => {
        // Dev-token mode talks to its own origin, so paths arrive relative.
        const { pathname } = new URL(input, location.href);
        const method = (init.method ?? "GET").toUpperCase();
        const handler = routes[`${method} ${pathname}`];
        if (handler) return Promise.resolve(handler(init));
        return Promise.resolve(json({}));
    });
}

const authHeader = (init: RequestInit) =>
    (init.headers as Record<string, string> | undefined)?.authorization;

function callsTo(fetchMock: ReturnType<typeof routedFetch>, method: string, pathname: string) {
    return fetchMock.mock.calls.filter(([input, init]) => {
        const call = init ?? {};
        return (
            new URL(input as string, location.href).pathname === pathname &&
            ((call.method ?? "GET") as string).toUpperCase() === method
        );
    });
}

// A localStorage stub that records every write, so a test can prove the gate never
// persists a session token there.
function stubLocalStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const writes: Array<{ key: string; value?: string }> = [];
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            writes.push({ key, value });
            store.set(key, value);
        },
        removeItem: (key: string) => {
            writes.push({ key });
            store.delete(key);
        },
    });
    return { store, writes };
}

// Spy on the cookie setter so a test can prove no JavaScript cookie write occurs.
function spyCookieWrites() {
    const writes: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!;
    vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => {
        writes.push(value);
        descriptor.set!.call(document, value);
    });
    return writes;
}

// A minimal child that reads the resolved session. It renders no product surface,
// so a successful cookie-only load stays free of downstream runtime errors while
// still proving the child received a fully resolved, dev-token-enabled session.
function sessionProbe(session: AuthSession) {
    return (
        <div>
            <span data-testid="session-user">{session.user.firstName}</span>
            <span data-testid="session-dev-tokens">{String(session.devTokensEnabled)}</span>
        </div>
    );
}

function tokenField(screen: ReturnType<typeof render>) {
    return screen.container.querySelector<HTMLInputElement>("input")!;
}

function typeToken(screen: ReturnType<typeof render>, value: string) {
    fireEvent.input(tokenField(screen), { target: { value } });
}

function renderGate(routes: Record<string, Handler>) {
    const fetchMock = routedFetch(routes);
    vi.stubGlobal("fetch", fetchMock);
    const screen = render(<DevTokenGate serverUrl="">{sessionProbe}</DevTokenGate>);
    return { fetchMock, screen };
}

const meOk: Handler = () =>
    json({
        user: { id: "u_ada", firstName: "Ada", username: "ada", kind: "human" },
        permissions: { allowed: [], owner: false },
    });

const workspaceRoutes: Record<string, Handler> = {
    // The gateway's cookie-establishment endpoint; a direct /v0/me stays available
    // to prove the gate never touches it during bootstrap.
    "GET /v0/auth/web/session": meOk,
    "GET /v0/me": meOk,
    "GET /v0/sync/state": () =>
        json({ state: { generation: "1", sequence: "0" }, serverTime: expiresAt }),
    "GET /v0/chats": () => json({ chats: [] }),
    "GET /v0/drafts": () => json({ drafts: [], serverTime: expiresAt }),
    "GET /v0/contacts": () => json({ users: [], presence: [], statuses: [] }),
    "GET /v0/presence": () => json({ presence: [], statuses: [] }),
    "GET /v0/sync/events": () => hangingStream(),
};

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("DevTokenGate cookie authentication", () => {
    it("waits for the user to type a token, then bootstraps the cookie with a single bearer /v0/auth/web/session", async () => {
        const { writes: storageWrites } = stubLocalStorage();
        const cookieWrites = spyCookieWrites();
        const { fetchMock, screen } = renderGate(workspaceRoutes);

        // Nothing is requested until the user acts: no immediate login on mount.
        expect(screen.getByTestId("dev-token-gate-screen")).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
        // The submit stays disabled until a token is present.
        const submit = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        // The user types the development token and submits.
        typeToken(screen, developmentToken);
        expect(submit.disabled).toBe(false);
        fireEvent.submit(tokenField(screen).closest("form")!);

        // The session resolves straight from the validated token.
        expect((await screen.findByTestId("session-user")).textContent).toBe("Ada");
        expect(screen.getByTestId("session-dev-tokens").textContent).toBe("true");

        // The bootstrap /v0/auth/web/session is the single request carrying a bearer…
        const sessionCalls = callsTo(fetchMock, "GET", "/v0/auth/web/session");
        expect(sessionCalls).toHaveLength(1);
        expect(authHeader(sessionCalls[0]![1] ?? {})).toBe(`Bearer ${developmentToken}`);
        // …a direct /v0/me is never issued during bootstrap (it mints no cookie)…
        expect(callsTo(fetchMock, "GET", "/v0/me")).toHaveLength(0);
        // …and every other request omits the bearer, relying on the HttpOnly cookie.
        for (const [input, init] of fetchMock.mock.calls) {
            if (new URL(input as string, location.href).pathname === "/v0/auth/web/session")
                continue;
            expect(authHeader(init ?? {})).toBeUndefined();
        }

        // The gate never writes a cookie itself, and never persists the token.
        expect(cookieWrites).toHaveLength(0);
        expect(storageWrites.filter((write) => write.key === bearerKey)).toHaveLength(0);

        // No auth-method or setup probe runs on the dev-token path.
        expect(callsTo(fetchMock, "GET", "/v0/auth/methods")).toHaveLength(0);
        expect(callsTo(fetchMock, "GET", "/v0/setup/status")).toHaveLength(0);
    });

    it("keeps an invalid token unauthenticated on the same screen with an inline error", async () => {
        stubLocalStorage();
        const cookieWrites = spyCookieWrites();
        let sessionCalls = 0;
        const { fetchMock, screen } = renderGate({
            ...workspaceRoutes,
            "GET /v0/auth/web/session": (init) => {
                sessionCalls += 1;
                // The first (rejected) token 401s; a later valid token succeeds.
                return sessionCalls === 1 ? json({ error: "unauthorized" }, 401) : meOk(init);
            },
        });

        typeToken(screen, "happy2_dev_wrong");
        fireEvent.submit(tokenField(screen).closest("form")!);

        // The rejected token surfaces a product-safe error and no session…
        expect(await screen.findByText("Sign-in failed")).toBeTruthy();
        expect(screen.queryByTestId("session-user")).toBeNull();
        // …the input stays on screen so the user can correct it…
        expect(tokenField(screen)).toBeTruthy();
        // …and no workspace request ran (validation stopped at the session endpoint).
        expect(callsTo(fetchMock, "GET", "/v0/sync/state")).toHaveLength(0);
        expect(screen.container.textContent ?? "").not.toContain("unauthorized");

        // Correcting the token resolves the session without a remount.
        typeToken(screen, developmentToken);
        fireEvent.submit(tokenField(screen).closest("form")!);
        expect((await screen.findByTestId("session-user")).textContent).toBe("Ada");

        // Both attempts hit /v0/auth/web/session with the typed token; a direct
        // /v0/me was never issued and nothing else carried a bearer.
        const sessionRequests = callsTo(fetchMock, "GET", "/v0/auth/web/session");
        expect(sessionRequests).toHaveLength(2);
        expect(authHeader(sessionRequests[0]![1] ?? {})).toBe("Bearer happy2_dev_wrong");
        expect(authHeader(sessionRequests[1]![1] ?? {})).toBe(`Bearer ${developmentToken}`);
        expect(callsTo(fetchMock, "GET", "/v0/me")).toHaveLength(0);
        for (const [input, init] of fetchMock.mock.calls) {
            if (new URL(input as string, location.href).pathname === "/v0/auth/web/session")
                continue;
            expect(authHeader(init ?? {})).toBeUndefined();
        }
        // The gate never wrote a cookie itself throughout the flow.
        expect(cookieWrites).toHaveLength(0);
    });
});

describe("App development-token wiring", () => {
    it("selects the cookie gate with no probe or password sign-in path, without mounting the workspace", async () => {
        const fetchMock = routedFetch(workspaceRoutes);
        vi.stubGlobal("fetch", fetchMock);
        stubLocalStorage();

        const screen = render(
            <App cookieAuth platform="web" requireDevelopmentToken serverUrl="/" />,
        );

        // The dev-token gate is shown — not any password sign-in form.
        expect(await screen.findByTestId("dev-token-gate-screen")).toBeTruthy();
        expect(screen.getByText("Sign in to Happy (2).")).toBeTruthy();
        expect(screen.container.querySelector('input[type="password"]')).toBeNull();
        expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();

        // Nothing is fetched before the user types a token: no probe, no login.
        expect(callsTo(fetchMock, "GET", "/v0/auth/methods")).toHaveLength(0);
        expect(callsTo(fetchMock, "GET", "/v0/setup/status")).toHaveLength(0);
        expect(callsTo(fetchMock, "GET", "/v0/auth/web/session")).toHaveLength(0);
        expect(callsTo(fetchMock, "GET", "/v0/me")).toHaveLength(0);
    });
});
