export interface UserProjection {
    readonly id: string;
    readonly displayName: string;
    readonly avatarVersion: number;
}

export interface ReactionProjection {
    readonly count: number;
    readonly reacted: boolean;
    readonly actors:
        | { readonly status: "unloaded" }
        | { readonly status: "ready"; readonly userIds: readonly string[] };
}

export interface MessageProjection {
    readonly id: string;
    readonly sender: UserProjection;
    readonly text: string;
    readonly streamVersion: number;
    readonly reaction: ReactionProjection;
}

export interface ChatSnapshot {
    readonly id: string;
    readonly title: string;
    readonly messages: readonly MessageProjection[];
    readonly messagePositions: ReadonlyMap<string, number>;
    readonly draftPreview: string;
}

export interface SidebarRowProjection {
    readonly chatId: string;
    readonly title: string;
    readonly unread: number;
    readonly draftPreview: string;
}

export interface SidebarSnapshot {
    readonly rows: readonly SidebarRowProjection[];
}

export interface ComposerSnapshot {
    readonly text: string;
    readonly revision: number;
}

export interface WorkspaceFolderProjection {
    readonly path: string;
    readonly version: number;
    readonly entries: readonly string[];
}

export interface WorkspaceSnapshot {
    readonly folders: readonly WorkspaceFolderProjection[];
}

export interface HappySurfaceFixture {
    readonly users: readonly UserProjection[];
    readonly chat: ChatSnapshot;
    readonly sidebar: SidebarSnapshot;
    readonly composer: ComposerSnapshot;
    readonly workspace: WorkspaceSnapshot;
}

export const benchmarkMessageCount = 4_096;
export const benchmarkUserCount = 64;

export function happySurfaceFixtureCreate(): HappySurfaceFixture {
    const users = Array.from(
        { length: benchmarkUserCount },
        (_, index): UserProjection => ({
            id: `user-${index}`,
            displayName: `User ${index}`,
            avatarVersion: 1,
        }),
    );
    const messagePositions = new Map<string, number>();
    const messages = Array.from(
        { length: benchmarkMessageCount },
        (_, index): MessageProjection => {
            const id = `message-${index}`;
            messagePositions.set(id, index);
            return {
                id,
                sender: users[index % users.length]!,
                text: `Message ${index}`,
                streamVersion: 0,
                reaction: {
                    count: index % 7,
                    reacted: index % 11 === 0,
                    actors: { status: "unloaded" },
                },
            };
        },
    );

    return {
        users,
        chat: {
            id: "chat-active",
            title: "Active chat",
            messages,
            messagePositions,
            draftPreview: "",
        },
        sidebar: {
            rows: Array.from({ length: 200 }, (_, index) => ({
                chatId: index === 0 ? "chat-active" : `chat-${index}`,
                title: `Chat ${index}`,
                unread: index % 5,
                draftPreview: "",
            })),
        },
        composer: {
            text: "",
            revision: 0,
        },
        workspace: {
            folders: Array.from({ length: 128 }, (_, index) => ({
                path: `src/folder-${index}`,
                version: 1,
                entries: Array.from({ length: 32 }, (__, entryIndex) => `file-${entryIndex}.ts`),
            })),
        },
    };
}

function arrayItemReplace<Item>(
    items: readonly Item[],
    index: number,
    replacement: Item,
): readonly Item[] {
    const next = items.slice();
    next[index] = replacement;
    return next;
}

export function sidebarUnreadUpdate(snapshot: SidebarSnapshot, unread: number): SidebarSnapshot {
    const previous = snapshot.rows[0]!;
    if (previous.unread === unread) {
        return snapshot;
    }
    return {
        ...snapshot,
        rows: arrayItemReplace(snapshot.rows, 0, { ...previous, unread }),
    };
}

export function sidebarDraftPreviewUpdate(
    snapshot: SidebarSnapshot,
    draftPreview: string,
): SidebarSnapshot {
    const previous = snapshot.rows[0]!;
    if (previous.draftPreview === draftPreview) {
        return snapshot;
    }
    return {
        ...snapshot,
        rows: arrayItemReplace(snapshot.rows, 0, { ...previous, draftPreview }),
    };
}

