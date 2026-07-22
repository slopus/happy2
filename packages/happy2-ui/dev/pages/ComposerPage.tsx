import { useLayoutEffect, useState } from "react";
import { UserError } from "happy2-state";
import type { ComposerAttachment, ComposerOutput, ComposerSnapshot } from "happy2-state";
import { composerStoreFixtureCreate } from "happy2-state/testing";
import { Button } from "../../src/Button";
import {
    Composer,
    ContextChips,
    MentionPicker,
    type ContextItem,
    type Mentionable,
} from "../../src/Composer";
import { ComposerModelControl, type ComposerModelChoice } from "../../src/ComposerModelControl";
import type { EmojiItem } from "../../src/EmojiPicker";
import { StoreSurface } from "../../src/StoreSurface";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const MENTIONS: Mentionable[] = [
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
    { id: "handshake.md", name: "handshake.md", size: 12800 },
];
const RECONCILED_TEXT = "Draft restored from the server after reconnect.";
const TOOLBAR_STAGES = [
    { contentWidth: 621, label: "621px content · full hint" },
    { contentWidth: 530, label: "530px content · compact hint" },
    { contentWidth: 420, label: "420px content · compact audience" },
] as const;
const MODEL_OPTIONS: readonly ComposerModelChoice[] = [
    { id: "sol", label: "5.6 Sol" },
    { id: "terra", label: "5.6 Terra" },
    { id: "luna", label: "5.6 Luna" },
    { id: "five-five", label: "5.5" },
    { id: "five-four", label: "5.4" },
    { id: "five-four-mini", label: "5.4 Mini" },
    { id: "spark", label: "5.3 Codex Spark" },
];
const EFFORT_OPTIONS: readonly ComposerModelChoice[] = [
    { id: "low", label: "Low" },
    { id: "standard", label: "Standard" },
    { id: "high", label: "High" },
    { id: "extra-high", label: "Extra High" },
];
const SPEED_OPTIONS: readonly ComposerModelChoice[] = [
    { id: "fast", label: "Fast" },
    { id: "standard", label: "Standard" },
    { id: "deliberate", label: "Deliberate" },
];

