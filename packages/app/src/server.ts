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

export type ChatKind = "dm" | "public_channel" | "private_channel";
export type ChatRole = "owner" | "admin" | "member";
export type ChatSummary = {
    id: string;
    kind: ChatKind;
    name?: string;
    slug?: string;
    topic?: string;
    createdByUserId: string;
    pts: string;
    lastMessageSequence: string;
    membershipEpoch: string;
    membershipRole?: ChatRole;
    starred: boolean;
    starOrder?: number;
    createdAt: string;
    updatedAt: string;
};
export type UserSummary = {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    title?: string;
    photoFileId?: string;
    role: "member" | "admin";
    lastAccessAt?: string;
};
export type FileKind = "file" | "photo" | "video" | "gif";
export type FileSummary = {
    id: string;
    kind: FileKind;
    originalName?: string;
    contentType: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
    thumbhash?: string;
    uploadedByUserId: string;
    createdAt: string;
};
export type UploadedFile = Omit<FileSummary, "uploadedByUserId" | "createdAt"> & {
    isPublic: boolean;
};
export type ReactionSummary = {
    key: string;
    emoji?: string;
    customEmojiId?: string;
    count: number;
    reacted: boolean;
    userIds: string[];
};
export type MessageSummary = {
    id: string;
    chatId: string;
    sequence: string;
    changePts: string;
    sender?: UserSummary;
    kind: "user" | "automated";
    text: string;
    quotedMessage?: {
        id: string;
        senderUserId?: string;
        text: string;
        deleted: boolean;
    };
    threadRootMessageId?: string;
    threadReplyCount: number;
    forwardedFrom?: { messageId: string; chatId: string };
    attachments: FileSummary[];
    reactions: ReactionSummary[];
    expiresAt?: string;
    editedAt?: string;
    deletedAt?: string;
    createdAt: string;
};
export type PresenceSnapshot = {
    userId: string;
    status: "online" | "offline";
    connectionCount: number;
    lastActiveAt?: number;
};
export type RealtimeEvent =
    | {
          type: "sync";
          sequence: string;
          chats: Array<{ chatId: string; pts: string }>;
          areas: string[];
      }
    | {
          type: "typing";
          chatId: string;
          userId: string;
          active: boolean;
          occurredAt: number;
          expiresAt?: number;
      }
    | {
          type: "presence";
          change: "connected" | "activity" | "disconnected";
          snapshot: PresenceSnapshot;
          occurredAt: number;
      };

export type SendMessageInput = {
    text?: string;
    attachmentFileIds?: string[];
    quotedMessageId?: string;
    selfDestructSeconds?: number;
    clientMutationId?: string;
};

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

