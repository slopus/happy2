import { useRef, type ReactNode } from "react";
import type { AgentActivityState, DeepReadonly, DirectoryUserProjection } from "happy2-state";
import {
    AgentActivityIndicator,
    Box,
    Button,
    ChannelHeader,
    Composer,
    MessageList,
    type ComposerAgent,
    type ContextItem,
    type Mentionable,
    type MenuItem,
} from "./ChatPageComponents.js";
import type { AudienceValue } from "../../AudienceToggle.js";
import { emojiItems, identityInitials, toneFor, type Conversation } from "./chatPageModels.js";
export interface ChatConversationProps {
    conversation: Conversation;
    activeConversationId: string;
    busy: boolean;
    joinVisible: boolean;
    starred: boolean;
    menuItems?: MenuItem[];
    messageEntries: ReactNode;
    activities: readonly DeepReadonly<AgentActivityState>[];
    activityNow: number;
    directoryUsers: readonly DeepReadonly<DirectoryUserProjection>[];
    contextItems: ContextItem[];
    composerAgentOptions?: ComposerAgent[];
    composerAudience?: AudienceValue;
    composerDefaultAgent?: ComposerAgent;
    composerDisabled: boolean;
    composerHint: string;
    composerMentions: Mentionable[];
    composerPending: boolean;
    composerSelectedAgentIds?: string[];
    composerSendEnabled: boolean;
    composerValue: string;
    onAgentAdd?(agentId: string): void;
    onAgentRemove?(agentId: string): void;
    onAudienceChange?(audience: AudienceValue): void;
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
    const fileInput = useRef<HTMLInputElement>(null);
    return (
        <>
            <ChannelHeader
                actions={
                    <>
                        {props.activeConversationId ? (
                            <Button
                                aria-label="Workspace files"
                                icon="files"
                                iconOnly
                                onClick={props.onWorkspaceToggle}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {props.joinVisible ? (
                            <Button
                                disabled={props.busy}
                                onClick={props.onJoin}
                                size="small"
                                variant="secondary"
                            >
                                Join
                            </Button>
                        ) : null}
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
            <MessageList intro={props.conversation.intro} virtualize>
                {props.messageEntries}
            </MessageList>
            {props.activities.length > 0 ? (
                <Box
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        margin: "0 20px 8px",
                    }}
                >
                    {props.activities.map((activity) => {
                        const actor = () =>
                            props.directoryUsers.find(
                                (person) => person.id === activity.agentUserId,
                            );
                        return (
                            <AgentActivityIndicator
                                elapsedSeconds={Math.max(
                                    0,
                                    Math.floor((props.activityNow - activity.startedAt) / 1000),
                                )}
                                initials={actor() ? identityInitials(actor()!) : "AI"}
                                key={`${activity.agentUserId}-${activity.startedAt}`}
                                name={actor()?.displayName ?? "Agent"}
                                phase={activity.phase}
                                tokenCount={activity.tokenCount}
                                tone={toneFor(activity.agentUserId)}
                            />
                        );
                    })}
                </Box>
            ) : null}
            <input
                hidden
                multiple
                onChange={(event) => props.onFilesSelected(event.currentTarget.files)}
                ref={fileInput}
                type="file"
            />
            <Composer
                agentOptions={props.composerAgentOptions}
                audience={props.composerAudience}
                contextItems={props.contextItems}
                defaultAgent={props.composerDefaultAgent}
                disabled={props.composerDisabled}
                emoji={emojiItems}
                hint={props.composerHint}
                mentions={props.composerMentions}
                onAgentAdd={props.onAgentAdd}
                onAgentRemove={props.onAgentRemove}
                onAttachFile={() => fileInput.current?.click()}
                onAudienceChange={props.onAudienceChange}
                onContextRemove={props.onContextRemove}
                onSend={props.onSend}
                onValueChange={props.onValueChange}
                pending={props.composerPending}
                placeholder={props.conversation.composerPlaceholder}
                selectedAgentIds={props.composerSelectedAgentIds}
                sendEnabled={props.composerSendEnabled}
                style={{ margin: "0 20px 16px" }}
                value={props.composerValue}
            />
        </>
    );
}
