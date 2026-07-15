import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import type { FileSummary, SearchResultSummary } from "happy2-state";
import {
    Banner,
    EmptyState,
    SearchResults,
    type SearchResultGroup,
    type SearchResultItem,
    type SearchResultType,
    type ToneName,
} from "happy2-ui";
import type { AuthSession } from "../components/AuthGate";

export type SearchOverlayProps = {
    query: string;
    session?: AuthSession;
    onSelect?: (type: SearchResultType, id: string) => void;
};

const tones: ToneName[] = ["brand", "ocean", "rose", "amber", "mint", "violet"];

/**
 * Real workspace search. The server ranks channels, people, and messages; files
 * come from the authenticated file index and are filtered by their actual name.
 * A generation guard prevents a slower response for an old query replacing the
 * latest results.
 */
export function SearchOverlay(props: SearchOverlayProps) {
    const [groups, setGroups] = createSignal<SearchResultGroup[]>();
    const [error, setError] = createSignal<string>();
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    createEffect(() => {
        const query = props.query.trim();
        const session = props.session;
        const requestGeneration = ++generation;
        if (timer) clearTimeout(timer);
        setError(undefined);

        if (!query) {
            setGroups([]);
            return;
        }
        if (!session) {
            setGroups([]);
            setError("Connect to a workspace to search its data.");
            return;
        }

        setGroups(undefined);
        timer = setTimeout(() => {
            void Promise.all([
                session.state.execute("search", { q: query, limit: 50 }),
                session.state.execute("getFiles", { limit: 100 }),
            ])
                .then(([search, files]) => {
                    if (requestGeneration !== generation) return;
                    setGroups(
                        resultGroups(
                            search.results,
                            files.files.filter((file) =>
                                (file.originalName ?? "")
                                    .toLowerCase()
                                    .includes(query.toLowerCase()),
                            ),
                            session,
                        ),
                    );
                })
                .catch((reason: unknown) => {
                    if (requestGeneration !== generation) return;
                    setGroups([]);
                    setError(reason instanceof Error ? reason.message : "Workspace search failed.");
                });
        }, 180);
    });

    onCleanup(() => {
        generation += 1;
        if (timer) clearTimeout(timer);
    });

    return (
        <Show
            when={!error()}
            fallback={
                <Banner tone="danger" title="Search unavailable">
                    {error()!}
                </Banner>
            }
        >
            <Show
                when={groups()}
                fallback={
                    <EmptyState
                        description={`Searching the workspace for “${props.query.trim()}”.`}
                        icon="search"
                        title="Searching…"
                    />
                }
            >
                {(results) => (
                    <Show
                        when={results().length > 0}
                        fallback={
                            <EmptyState
                                description={`No channels, people, messages, or files match “${props.query.trim()}”.`}
                                icon="search"
                                title="No results"
                            />
                        }
                    >
                        <SearchResults
                            groups={results()}
                            onSelect={props.onSelect}
                            query={props.query}
                        />
                    </Show>
                )}
            </Show>
        </Show>
    );
}

function resultGroups(
    results: readonly SearchResultSummary[],
    files: readonly FileSummary[],
    session: AuthSession,
): SearchResultGroup[] {
    const channelNames = new Map(
        session.state.get().chats.map((chat) => [chat.id, chat.name ?? chat.slug ?? "Chat"]),
    );
    const grouped: Record<SearchResultType, SearchResultItem[]> = {
        channel: [],
        user: [],
        message: [],
        file: [],
    };

    for (const result of results) {
        if (result.type === "channel") {
            grouped.channel.push({
                id: result.channel.id,
                title: result.channel.name ?? result.channel.slug ?? "Untitled channel",
                meta:
                    result.channel.topic ||
                    (result.channel.kind === "private_channel" ? "Private channel" : "Channel"),
            });
        } else if (result.type === "user") {
            const name = [result.user.firstName, result.user.lastName].filter(Boolean).join(" ");
            grouped.user.push({
                id: result.user.id,
                title: name,
                meta: `@${result.user.username}${result.user.title ? ` · ${result.user.title}` : ""}`,
                avatar: {
                    initials: initials(name),
                    tone: tones[hash(result.user.id) % tones.length],
                },
            });
        } else {
            const sender = result.message.sender;
            const senderName = sender
                ? [sender.firstName, sender.lastName].filter(Boolean).join(" ")
                : (result.message.senderBot?.name ?? "Automated message");
            grouped.message.push({
                id: result.message.id,
                title: result.message.text || "Message with attachments",
                meta: `${channelNames.get(result.message.chatId) ?? "Chat"} · ${senderName}`,
                avatar: sender
                    ? {
                          initials: initials(senderName),
                          tone: tones[hash(sender.id) % tones.length],
                      }
                    : undefined,
                icon: sender ? undefined : "chat",
            });
        }
    }

    grouped.file.push(
        ...files.map((file) => ({
            id: file.id,
            title: file.originalName ?? "Untitled file",
            meta: `${file.kind.toUpperCase()} · ${formatBytes(file.size)}`,
            icon: "doc" as const,
        })),
    );

    return (["channel", "user", "message", "file"] as const)
        .map((type) => ({ type, results: grouped[type] }))
        .filter((group) => group.results.length > 0);
}

function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

function hash(value: string): number {
    let result = 0;
    for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0;
    return result;
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
