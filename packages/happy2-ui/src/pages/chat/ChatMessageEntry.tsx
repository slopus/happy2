import { For, Match, Switch, type Accessor, type JSX } from "solid-js";
import type { InfoPanelProfile, MenuItem, MessageImage } from "./ChatPageComponents.js";
import { DayDivider, FileAttachment, Message, SystemNotice } from "./ChatPageComponents.js";
import { emojiItems, type LiveThreadMessage, type WorkspaceEntry } from "./chatPageModels.js";

export interface ChatMessageEntryProps {
    entry: Accessor<WorkspaceEntry>;
    grouped: boolean;
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
    onProfileOpen(profile: InfoPanelProfile): void;
    onImageOpen(message: LiveThreadMessage, imageId: string): void;
    onMenuSelect(message: LiveThreadMessage, action: string): void;
    onReactionSelect(message: LiveThreadMessage, emoji: string): void;
    onReplySelect(message: LiveThreadMessage): void;
}

export function ChatMessageEntry(props: ChatMessageEntryProps): JSX.Element {
    const divider = () => {
        const entry = props.entry();
        return entry.kind === "divider" ? entry : undefined;
    };
    const notice = () => {
        const entry = props.entry();
        return entry.kind === "notice" ? entry : undefined;
    };
    const message = () => {
        const entry = props.entry();
        return entry.kind === "message" ? entry : undefined;
    };
    return (
        <Switch>
            <Match when={divider()}>{(entry) => <DayDivider label={entry().label} />}</Match>
            <Match when={notice()}>{(entry) => <SystemNotice text={entry().text} />}</Match>
            <Match when={message()}>
                {(entry) => (
                    <Message
                        agent={entry().agent}
                        author={entry().author}
                        body={entry().body}
                        deliveryState={
                            entry().delivery ??
                            (entry().id.startsWith("local:") ? "sending" : "sent")
                        }
                        generationStatus={entry().generationStatus}
                        grouped={props.grouped}
                        gutterTime={entry().gutterTime}
                        imageUrl={props.avatarUrl}
                        images={props.images}
                        initials={entry().initials}
                        menuItems={props.menuItems}
                        onAuthorSelect={
                            props.profile ? () => props.onProfileOpen(props.profile!) : undefined
                        }
                        onImageOpen={(id) => props.onImageOpen(entry(), id)}
                        onMenuSelect={(action) => props.onMenuSelect(entry(), action)}
                        onReactionSelect={(emoji) => props.onReactionSelect(entry(), emoji)}
                        onReplySelect={() => props.onReplySelect(entry())}
                        reactionOptions={emojiItems}
                        reactions={entry().reactions}
                        replyCount={entry().replyCount}
                        time={entry().time}
                        tone={entry().tone}
                    >
                        <For each={props.files}>
                            {(file) => (
                                <FileAttachment
                                    aria-label={`Download ${file.name}`}
                                    kind={file.kind}
                                    name={file.name}
                                    onOpen={file.onOpen}
                                    size={file.size}
                                    variant="chat"
                                />
                            )}
                        </For>
                    </Message>
                )}
            </Match>
        </Switch>
    );
}
