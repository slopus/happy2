import { type ReactNode } from "react";
import type { AgentActivityState, DeepReadonly } from "happy2-state";
import {
    Button,
    ChannelHeader,
    MessageList,
    PortShareControl,
    TerminalPanel,
    type ContextItem,
    type Mentionable,
    type MenuItem,
} from "./ChatPageComponents.js";
import type { TerminalSnapshot } from "happy2-state";
import type { AudienceValue } from "../../AudienceToggle.js";
import type { MessageListScrollPosition } from "../../Message.js";
import { ComposerDock } from "./ComposerDock.js";
import { type Conversation, type PortShareView } from "./chatPageModels.js";
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
    messageListScrollPosition?: MessageListScrollPosition;
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
    onMessageListScrollPositionChange?(position: MessageListScrollPosition): void;
    onSend(): void;
    onStarToggle(): void;
    onValueChange(value: string): void;
    onWorkspaceToggle(): void;
    onDocumentsToggle(): void;
    /** Fired when a mention is inserted; document mentions attach the document. */
    onMentionSelect?(mention: Mentionable): void;
    portShare?: PortShareView;
    onPortShareOpen(): void;
    onPortShareDisable(): void;
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
    return (
        <div className="happy2-chat-conversation" data-happy2-ui="chat-conversation">
            <ChannelHeader
                actions={
                    <>
                        {props.portShare ? (
                            <PortShareControl
                                disabling={props.portShare.disabling}
                                error={props.portShare.error}
                                name={props.portShare.name}
                                onDisable={props.onPortShareDisable}
                                onOpen={props.onPortShareOpen}
                                opening={props.portShare.opening}
                                variant="compact"
                            />
                        ) : null}
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
            <MessageList
                initialScrollPosition={props.messageListScrollPosition}
                key={props.activeConversationId}
                onScrollPositionChange={props.onMessageListScrollPositionChange}
                virtualize
            >
                {props.messageEntries}
            </MessageList>
            <ComposerDock
                activities={props.activities}
                activityNow={props.activityNow}
                composerAudience={props.composerAudience}
                composerCompactHint={props.composerCompactHint}
                composerContributions={props.composerContributions}
                composerDisabled={props.composerDisabled}
                composerHint={props.composerHint}
                composerMentions={props.composerMentions}
                composerPending={props.composerPending}
                composerSendEnabled={props.composerSendEnabled}
                composerValue={props.composerValue}
                contextItems={props.contextItems}
                onAudienceChange={props.onAudienceChange}
                onComposerFocusChange={props.onComposerFocusChange}
                onContextRemove={props.onContextRemove}
                onFilesSelected={props.onFilesSelected}
                onMentionSelect={props.onMentionSelect}
                onSend={props.onSend}
                onValueChange={props.onValueChange}
                placeholder={props.conversation.composerPlaceholder}
            />
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
