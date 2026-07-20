import { useRef, type ReactNode } from "react";
import type { AgentActivityState, DeepReadonly } from "happy2-state";
import {
    AgentActivityStrip,
    Box,
    Button,
    ChannelHeader,
    Composer,
    MessageList,
    TerminalPanel,
    type ContextItem,
    type Mentionable,
    type MenuItem,
} from "./ChatPageComponents.js";
import type { TerminalSnapshot } from "happy2-state";
import type { AudienceValue } from "../../AudienceToggle.js";
import { emojiItems, type Conversation } from "./chatPageModels.js";
export interface ChatConversationProps {
    conversation: Conversation;
    activeConversationId: string;
    busy: boolean;
    joinVisible: boolean;
    starred: boolean;
    menuItems?: MenuItem[];
    /** Native plugin chat-menu contribution triggers, shown in the header actions. */
    headerContributions?: ReactNode;
    /** Native plugin composer contribution triggers, shown in the composer toolbar. */
    composerContributions?: ReactNode;
    messageEntries: ReactNode;
    activities: readonly DeepReadonly<AgentActivityState>[];
    activityNow: number;
    contextItems: ContextItem[];
    composerAudience?: AudienceValue;
    composerCompactHint: string;
    composerDisabled: boolean;
    composerHint: string;
    composerMentions: Mentionable[];
    composerPending: boolean;
    composerSendEnabled: boolean;
    composerValue: string;
    onAudienceChange?(audience: AudienceValue): void;
    onContextRemove(id: string): void;
    onFilesSelected(files: FileList | null): void;
    onComposerFocusChange(focused: boolean): void;
    onInfoOpen(): void;
    onJoin(): void;
    onMenuSelect(id: string): void;
    onSend(): void;
    onStarToggle(): void;
    onValueChange(value: string): void;
    onWorkspaceToggle(): void;
    onDocumentsToggle(): void;
    /** Creates a document in this conversation from the composer action row. */
    onDocumentAdd(): void;
    terminal?: TerminalSnapshot;
    terminalAvailable: boolean;
    terminalHeight: number;
    onTerminalClose(): void;
    onTerminalHeightChange(height: number): void;
    onTerminalOpen(): void;
    onTerminalInput(data: string): void;
    onTerminalReconnect(): void;
    onTerminalResize(cols: number, rows: number): void;
}
export function ChatConversation(props: ChatConversationProps) {
    const fileInput = useRef<HTMLInputElement>(null);
    return (
        <div className="happy2-chat-conversation" data-happy2-ui="chat-conversation">
            <ChannelHeader
                actions={
                    <>
                        {props.activeConversationId && props.terminalAvailable ? (
                            <Button
                                aria-label="Open terminal"
                                icon="terminal"
                                iconOnly
                                onClick={props.onTerminalOpen}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {props.activeConversationId ? (
                            <Button
                                aria-label="Documents"
                                icon="doc"
                                iconOnly
                                onClick={props.onDocumentsToggle}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
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
                        {props.headerContributions}
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
            <Box className="happy2-chat-conversation__dock">
                <Box className="happy2-chat-conversation__compose">
                    {props.activities.length > 0 ? (
                        <AgentActivityStrip
                            now={props.activityNow}
                            // Rig subagent/terminal ids are only unique per agent, so
                            // two concurrently active agents need namespaced row keys.
                            subagents={props.activities.flatMap((activity) =>
                                activity.subagents.map((subagent) => ({
                                    ...subagent,
                                    id: `${activity.agentUserId}:${subagent.id}`,
                                })),
                            )}
                            terminals={props.activities.flatMap((activity) =>
                                activity.backgroundTerminals.map((terminal) => ({
                                    ...terminal,
                                    id: `${activity.agentUserId}:${terminal.id}`,
                                })),
                            )}
                        />
                    ) : null}
                    <input
                        hidden
                        multiple
                        onChange={(event) => props.onFilesSelected(event.currentTarget.files)}
                        ref={fileInput}
                        type="file"
                    />
                    <Composer
                        audience={props.composerAudience}
                        contributions={props.composerContributions}
                        contextItems={props.contextItems}
                        disabled={props.composerDisabled}
                        emoji={emojiItems}
                        compactHint={props.composerCompactHint}
                        hint={props.composerHint}
                        mentions={props.composerMentions}
                        onAttachFile={() => fileInput.current?.click()}
                        onAddDocument={props.activeConversationId ? props.onDocumentAdd : undefined}
                        onAudienceChange={props.onAudienceChange}
                        onContextRemove={props.onContextRemove}
                        onFocusChange={props.onComposerFocusChange}
                        onSend={props.onSend}
                        onValueChange={props.onValueChange}
                        pending={props.composerPending}
                        placeholder={props.conversation.composerPlaceholder}
                        sendEnabled={props.composerSendEnabled}
                        value={props.composerValue}
                    />
                </Box>
            </Box>
            {props.terminal ? (
                <TerminalPanel
                    error={props.terminal.error?.message}
                    exitCode={props.terminal.exitCode}
                    grid={props.terminal.grid}
                    height={props.terminalHeight}
                    onClose={props.onTerminalClose}
                    onHeightChange={props.onTerminalHeightChange}
                    onInput={props.onTerminalInput}
                    onReconnect={props.onTerminalReconnect}
                    onResize={props.onTerminalResize}
                    status={props.terminal.status}
                />
            ) : null}
        </div>
    );
}
