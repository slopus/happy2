import { type ReactNode } from "react";
import { Composer } from "../../src/Composer";
import { DayDivider, Message, MessageList } from "../../src/Message";
import { ThreadPanel } from "../../src/ThreadPanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
/* A fixed 320px panel region, the width the side panel occupies in the shell. */
function panelFrame(children: ReactNode, height = 560) {
    return (
        <div
            style={{
                background: "var(--happy2-bg-surface)",
                border: "1px solid var(--happy2-border)",
                borderRadius: "10px",
                height: `${height}px`,
                overflow: "hidden",
                width: "320px",
            }}
        >
            {children}
        </div>
    );
}
export function ThreadPanelPage() {
    return (
        <ComponentPage
            number="C-048"
            summary="The thread side panel: a 52px surface header (shared height with ChannelHeader and InfoPanel), a transcript that fills and scrolls, and a reply composer pinned to the bottom."
            title="ThreadPanel"
        >
            <Specimen
                detail="52px header · root + replies transcript · reply composer footer"
                label="Thread with replies"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <ThreadPanel
                            composer={
                                <Composer
                                    hint="Reply in thread"
                                    onSend={() => {}}
                                    onValueChange={() => {}}
                                    placeholder="Reply…"
                                    value=""
                                />
                            }
                            onClose={() => {}}
                            subtitle="Maya Chen · 2 replies"
                            title="Thread"
                        >
                            <MessageList>
                                <DayDivider label="Today" />
                                <Message
                                    author="Maya Chen"
                                    body="Kicking off the fix — can you verify on the device farm?"
                                    time="10:42"
                                    tone="ember"
                                />
                                <Message
                                    agent
                                    author="Patch"
                                    body="On it. Cold-start and warm-start both deliver."
                                    initials="P"
                                    time="10:51"
                                    tone="violet"
                                />
                                <Message
                                    author="Nora Kim"
                                    body="Green across the board 🎉"
                                    time="10:55"
                                    tone="rose"
                                />
                            </MessageList>
                        </ThreadPanel>,
                    )}
                    <DimensionRule label="320 px panel · 52 px header · composer 12 px inset" />
                </div>
            </Specimen>

            <Specimen
                detail="Empty thread — header + intro only, composer waiting for the first reply"
                label="Thread — no replies yet"
                number="02"
                stage="surface"
            >
                {panelFrame(
                    <ThreadPanel
                        composer={
                            <Composer
                                hint="Reply in thread"
                                onSend={() => {}}
                                onValueChange={() => {}}
                                placeholder="Reply…"
                                value=""
                            />
                        }
                        onClose={() => {}}
                        subtitle="Codex"
                        title="Thread"
                    >
                        <MessageList intro={{ title: "Thread", description: "No replies yet." }}>
                            <Message
                                agent
                                author="Codex"
                                body="Fix is up — cold-start retry added, tests green."
                                initials="CX"
                                time="10:51"
                                tone="mint"
                            />
                        </MessageList>
                    </ThreadPanel>,
                    420,
                )}
            </Specimen>
        </ComponentPage>
    );
}
