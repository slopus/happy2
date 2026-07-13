export type AuthMethod = "password" | "magic_link" | "oidc" | null;
export type User = {
    id: string;
    firstName: string;
    lastName?: string;
    username: string;
    email?: string;
    phone?: string;
    photoFileId?: string;
    /** Browser object URL, populated locally after the authenticated avatar fetch. */
    avatarUrl?: string;
};
export type AuthMethods = {
    role: "all" | "auth" | "api";
    method: AuthMethod;
    signupEnabled?: boolean;
    oidcProvider?: string;
};
export type AuthToken = { token: string; expiresAt: string };

export class ServerError extends Error {
    constructor(
        readonly status: number,
        readonly code?: string,
        message?: string,
    ) {
        super(message ?? code ?? "The server request failed.");
        this.name = "ServerError";
    }
}

/** Authentication-only API. Product state and actions belong to rigged-state. */
export function createServerClient(baseUrl: string) {
    const base = baseUrl.replace(/\/$/, "");
    async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
        let response: Response;
        try {
            response = await fetch(`${base}${path}`, {
                ...init,
                headers: {
                    accept: "application/json",
                    ...init.headers,
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
            });
        } catch {
            throw new ServerError(0, "network_error", "Rigged server is unreachable.");
        }
        const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
        };
        if (!response.ok) throw new ServerError(response.status, body.error, body.message);
        return body as T;
    }

    const post = <T>(path: string, body: object | undefined, token?: string) =>
        request<T>(
            path,
            {
                method: "POST",
                ...(body
                    ? {
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify(body),
                      }
                    : {}),
            },
            token,
        );

    return {
        methods: () => request<AuthMethods>("/v0/auth/methods"),
        login: (email: string, password: string) =>
            post<AuthToken>("/v0/auth/password/login", { email, password }),
        register: (email: string, password: string) =>
            post<AuthToken>("/v0/auth/password/register", { email, password }),
        createProfile: (profile: Omit<User, "id" | "photoFileId" | "avatarUrl">, token: string) =>
            post<{ user: User }>("/v0/me/createProfile", profile, token),
        me: (token: string) => request<{ user: User }>("/v0/me", {}, token),
        refresh: (token: string) => post<AuthToken>("/v0/auth/refresh", undefined, token),
        logout: (token: string) => post<void>("/v0/auth/logout", undefined, token),
    };
}

export type ServerClient = ReturnType<typeof createServerClient>;