export function composerTextUpdate(snapshot: ComposerSnapshot, text: string): ComposerSnapshot {
    if (snapshot.text === text) {
        return snapshot;
    }
    return {
        text,
        revision: snapshot.revision + 1,
    };
}

export function chatDraftPreviewUpdate(snapshot: ChatSnapshot, draftPreview: string): ChatSnapshot {
    if (snapshot.draftPreview === draftPreview) {
        return snapshot;
    }
    return { ...snapshot, draftPreview };
}

export function chatMessageTextReplace(
    snapshot: ChatSnapshot,
    messageIndex: number,
    text: string,
): ChatSnapshot {
    const previous = snapshot.messages[messageIndex]!;
    if (previous.text === text) {
        return snapshot;
    }
    return {
        ...snapshot,
        messages: arrayItemReplace(snapshot.messages, messageIndex, { ...previous, text }),
    };
}

export function chatMessageStreamReplace(
    snapshot: ChatSnapshot,
    messageIndex: number,
    text: string,
): ChatSnapshot {
    const previous = snapshot.messages[messageIndex]!;
    if (previous.text === text) {
        return snapshot;
    }
    return {
        ...snapshot,
        messages: arrayItemReplace(snapshot.messages, messageIndex, {
            ...previous,
            text,
            streamVersion: previous.streamVersion + 1,
        }),
    };
}

export function chatReactionCounterUpdate(
    snapshot: ChatSnapshot,
    messageIndex: number,
    count: number,
): ChatSnapshot {
    const previous = snapshot.messages[messageIndex]!;
    if (previous.reaction.count === count) {
        return snapshot;
    }
    return {
        ...snapshot,
        messages: arrayItemReplace(snapshot.messages, messageIndex, {
            ...previous,
            reaction: { ...previous.reaction, count },
        }),
    };
}

export function chatReactionActorsLoad(
    snapshot: ChatSnapshot,
    messageIndex: number,
    userIds: readonly string[],
): ChatSnapshot {
    const previous = snapshot.messages[messageIndex]!;
    const previousActors = previous.reaction.actors;
    if (
        previousActors.status === "ready" &&
        previousActors.userIds.length === userIds.length &&
        previousActors.userIds.every((userId, index) => userId === userIds[index])
    ) {
        return snapshot;
    }
    return {
        ...snapshot,
        messages: arrayItemReplace(snapshot.messages, messageIndex, {
            ...previous,
            reaction: {
                ...previous.reaction,
                actors: { status: "ready", userIds },
            },
        }),
    };
}

export function chatReactionActorsRelease(
    snapshot: ChatSnapshot,
    messageIndex: number,
): ChatSnapshot {
    const previous = snapshot.messages[messageIndex]!;
    if (previous.reaction.actors.status === "unloaded") {
        return snapshot;
    }
    return {
        ...snapshot,
        messages: arrayItemReplace(snapshot.messages, messageIndex, {
            ...previous,
            reaction: {
                ...previous.reaction,
                actors: { status: "unloaded" },
            },
        }),
    };
}

export function chatAvatarUpdate(
    snapshot: ChatSnapshot,
    userId: string,
    avatarVersion: number,
): ChatSnapshot {
    let changed = false;
    const messages = snapshot.messages.map((message) => {
        if (message.sender.id !== userId || message.sender.avatarVersion === avatarVersion) {
            return message;
        }
        changed = true;
        const sender: UserProjection = { ...message.sender, avatarVersion };
        return { ...message, sender };
    });
    return changed ? { ...snapshot, messages } : snapshot;
}

export function chatPresenceIgnored(snapshot: ChatSnapshot): ChatSnapshot {
    return snapshot;
}

export function workspaceFolderReplace(
    snapshot: WorkspaceSnapshot,
    folderIndex: number,
    version: number,
): WorkspaceSnapshot {
    const previous = snapshot.folders[folderIndex]!;
    if (previous.version === version) {
        return snapshot;
    }
    return {
        ...snapshot,
        folders: arrayItemReplace(snapshot.folders, folderIndex, {
            ...previous,
            version,
            entries: previous.entries.map((entry, index) =>
                index === 0 ? `changed-${version}.ts` : entry,
            ),
        }),
    };
}