function ModelControlFixture() {
    const [model, setModel] = useState("sol");
    const [effort, setEffort] = useState("extra-high");
    const [speed, setSpeed] = useState("standard");
    const [advancedValue, setAdvancedValue] = useState(94);
    return (
        <Composer
            modelControl={
                <ComposerModelControl
                    advancedValue={advancedValue}
                    effort={effort}
                    efforts={EFFORT_OPTIONS}
                    model={model}
                    models={MODEL_OPTIONS}
                    onAdvancedValueChange={setAdvancedValue}
                    onEffortChange={setEffort}
                    onModelChange={setModel}
                    onSpeedChange={setSpeed}
                    speed={speed}
                    speeds={SPEED_OPTIONS}
                />
            }
            onSend={noop}
            onValueChange={noop}
            placeholder="Message #launch-week"
            value=""
        />
    );
}
/*
 * Live composer driven entirely by a standalone happy2-state composer fixture —
 * no transport, authentication, server, or cross-store bridge. It exercises
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
    const [attachmentSequence] = useState(() => ({ current: 0 }));
    const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
    const [fixture] = useState(() =>
        composerStoreFixtureCreate("blueprint-composer", {
            attachments: INITIAL_ATTACHMENTS,
            output: (event: ComposerOutput) => {
                if (event.type === "textSubmitted") setLastSubmitted(event.text);
            },
        }),
    );
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    const pendingRevision = (snapshot: ComposerSnapshot) => {
        const current = snapshot.submission;
        return current.status === "pending" ? current.revision : null;
    };
    const statusLine = (snapshot: ComposerSnapshot) => {
        const current = snapshot.submission;
        const detail =
            current.status === "pending"
                ? `pending · revision ${current.revision}`
                : current.status === "failed"
                  ? `failed · “${current.error.message}”`
                  : "idle";
        const submitted = lastSubmitted;
        return submitted === null
            ? `submission ${detail}`
            : `submission ${detail} · last submit “${submitted}”`;
    };
    const contextItems = (snapshot: ComposerSnapshot): ContextItem[] =>
        snapshot.attachments.map((attachment) => ({
            detail: `${Math.max(1, Math.round(attachment.size / 1024))} KB`,
            id: attachment.id,
            kind: "file",
            label: attachment.name,
        }));
    const confirmSubmission = (snapshot: ComposerSnapshot) => {
        const revision = pendingRevision(snapshot);
        if (revision !== null) fixture.input({ type: "submissionConfirmed", revision });
    };
    const failSubmission = (snapshot: ComposerSnapshot) => {
        const revision = pendingRevision(snapshot);
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
        <StoreSurface store={fixture}>
            {(snapshot, store) => (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <Composer
                        mentions={MENTIONS}
                        attachmentMultiple
                        contextItems={contextItems(snapshot)}
                        emoji={EMOJI}
                        hint="Enter to send · @ to hand off to an agent"
                        onAttachmentsSelect={(files) => {
                            for (const file of files) {
                                store.attachmentAdd({
                                    id: `file-${attachmentSequence.current++}-${file.name}`,
                                    name: file.name,
                                    size: file.size,
                                });
                            }
                        }}
                        onContextRemove={(id) => store.attachmentRemove(id)}
                        onSend={() => store.textSubmit()}
                        onValueChange={(next) => store.textUpdate(next)}
                        pending={snapshot.submission.status === "pending"}
                        placeholder="Message #launch-week — @ mention an agent to hand off…"
                        value={snapshot.text}
                    />
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <Button
                            disabled={pendingRevision(snapshot) === null}
                            icon="check"
                            onClick={() => confirmSubmission(snapshot)}
                            size="small"
                            variant="success"
                        >
                            Confirm send
                        </Button>
                        <Button
                            disabled={pendingRevision(snapshot) === null}
                            icon="close"
                            onClick={() => failSubmission(snapshot)}
                            size="small"
                            variant="danger"
                        >
                            Fail send
                        </Button>
                        <Button icon="merge" onClick={reconcileText} size="small" variant="ghost">
                            Reconcile text
                        </Button>
                    </div>
                    <DimensionRule label={statusLine(snapshot)} />
                </div>
            )}
        </StoreSurface>
    );
}
export function ComposerPage() {
    return (
        <ComponentPage
            number="C-017"
            summary="Message composer with auto-growing text, capability-driven file/mention/emoji actions, stable sending feedback, and retained focus."
            title="Composer"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Blueprint-only controlled model configuration · model, effort, speed, and advanced slider panels"
                    label="Model control"
                    number="CP-10"
                    stage="app"
                >
                    <div
                        className="happy2-theme-dark"
                        style={{ width: "720px", padding: "280px 20px 24px" }}
                    >
                        <ModelControlFixture />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
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

            <div className="specimen-grid">
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

            <div className="specimen-grid">
                <Specimen
                    detail="24px chips · kind icons doc/play · 14px remove hit area"
                    label="ContextChips"
                    number="CP-04"
                    stage="surface"
                >
                    <div
                        style={{
                            display: "grid",
                            gap: "16px",
                            padding: "24px 20px",
                            justifyItems: "start",
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
                            alignItems: "flex-start",
                        }}
                    >
                        <div style={{ display: "grid", gap: "6px" }}>
                            <DimensionRule label="width 320" />
                            <MentionPicker
                                activeId="claude"
                                mentions={MENTIONS}
                                onSelect={noop}
                                query=""
                            />
                        </div>
                        <MentionPicker mentions={MENTIONS} onSelect={noop} query="zephyr" />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
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

            <div className="specimen-grid">
                <Specimen
                    detail="same 80px geometry · draft stays visible · actions become inert"
                    label="Sending"
                    number="CP-08"
                    stage="app"
                >
                    <div style={{ width: "640px", padding: "24px 20px" }}>
                        <Composer
                            mentions={MENTIONS}
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

            <div className="specimen-grid">
                <Specimen
                    detail="unscaled audience-enabled toolbar at its full, compact-hint, and narrow-panel stages · send remains 7px inside the card"
                    label="Toolbar stages"
                    number="CP-09"
                    stage="app"
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                            padding: "24px 20px",
                        }}
                    >
                        {TOOLBAR_STAGES.map((toolbarStage) => (
                            <div
                                key={toolbarStage.contentWidth}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                    width: `${toolbarStage.contentWidth + 2}px`,
                                }}
                            >
                                <DimensionRule label={toolbarStage.label} />
                                <Composer
                                    audience="people"
                                    compactHint="Enter to send"
                                    emoji={EMOJI}
                                    hint="Enter to send · Shift+Tab to switch audience"
                                    mentions={MENTIONS}
                                    onAttachFile={noop}
                                    onAudienceChange={noop}
                                    onSend={noop}
                                    onValueChange={noop}
                                    value="Ready to send"
                                />
                            </div>
                        ))}
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
