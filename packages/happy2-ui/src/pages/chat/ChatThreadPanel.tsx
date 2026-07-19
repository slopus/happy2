import { type ReactNode } from "react";
import {
    Banner,
    Composer,
    EmptyState,
    MessageList,
    ThreadPanel,
    type Mentionable,
} from "./ChatPageComponents.js";
import { emojiItems } from "./chatPageModels.js";

export interface ChatThreadPanelProps {
    children: ReactNode;
    draft: string;
    mentions: Mentionable[];
    pending: boolean;
    disabled?: boolean;
    empty?: boolean;
    loading?: boolean;
    error?: {
        message: string;
        onRetry(): void;
        title: string;
    };
    rootAuthor?: string;
    onClose(): void;
    onDraftChange(value: string): void;
    onSend(): void;
}

/** Thread panel transcript with a pinned root, explicit load failures, and a scoped composer. */
export function ChatThreadPanel(props: ChatThreadPanelProps) {
    return (
        <ThreadPanel
            composer={
                <Composer
                    disabled={props.disabled}
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
            <MessageList virtualize>
                {props.children}
                {props.loading ? (
                    <div
                        data-happy2-ui="thread-panel-state"
                        data-state="loading"
                        key="thread-state:loading"
                        style={{ display: "flex", padding: "8px 12px" }}
                    >
                        <Banner tone="neutral" title="Loading replies">
                            Resolving this thread’s conversation…
                        </Banner>
                    </div>
                ) : props.error ? (
                    <div
                        data-happy2-ui="thread-panel-state"
                        data-state="error"
                        key="thread-state:error"
                        style={{ display: "flex", padding: "8px 12px" }}
                    >
                        <Banner
                            action={{ label: "Retry", onClick: props.error.onRetry }}
                            tone="danger"
                            title={props.error.title}
                        >
                            {props.error.message}
                        </Banner>
                    </div>
                ) : props.empty ? (
                    <div
                        data-happy2-ui="thread-panel-state"
                        data-state="empty"
                        key="thread-state:empty"
                        style={{ display: "flex", padding: "8px 12px" }}
                    >
                        <EmptyState icon="thread" size="inline" title="No replies yet." />
                    </div>
                ) : null}
            </MessageList>
        </ThreadPanel>
    );
}
