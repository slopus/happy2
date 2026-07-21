import { type ReactNode } from "react";
import type { InfoPanelProfile, MenuItem, MessageImage } from "./ChatPageComponents.js";
import {
    AgentTraceRow,
    DayDivider,
    FileAttachment,
    Message,
    SystemNotice,
} from "./ChatPageComponents.js";
import { emojiItems, type LiveChatMessage, type WorkspaceEntry } from "./chatPageModels.js";
export interface ChatMessageEntryProps {
    entry: WorkspaceEntry;
    grouped: boolean;
    /** The entry is the viewer's own message → right-aligned accent bubble. */
    own?: boolean;
    audienceLabel?: string;
    avatarUrl?: string;
    images: MessageImage[];
    menuItems: MenuItem[];
    profile?: InfoPanelProfile;
    files: Array<{
        name: string;
        kind: "file" | "photo" | "video" | "gif";
        size: string;
        onOpen: () => void;
    }>;
    traceOpen?: boolean;
    /**
     * Interactive MCP App surfaces attached to this assistant message, supplied
     * by the application because each owns its own materialized surface store.
     */
    appNodes?: ReactNode;
    /**
     * Native plugin message-menu contribution triggers for this message, supplied
     * by the application and bound to this message's id.
     */
    menuContributions?: ReactNode;
    onProfileOpen(profile: InfoPanelProfile): void;
    onImageOpen(message: LiveChatMessage, imageId: string): void;
    onMenuSelect(message: LiveChatMessage, action: string): void;
    onReactionSelect(message: LiveChatMessage, emoji: string): void;
    onTraceSelect?(message: LiveChatMessage): void;
}
export function ChatMessageEntry(props: ChatMessageEntryProps): ReactNode {
    const entry = props.entry;
    if (entry.kind === "divider") return <DayDivider label={entry.label} />;
    if (entry.kind === "notice") return <SystemNotice icon={entry.icon} text={entry.text} />;
    return (
        <Message
            agent={entry.agent}
            audienceLabel={props.audienceLabel}
            author={entry.author}
            body={entry.body}
            contributions={props.menuContributions}
            deliveryState={entry.delivery ?? (entry.id.startsWith("local:") ? "sending" : "sent")}
            generationStatus={entry.generationStatus}
            grouped={props.grouped}
            gutterTime={entry.gutterTime}
            imageUrl={props.avatarUrl}
            images={props.images}
            initials={entry.initials}
            menuItems={props.menuItems}
            onAuthorSelect={props.profile ? () => props.onProfileOpen(props.profile!) : undefined}
            onImageOpen={(id) => props.onImageOpen(entry, id)}
            onMenuSelect={(action) => props.onMenuSelect(entry, action)}
            onReactionSelect={(emoji) => props.onReactionSelect(entry, emoji)}
            own={props.own}
            reactionOptions={emojiItems}
            reactions={entry.reactions}
            time={entry.time}
            tone={entry.tone}
        >
            {entry.agentTrace ? (
                <AgentTraceRow
                    // A running response streams into the message body directly
                    // above this row, so echoing its text here only duplicates
                    // the message; every other kind carries genuinely new info.
                    detail={
                        entry.agentTrace.latest?.kind === "response"
                            ? undefined
                            : entry.agentTrace.latest?.detail
                    }
                    entryCount={entry.agentTrace.entryCount}
                    kind={entry.agentTrace.latest?.kind}
                    onOpen={props.onTraceSelect ? () => props.onTraceSelect!(entry) : undefined}
                    open={props.traceOpen}
                    status={
                        entry.agentTrace.status === "pending" ? "running" : entry.agentTrace.status
                    }
                    title={entry.agentTrace.latest?.title}
                />
            ) : null}
            {props.files.map((file) => (
                <FileAttachment
                    aria-label={`Download ${file.name}`}
                    key={file.name}
                    kind={file.kind}
                    name={file.name}
                    onOpen={file.onOpen}
                    size={file.size}
                    variant="chat"
                />
            ))}
            {props.appNodes}
        </Message>
    );
}
