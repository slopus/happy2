import type { JSX } from "solid-js";
import { DiffSnippet } from "../../src/DiffSnippet";
import { DayDivider, Message, MessageList } from "../../src/Message";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
};

/* Messages are full-bleed rows; specimens frame them in an app-surface card. */
function channelFrame(children: JSX.Element, height?: string) {
    return (
        <div
            style={{
                background: "var(--rg-bg-app)",
                border: "1px solid var(--rg-border)",
                "border-radius": "10px",
                display: "flex",
                "flex-direction": "column",
                ...(height ? { height } : { padding: "8px 0" }),
                overflow: "hidden",
                width: "680px",
            }}
        >
            {children}
        </div>
    );
}

export function MessagePage() {
    return (
        <ComponentPage
            number="C-012"
            summary="The chat column: rich-bodied messages with agent badges, reactions, attachments, and reply affordances inside a bottom-anchored scrolling list."
            title="Message · MessageList · DayDivider"
        >
            <Specimen
                detail="6px 20px row · 36px avatar + 12px gap · author 14/700 · time 11 mono · body 15/22"
                label="Message — rich body segments"
                number="01"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <Message
                            author="Maya Johnson"
                            body={[
                                {
                                    kind: "text",
                                    text: "Standup: notifications bug is the last blocker for Friday. ",
                                },
                                { kind: "mention", text: "Claude" },
                                { kind: "text", text: " can you take " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: " and loop in " },
                                { kind: "mention", text: "Codex" },
                                { kind: "text", text: " per the " },
                                { kind: "link", text: "launch checklist" },
                                { kind: "text", text: "?" },
                            ]}
                            time="10:42"
                            tone="amber"
                        />,
                    )}
                    <DimensionRule label="680 px frame · text / mention / code / link segments" />
                </div>
            </Specimen>

            <Specimen
                detail="Accent AGENT badge · agent avatar (rounded square) · reactions + ghost add · reply affordance"
                label="Message — agent author with reactions"
                number="02"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body="Fix is up — moved token registration behind the handshake promise and added a cold-start retry."
                        initials="CX"
                        onReactionAdd={() => {}}
                        reactions={[
                            { count: 3, emoji: "🎉" },
                            { count: 2, emoji: "🚀" },
                            { active: true, count: 1, emoji: "✅" },
                        ]}
                        replyCount={4}
                        time="10:51"
                        tone="mint"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="children slot renders full-width below the body, 8px top margin"
                label="Message — attachment card"
                number="03"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body={[
                            { kind: "text", text: "Diff for " },
                            { kind: "code", text: "fix/cold-start-push" },
                            { kind: "text", text: " is ready for review." },
                        ]}
                        initials="CX"
                        time="10:52"
                        tone="mint"
                    >
                        <DiffSnippet
                            file="src/push/register.ts"
                            lines={[
                                { kind: "meta", number: 41, text: "@@ async register(token) @@" },
                                {
                                    kind: "del",
                                    number: 42,
                                    text: "const lock = await mutex.tryLock()",
                                },
                                {
                                    kind: "add",
                                    number: 42,
                                    text: "const lock = await mutex.lock({ timeout: 5_000 })",
                                },
                                {
                                    kind: "context",
                                    number: 43,
                                    text: "if (!lock) return queue.enqueue(token)",
                                },
                            ]}
                            stats={{ added: 86, removed: 17 }}
                        />
                    </Message>,
                )}
            </Specimen>

            <Specimen
                detail="compact: no avatar/author row — 11px mono time in the 36px gutter, body stays on the content column"
                label="Message — compact follow-ups"
                number="04"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Claude"
                            agent
                            body="On it. I reproduced the drop — notifications registered before the push token handshake finishes on cold start."
                            time="10:43"
                            tone="ember"
                        />
                        <Message
                            compact
                            author="Claude"
                            body="Handing the fix to Codex and I'll draft release notes in parallel."
                            time="10:44"
                        />
                        <Message
                            compact
                            author="Claude"
                            body={[
                                { kind: "text", text: "Tracking in " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: "." },
                            ]}
                            time="10:44"
                        />
                    </>,
                )}
            </Specimen>

            <Specimen
                detail="Hover/focus toolbar · reaction picker trigger · start thread · real supplied overflow actions"
                label="Message — hover actions"
                number="05"
                stage="app"
            >
                {channelFrame(
                    <Message
                        actionsVisible
                        author="Sasha K."
                        body="Review is green. I left one note on the retry boundary."
                        menuItems={[
                            { kind: "item", id: "copy-link", icon: "link", label: "Copy link" },
                            { kind: "item", id: "edit", icon: "edit", label: "Edit message" },
                        ]}
                        onMenuSelect={() => {}}
                        onReactionSelect={() => {}}
                        onReplySelect={() => {}}
                        reactionOptions={[
                            { char: "👍", id: "👍", name: "Thumbs up" },
                            { char: "🎉", id: "🎉", name: "Celebrate" },
                            { char: "✅", id: "✅", name: "Done" },
                        ]}
                        time="10:55"
                        tone="ocean"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Consecutive author grouping removes repeated identity; sending changes opacity only and preserves every box"
                label="Message — grouped + sending"
                number="06"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Maya Johnson"
                            body="The release note is ready to publish."
                            time="11:02"
                            tone="amber"
                        />
                        <Message
                            author="Maya Johnson"
                            body="Waiting for the final server acknowledgement."
                            deliveryState="sending"
                            grouped
                            time="11:03"
                        />
                    </>,
                )}
                <DimensionRule label="identical row geometry before / during delivery" />
            </Specimen>

            <Specimen
                detail="11/700 mono uppercase pill (inset bg, radius 999) between hairline segments"
                label="DayDivider"
                number="07"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <DayDivider label="Yesterday" />
                            <DayDivider label="Today" />
                            <DayDivider label="Monday, June 30" />
                        </>,
                    )}
                    <DimensionRule label="20 px pill · 12 px gap to hairlines" />
                </div>
            </Specimen>

            <Specimen
                detail="Sparse history bottom-anchors against the 12px padding; intro block leads the chronology"
                label="MessageList — bottom anchor + intro"
                number="08"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <MessageList
                            intro={{
                                description:
                                    "Ship mobile v2 by Friday. Humans and agents coordinate here.",
                                title: "Welcome to #launch-week",
                            }}
                        >
                            <DayDivider label="Today" />
                            <Message
                                author="Maya Johnson"
                                body="Standup: notifications bug is the last blocker."
                                time="10:42"
                                tone="amber"
                            />
                            <Message
                                compact
                                author="Maya Johnson"
                                body="Kicking off the fix now."
                                time="10:43"
                            />
                        </MessageList>,
                        "400px",
                    )}
                    <DimensionRule label="400 px viewport · newest message pinned to the bottom" />
                </div>
            </Specimen>

            <Specimen
                detail="Overflowing history mounts scrolled to the newest message and follows appended content unless the reader scrolls up"
                label="MessageList — long history"
                number="09"
                stage="app"
            >
                {channelFrame(
                    <MessageList>
                        <DayDivider label="Yesterday" />
                        <Message
                            author="Maya Johnson"
                            body="Kickoff notes are in the doc — mobile v2 scope is locked."
                            time="09:58"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Claude"
                            body="I filed the remaining QA tasks and assigned owners."
                            time="10:05"
                            tone="ember"
                        />
                        <DayDivider label="Today" />
                        <Message
                            author="Maya Johnson"
                            body={[
                                { kind: "text", text: "Standup: " },
                                { kind: "mention", text: "Claude" },
                                { kind: "text", text: " can you take " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: "?" },
                            ]}
                            time="10:42"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Claude"
                            body="On it. I reproduced the drop — registering before the handshake finishes."
                            time="10:43"
                            tone="ember"
                        />
                        <Message
                            agent
                            author="Codex"
                            body="Fix is up — cold-start retry added, tests green."
                            initials="CX"
                            reactions={[
                                { count: 3, emoji: "🎉" },
                                { count: 2, emoji: "🚀" },
                            ]}
                            time="10:51"
                            tone="mint"
                        />
                        <Message
                            author="Sasha K."
                            body="Reviewing now. If it's green on the device farm we're clear for Friday."
                            replyCount={2}
                            time="10:54"
                            tone="ocean"
                        />
                    </MessageList>,
                    "360px",
                )}
            </Specimen>
        </ComponentPage>
    );
}