function queryString(values: Record<string, string | number | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) query.set(key, String(value));
    }
    const result = query.toString();
    return result ? `?${result}` : "";
}

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

    const post = <T>(path: string, body: object | undefined, token: string) =>
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
            request<AuthToken>("/v0/auth/password/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            }),
        register: (email: string, password: string) =>
            request<AuthToken>("/v0/auth/password/register", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
            }),
        createProfile: (profile: Omit<User, "id" | "photoFileId">, token: string) =>
            post<{ user: User }>("/v0/me/createProfile", profile, token),
        me: (token: string) => request<{ user: User }>("/v0/me", {}, token),
        refresh: (token: string) => post<AuthToken>("/v0/auth/refresh", undefined, token),
        avatar: async (fileId: string, token: string): Promise<string> => {
            let response: Response;
            try {
                response = await fetch(`${base}/v0/files/${encodeURIComponent(fileId)}`, {
                    headers: { authorization: `Bearer ${token}` },
                });
            } catch {
                throw new ServerError(0, "network_error", "Rigged server is unreachable.");
            }
            if (!response.ok) {
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                throw new ServerError(response.status, body.error);
            }
            return URL.createObjectURL(await response.blob());
        },
        logout: (token: string) => post<void>("/v0/auth/logout", undefined, token),

        chats: (token: string) => request<{ chats: ChatSummary[] }>("/v0/chats", {}, token),
        chat: (chatId: string, token: string) =>
            request<{ chat: ChatSummary }>(`/v0/chats/${encodeURIComponent(chatId)}`, {}, token),
        chatMembers: (chatId: string, token: string) =>
            request<{ users: UserSummary[] }>(
                `/v0/chats/${encodeURIComponent(chatId)}/members`,
                {},
                token,
            ),
        messages: (
            chatId: string,
            token: string,
            options: { beforeSequence?: string; afterSequence?: string; limit?: number } = {},
        ) =>
            request<{ messages: MessageSummary[]; chatPts: string; hasMore: boolean }>(
                `/v0/chats/${encodeURIComponent(chatId)}/messages${queryString(options)}`,
                {},
                token,
            ),
        thread: (
            messageId: string,
            token: string,
            options: { beforeSequence?: string; afterSequence?: string; limit?: number } = {},
        ) =>
            request<{
                root: MessageSummary;
                messages: MessageSummary[];
                chatPts: string;
                hasMore: boolean;
            }>(
                `/v0/messages/${encodeURIComponent(messageId)}/thread${queryString(options)}`,
                {},
                token,
            ),
        createChannel: (
            input: {
                kind: "public_channel" | "private_channel";
                name: string;
                slug: string;
                topic?: string;
            },
            token: string,
        ) => post<{ chat: ChatSummary }>("/v0/chats/createChannel", input, token),
        createDirectMessage: (userId: string, token: string) =>
            post<{ chat: ChatSummary }>("/v0/chats/createDirectMessage", { userId }, token),
        joinChat: (chatId: string, token: string) =>
            post<{ chat: ChatSummary }>(
                `/v0/chats/${encodeURIComponent(chatId)}/join`,
                undefined,
                token,
            ),
        sendMessage: (chatId: string, input: SendMessageInput, token: string) =>
            post<{ message: MessageSummary }>(
                `/v0/chats/${encodeURIComponent(chatId)}/sendMessage`,
                input,
                token,
            ),
        sendThreadMessage: (messageId: string, input: SendMessageInput, token: string) =>
            post<{ message: MessageSummary }>(
                `/v0/messages/${encodeURIComponent(messageId)}/sendThreadMessage`,
                input,
                token,
            ),
        addReaction: (messageId: string, emoji: string, token: string) =>
            post<{ message: MessageSummary }>(
                `/v0/messages/${encodeURIComponent(messageId)}/addReaction`,
                { emoji },
                token,
            ),
        removeReaction: (messageId: string, emoji: string, token: string) =>
            post<{ message: MessageSummary }>(
                `/v0/messages/${encodeURIComponent(messageId)}/removeReaction`,
                { emoji },
                token,
            ),
        contacts: (token: string) =>
            request<{ users: UserSummary[]; presence: PresenceSnapshot[] }>(
                "/v0/contacts",
                {},
                token,
            ),
        files: (
            token: string,
            options: { kind?: FileKind; before?: string; limit?: number } = {},
        ) =>
            request<{ files: FileSummary[]; nextCursor?: string }>(
                `/v0/files${queryString(options)}`,
                {},
                token,
            ),
        uploadFile: (file: File, token: string) => {
            const body = new FormData();
            body.set("file", file, file.name);
            return request<{ file: UploadedFile }>(
                "/v0/files/upload",
                { method: "POST", body },
                token,
            );
        },
        createFileUrl: (fileId: string, token: string) =>
            post<{ signedUrl: { url: string; expiresAt: string } }>(
                `/v0/files/${encodeURIComponent(fileId)}/createSignedUrl`,
                undefined,
                token,
            ),
        setTyping: (chatId: string, active: boolean, token: string) =>
            post<{ accepted: true }>(
                `/v0/chats/${encodeURIComponent(chatId)}/setTyping`,
                { active },
                token,
            ),
        subscribe: (
            token: string,
            onEvent: (event: RealtimeEvent) => void,
            onError?: (error: unknown) => void,
        ) => {
            const controller = new AbortController();
            void streamEvents(`${base}/v0/sync/events`, token, controller.signal, onEvent).then(
                () => {
                    if (!controller.signal.aborted)
                        onError?.(new ServerError(0, "stream_closed", "Realtime disconnected."));
                },
                (error: unknown) => {
                    if (!controller.signal.aborted) onError?.(error);
                },
            );
            return () => controller.abort();
        },
    };
}

async function streamEvents(
    url: string,
    token: string,
    signal: AbortSignal,
    onEvent: (event: RealtimeEvent) => void,
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
            signal,
        });
    } catch (error) {
        if (signal.aborted) return;
        throw error;
    }
    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
        };
        throw new ServerError(response.status, body.error, body.message);
    }
    if (!response.body) throw new ServerError(0, "stream_unavailable", "Realtime unavailable.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done }).replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
            if (data) {
                const event = JSON.parse(data) as RealtimeEvent | { state?: unknown };
                if ("type" in event) onEvent(event as RealtimeEvent);
            }
            boundary = buffer.indexOf("\n\n");
        }
        if (result.done) return;
    }
}

export type ServerClient = ReturnType<typeof createServerClient>;
