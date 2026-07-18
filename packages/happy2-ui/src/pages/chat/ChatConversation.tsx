import { For, Show, type JSX } from "solid-js";
import type { AgentActivityState, DeepReadonly, DirectoryUserProjection } from "happy2-state";
import {
    AgentActivityIndicator,
    Box,
    Button,
    ChannelHeader,
    Composer,
    MessageList,
    type ContextItem,
    type Mentionable,
    type MenuItem,
} from "./ChatPageComponents.js";
import { emojiItems, identityInitials, toneFor, type Conversation } from "./chatPageModels.js";

export interface ChatConversationProps {
    conversation: Conversation;
    activeConversationId: string;
    busy: boolean;
    joinVisible: boolean;
    starred: boolean;
    menuItems?: MenuItem[];
    messageEntries: JSX.Element;
    activities: readonly DeepReadonly<AgentActivityState>[];
    activityNow: number;
    directoryUsers: readonly DeepReadonly<DirectoryUserProjection>[];
    contextItems: ContextItem[];
    composerDisabled: boolean;
    composerHint: string;
    composerMentions: Mentionable[];
    composerPending: boolean;
    composerSendEnabled: boolean;
    composerValue: string;
    onContextRemove(id: string): void;
    onFilesSelected(files: FileList | null): void;
    onInfoOpen(): void;
    onJoin(): void;
    onMenuSelect(id: string): void;
    onSend(): void;
    onStarToggle(): void;
    onValueChange(value: string): void;
    onWorkspaceToggle(): void;
}

export function ChatConversation(props: ChatConversationProps) {
    let fileInput: HTMLInputElement | undefined;
    return (
        <>
            <ChannelHeader
                actions={
                    <>
                        <Show when={props.activeConversationId}>
                            <Button
                                aria-label="Workspace files"
                                icon="files"
                                iconOnly
                                onClick={props.onWorkspaceToggle}
                                size="small"
                                variant="ghost"
                            />
                        </Show>
                        <Show when={props.joinVisible}>
                            <Button
                                disabled={props.busy}
                                onClick={props.onJoin}
                                size="small"
                                variant="secondary"
                            >
                                Join
                            </Button>
                        </Show>
                    </>
                }
                icon={props.conversation.icon}
                memberCount={props.conversation.memberCount}
                menuItems={props.menuItems}
                onMembersClick={props.activeConversationId ? props.onInfoOpen : undefined}
                onMenuSelect={props.onMenuSelect}
                onStarToggle={props.activeConversationId ? props.onStarToggle : undefined}
                onTitleClick={props.activeConversationId ? props.onInfoOpen : undefined}
                starLabel={props.starred ? "Unstar" : "Star channel"}
                starred={props.starred}
                title={props.conversation.title}
                topic={props.conversation.topic}
            />
            <MessageList intro={props.conversation.intro}>{props.messageEntries}</MessageList>
            <Show when={props.activities.length > 0}>
                <Box
                    style={{
                        display: "flex",
                        "flex-wrap": "wrap",
                        gap: "8px",
                        margin: "0 20px 8px",
                    }}
                >
                    <For each={props.activities}>
                        {(activity) => {
                            const actor = () =>
                                props.directoryUsers.find(
                                    (person) => person.id === activity.agentUserId,
                                );
                            return (
                                <AgentActivityIndicator
                                    elapsedSeconds={Math.max(
                                        0,
                                        Math.floor(
                                            (props.activityNow - activity.startedAt) / 1_000,
                                        ),
                                    )}
                                    initials={actor() ? identityInitials(actor()!) : "AI"}
                                    name={actor()?.displayName ?? "Agent"}
                                    phase={activity.phase}
                                    tokenCount={activity.tokenCount}
                                    tone={toneFor(activity.agentUserId)}
                                />
                            );
                        }}
                    </For>
                </Box>
            </Show>
            <input
                hidden
                multiple
                onChange={(event) => props.onFilesSelected(event.currentTarget.files)}
                ref={(element) => (fileInput = element)}
                type="file"
            />
            <Composer
                contextItems={props.contextItems}
                disabled={props.composerDisabled}
                emoji={emojiItems}
                hint={props.composerHint}
                mentions={props.composerMentions}
                onAttachFile={() => fileInput?.click()}
                onContextRemove={props.onContextRemove}
                onSend={props.onSend}
                onValueChange={props.onValueChange}
                pending={props.composerPending}
                placeholder={props.conversation.composerPlaceholder}
                sendEnabled={props.composerSendEnabled}
                style={{ margin: "0 20px 16px" }}
                value={props.composerValue}
            />
        </>
    );
}
