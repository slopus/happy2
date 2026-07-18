import type { JSX } from "solid-js";
import { Composer, MessageList, ThreadPanel, type Mentionable } from "./ChatPageComponents.js";
import { emojiItems } from "./chatPageModels.js";

export interface ChatThreadPanelProps {
    children: JSX.Element;
    draft: string;
    mentions: Mentionable[];
    pending: boolean;
    rootAuthor?: string;
    onClose(): void;
    onDraftChange(value: string): void;
    onSend(): void;
}

export function ChatThreadPanel(props: ChatThreadPanelProps) {
    return (
        <ThreadPanel
            composer={
                <Composer
                    emoji={emojiItems}
                    hint="Reply in thread"
                    mentions={props.mentions}
                    onSend={props.onSend}
                    onValueChange={props.onDraftChange}
                    pending={props.pending}
                    placeholder="Reply…"
                    sendEnabled={props.draft.trim().length > 0}
                    value={props.draft}
                />
            }
            data-testid="thread-panel"
            onClose={props.onClose}
            subtitle={props.rootAuthor}
        >
            <MessageList intro={{ title: "Thread", description: "No replies yet." }}>
                {props.children}
            </MessageList>
        </ThreadPanel>
    );
}
