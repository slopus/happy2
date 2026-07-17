import { UserError } from "happy2-state";
import type { ComposerAttachment, ComposerOutput, ComposerSnapshot } from "happy2-state";
import { composerStoreFixtureCreate } from "happy2-state/testing";
import { createSignal, onCleanup } from "solid-js";
import { Button } from "../../src/Button";
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

const INITIAL_ATTACHMENTS: ComposerAttachment[] = [
    { id: "refresh.ts", name: "refresh.ts", size: 4096 },
    { id: "handshake.md", name: "handshake.md", size: 12_800 },
];

const RECONCILED_TEXT = "Draft restored from the server after reconnect.";

/*
 * Live composer driven entirely by a standalone happy2-state composer fixture —
 * no transport, auth, server, or legacy createClientState bridge. It exercises
 * BOTH directions of the P0.S1 contract:
 *
 *  - Public local actions (textUpdate, attachmentAdd, attachmentRemove,
 *    textSubmit) drive the composer from the immutable get()/subscribe()
 *    snapshot. Attachments surface as removable file context chips, the only
 *    shape the props-only Composer can render for a ComposerAttachment.
 *  - Authoritative owner input, applied through the test-only fixture.input()
 *    writer, models the server results a standalone store cannot fabricate. A
 *    submitted draft stays pending until the Blueprint controls confirm it
 *    (clears the draft), fail it with a displayable UserError, or reconcile the
 *    draft text. These inputs come only from the fixture writer; nothing here
 *    reads or bridges the legacy state.
 *
 * The fixture is disposed on unmount, so no store outlives the specimen.
 */
function Playground() {
    let attachmentSeq = 0;
    const [lastSubmitted, setLastSubmitted] = createSignal<string | null>(null);

    const fixture = composerStoreFixtureCreate("blueprint-composer", {
        attachments: INITIAL_ATTACHMENTS,
        output: (event: ComposerOutput) => {
            if (event.type === "textSubmitted") setLastSubmitted(event.text);
        },
    });
    const [snapshot, setSnapshot] = createSignal<ComposerSnapshot>(fixture.get());
    onCleanup(fixture.subscribe(() => setSnapshot(fixture.get())));
    onCleanup(() => fixture[Symbol.dispose]());

    const submission = () => snapshot().submission;
    const pendingRevision = () => {
        const current = submission();
        return current.status === "pending" ? current.revision : null;
    };
    const statusLine = () => {
        const current = submission();
        const detail =
            current.status === "pending"
                ? `pending · revision ${current.revision}`
                : current.status === "failed"
                  ? `failed · “${current.error.message}”`
                  : "idle";
        const submitted = lastSubmitted();
        return submitted === null
            ? `submission ${detail}`
            : `submission ${detail} · last submit “${submitted}”`;
    };

    const contextItems = (): ContextItem[] =>
        snapshot().attachments.map((attachment) => ({
            detail: `${Math.max(1, Math.round(attachment.size / 1024))} KB`,
            id: attachment.id,
            kind: "file",
            label: attachment.name,
        }));

    const confirmSubmission = () => {
        const revision = pendingRevision();
        if (revision !== null) fixture.input({ type: "submissionConfirmed", revision });
    };
    const failSubmission = () => {
        const revision = pendingRevision();
        if (revision !== null) {
            fixture.input({
                type: "submissionFailed",
                revision,
                error: new UserError("Message service is unavailable — try again."),
            });
        }
    };
    const reconcileText = () => fixture.input({ type: "textReconciled", text: RECONCILED_TEXT });

    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
            <Composer
                agents={AGENTS}
                attachmentMultiple
                contextItems={contextItems()}
                emoji={EMOJI}
                hint="Enter to send · @ to hand off to an agent"
                onAttachmentsSelect={(files) => {
                    for (const file of files) {
                        fixture.attachmentAdd({
                            id: `file-${attachmentSeq++}-${file.name}`,
                            name: file.name,
                            size: file.size,
                        });
                    }
                }}
                onContextRemove={(id) => fixture.attachmentRemove(id)}
                onSend={() => fixture.textSubmit()}
                onValueChange={(next) => fixture.textUpdate(next)}
                pending={submission().status === "pending"}
                placeholder="Message #launch-week — @ mention an agent to hand off…"
                value={snapshot().text}
            />
            <div
                style={{
                    display: "flex",
                    "flex-direction": "row",
                    "flex-wrap": "wrap",
                    "align-items": "center",
                    gap: "8px",
                }}
            >
                <Button
                    disabled={pendingRevision() === null}
                    icon="check"
                    onClick={confirmSubmission}
                    size="small"
                    variant="success"
                >
                    Confirm send
                </Button>
                <Button
                    disabled={pendingRevision() === null}
                    icon="close"
                    onClick={failSubmission}
                    size="small"
                    variant="danger"
                >
                    Fail send
                </Button>
                <Button icon="merge" onClick={reconcileText} size="small" variant="ghost">
                    Reconcile text
                </Button>
            </div>
            <DimensionRule label={statusLine()} />
        </div>
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
                    detail="live happy2-state composer fixture · public actions + authoritative input (confirm / fail / reconcile) · send stays pending"
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
