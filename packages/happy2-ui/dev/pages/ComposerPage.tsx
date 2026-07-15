import { createSignal } from "solid-js";
import {
    Composer,
    ContextChips,
    MentionPicker,
    type ContextItem,
    type MentionableAgent,
} from "../../src/Composer";
import type { EmojiItem } from "../../src/EmojiPicker";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const AGENTS: MentionableAgent[] = [
    {
        description: "Ships code end to end",
        id: "codex",
        initials: "CX",
        name: "Codex",
        status: "ready",
        tone: "mint",
    },
    {
        description: "Deep research, reviews, and long-running analysis",
        id: "claude",
        initials: "CL",
        name: "Claude",
        status: "working",
        tone: "violet",
    },
    {
        description: "Support triage and intake",
        id: "triage",
        initials: "TR",
        name: "Triage",
        status: "ready",
        tone: "amber",
    },
];

const CONTEXT_ITEMS: ContextItem[] = [
    { detail: "src/auth", id: "file-1", kind: "file", label: "refresh.ts" },
    { detail: "+86 −17", id: "run-1", kind: "run", label: "fix/auth-flake" },
    { id: "thread-1", kind: "thread", label: "#eng-core" },
];

const EMOJI: EmojiItem[] = [
    { char: "👍", id: "thumbsup", name: "thumbs up" },
    { char: "🎉", id: "tada", name: "tada" },
    { char: "🚀", id: "rocket", name: "rocket" },
    { char: "✅", id: "check", name: "check mark" },
    { char: "🔥", id: "fire", name: "fire" },
    { char: "❤️", id: "heart", name: "heart" },
    { char: "👀", id: "eyes", name: "eyes" },
    { char: "🙏", id: "pray", name: "folded hands" },
];

const noop = () => {};

function Playground() {
    let nextAttachmentId = 0;
    const [value, setValue] = createSignal("");
    const [items, setItems] = createSignal<ContextItem[]>(CONTEXT_ITEMS);
    return (
        <Composer
            agents={AGENTS}
            attachmentMultiple
            contextItems={items()}
            emoji={EMOJI}
            hint="Enter to send · @ to hand off to an agent"
            onAttachmentsSelect={(files) =>
                setItems([
                    ...items(),
                    ...files.map((file) => ({
                        detail: `${Math.max(1, Math.round(file.size / 1024))} KB`,
                        id: `file-${nextAttachmentId++}-${file.name}`,
                        kind: "file" as const,
                        label: file.name,
                    })),
                ])
            }
            onContextRemove={(id) => setItems(items().filter((item) => item.id !== id))}
            onSend={() => setValue("")}
            onValueChange={setValue}
            placeholder="Message #launch-week — @ mention an agent to hand off…"
            value={value()}
        />
    );
}

export function ComposerPage() {
    return (
        <ComponentPage
            number="C-017"
            summary="Message composer with auto-growing text, capability-driven file/mention/emoji actions, stable sending feedback, and retained focus."
            title="Composer"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="80px single-line card · capability actions hidden · send disabled while empty"
                    label="Default"
                    number="CP-01"
                    stage="app"
                >
                    <div
                        style={{
                            width: "640px",
                            padding: "24px 20px",
                            display: "grid",
                            gap: "6px",
                        }}
                    >
                        <DimensionRule label="fluid width · height 80" />
                        <Composer
                            hint="Enter to send · @ to hand off to an agent"
                            onSend={noop}
                            onValueChange={noop}
                            placeholder="Message #launch-week — @ mention an agent to hand off…"
                            value=""
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="draft grows 22px per line, capped at 8 lines · send enabled"
                    label="Multiline draft"
                    number="CP-02"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "24px 20px" }}>
                        <Composer
                            hint="Enter to send"
                            onSend={noop}
                            onValueChange={noop}
                            value={
                                "Fix is up — moved token registration behind the handshake promise.\nAdded a cold-start retry with jittered backoff.\nDevice farm run is green on all three targets."
                            }
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="context row 8px inset above the draft · removable 24px chips"
                    label="With context"
                    number="CP-03"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "24px 20px" }}>
                        <Composer
                            contextItems={CONTEXT_ITEMS}
                            hint="Enter to send"
                            onContextRemove={noop}
                            onSend={noop}
                            onValueChange={noop}
                            value="@Codex take the retry logic from here"
                        />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="24px chips · kind icons doc/play/thread · 14px remove hit area"
                    label="ContextChips"
                    number="CP-04"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            gap: "16px",
                            padding: "24px 20px",
                            "justify-items": "start",
                        }}
                    >
                        <ContextChips items={CONTEXT_ITEMS} label="Context" onRemove={noop} />
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="readOnly — remove affordance hidden" />
                            <ContextChips items={CONTEXT_ITEMS} readOnly />
                        </div>
                    </div>
                </Specimen>
                <Specimen
                    detail="320px raised popover · 44px rows · status badges · empty state"
                    label="MentionPicker"
                    number="CP-05"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            gap: "24px",
                            padding: "24px 20px",
                            "align-items": "flex-start",
                        }}
                    >
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="width 320" />
                            <MentionPicker
                                activeId="claude"
                                agents={AGENTS}
                                onSelect={noop}
                                query=""
                            />
                        </div>
                        <MentionPicker agents={AGENTS} onSelect={noop} query="zephyr" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="textarea and all controls disabled · muted draft"
                    label="Disabled"
                    number="CP-06"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "24px 20px" }}>
                        <Composer
                            disabled
                            onSend={noop}
                            onValueChange={noop}
                            value="Draft held while the run completes"
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="live: files, mentions, emoji, Enter-to-send, and retained focus"
                    label="Playground"
                    number="CP-07"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "260px 20px 24px" }}>
                        <Playground />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="same 80px geometry · draft stays visible · actions become inert"
                    label="Sending"
                    number="CP-08"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "24px 20px" }}>
                        <Composer
                            agents={AGENTS}
                            emoji={EMOJI}
                            onAttachFile={noop}
                            onSend={noop}
                            onValueChange={noop}
                            pending
                            value="Shipping the message…"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
