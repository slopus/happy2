import { useLayoutEffect } from "react";
import type { FileSummary, SearchResultProjection, SearchStore } from "happy2-state";
import type { ToneName } from "../../Avatar";
import { Banner } from "../../Banner";
import { EmptyState } from "../../EmptyState";
import {
    SearchResults,
    type SearchResultGroup,
    type SearchResultItem,
    type SearchResultsVariant,
    type SearchResultType,
} from "../../SearchResults";
import { StoreSurface } from "../../StoreSurface";
export interface SearchPageProps {
    store: SearchStore;
    query: string;
    imageUrl?: (fileId?: string) => string | undefined;
    onSelect?: (type: SearchResultType, id: string) => void;
    /** Forwarded to SearchResults; `flush` fills a host such as CommandPalette. */
    variant?: SearchResultsVariant;
}
const tones: ToneName[] = ["brand", "ocean", "rose", "amber", "mint", "violet"];
/** Complete cross-workspace search surface with generation-safe results owned by SearchStore. */
export function SearchPage(props: SearchPageProps) {
    useLayoutEffect(() => {
        const query = props.query.trim();
        if (props.store.getState().query !== query) props.store.getState().queryUpdate(query);
    });
    const trimmed = props.query.trim();
    return trimmed ? (
        <StoreSurface store={props.store}>
            {(snapshot) => {
                const error = (() => {
                    const results = snapshot.results;
                    return results.type === "error" ? results.error.message : undefined;
                })();
                const groups = (() => {
                    const current = snapshot;
                    return current.results.type === "ready"
                        ? resultGroups(current.results.value, current.files, props.imageUrl)
                        : undefined;
                })();
                return !error ? (
                    groups ? (
                        ((results) =>
                            results.length > 0 ? (
                                <SearchResults
                                    groups={results}
                                    onSelect={props.onSelect}
                                    query={props.query}
                                    variant={props.variant}
                                />
                            ) : (
                                <EmptyState
                                    description={`No channels, people, messages, or files match “${trimmed}”.`}
                                    icon="search"
                                    size={props.variant === "flush" ? "inline" : undefined}
                                    title="No results"
                                />
                            ))(groups)
                    ) : (
                        <EmptyState
                            description={`Searching the workspace for “${trimmed}”.`}
                            icon="search"
                            size={props.variant === "flush" ? "inline" : undefined}
                            title="Searching…"
                        />
                    )
                ) : (
                    <Banner tone="danger" title="Search unavailable">
                        {error}
                    </Banner>
                );
            }}
        </StoreSurface>
    ) : (
        <EmptyState
            description="Find channels, people, messages, and files across your workspace."
            icon="search"
            size={props.variant === "flush" ? "inline" : undefined}
            title="Search Happy (2)"
        />
    );
}
function resultGroups(
    results: readonly SearchResultProjection[],
    files: readonly FileSummary[],
    imageUrl?: (fileId?: string) => string | undefined,
): SearchResultGroup[] {
    const grouped: Record<SearchResultType, SearchResultItem[]> = {
        channel: [],
        user: [],
        message: [],
        file: [],
    };
    for (const result of results) {
        if (result.type === "channel")
            grouped.channel.push({
                id: result.channel.id,
                title: result.channel.name ?? result.channel.slug ?? "Untitled channel",
                meta: result.channel.topic ?? "Channel",
            });
        else if (result.type === "user")
            grouped.user.push({
                id: result.user.id,
                title: result.user.displayName,
                meta: `@${result.user.username}`,
                avatar: {
                    imageUrl: imageUrl?.(result.user.photoFileId),
                    initials: initials(result.user.displayName),
                    tone: tones[hash(result.user.id) % tones.length],
                },
            });
        else {
            const sender = result.message.sender;
            const senderName =
                sender?.displayName ?? result.message.senderBot?.name ?? "Automated message";
            grouped.message.push({
                id: result.message.id,
                title: result.message.text || "Message with attachments",
                meta: `${result.message.chatId} · ${senderName}`,
                avatar: sender
                    ? {
                          imageUrl: imageUrl?.(sender.photoFileId),
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
function initials(value: string): string {
    return value
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
