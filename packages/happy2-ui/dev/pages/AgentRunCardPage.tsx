import { createSignal } from "solid-js";
import { AgentRunCard, type AgentRun, type AgentRunStep } from "../../src/AgentRunCard";
import { DiffSnippet, type DiffLine } from "../../src/DiffSnippet";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const reviewSteps: AgentRunStep[] = [
    { label: "Reproduced flake locally (14/200 fails)", status: "done" },
    { label: "Traced race in token refresh mutex", status: "done" },
    { label: "Rewrote refresh queue, added jitter", status: "done" },
    { label: "200/200 green · CI passing", status: "done" },
];

const workingSteps: AgentRunStep[] = [
    { label: "Pulled merged PRs since v2.3.1", status: "done" },
    { label: "Drafting highlights for mobile v2", status: "working" },
    { label: "Cross-link issues and screenshots", status: "pending" },
    { label: "Post draft to #launch-week", status: "pending" },
];

const reviewRun: AgentRun = {
    agent: "Codex",
    branch: "fix/auth-flake",
    initials: "CX",
    stats: { added: 164, files: 6, note: "all tests passing", removed: 38, steps: 12 },
    status: "review",
    steps: reviewSteps,
    title: "Fix flaky auth token refresh tests",
    tone: "mint",
};

const workingRun: AgentRun = {
    agent: "Claude",
    initials: "CL",
    progress: 62,
    stats: { note: "step 2 of 4", steps: 4 },
    status: "working",
    steps: workingSteps,
    title: "Draft release notes for mobile v2",
    tone: "ember",
};

const queuedRun: AgentRun = {
    agent: "Codex",
    initials: "CX",
    stats: { note: "starts Fri 9:00", steps: 3 },
    status: "queued",
    steps: [
        { label: "Sweep stale issues in #support-fires", status: "pending" },
        { label: "Group duplicates, assign severity", status: "pending" },
        { label: "Post summary to #eng-core", status: "pending" },
    ],
    title: "Weekly triage sweep",
    tone: "mint",
};

const completeRun: AgentRun = {
    agent: "Codex",
    branch: "fix/rate-limit-429",
    initials: "CX",
    stats: { added: 41, files: 3, note: "merged by Sasha", removed: 12, steps: 8 },
    status: "complete",
    steps: reviewSteps,
    title: "Rate limiter returns 500 not 429",
    tone: "mint",
};

const diffLines: DiffLine[] = [
    { kind: "meta", text: "src/auth/refresh.ts" },
    { kind: "del", text: "const lock = await mutex.tryLock()" },
    { kind: "add", text: "const lock = await mutex.lock({" },
    { kind: "add", text: "  timeout: 5_000, jitter: true" },
    { kind: "add", text: "})" },
];

function log(id: string) {
    console.info(`[blueprint] AgentRunCard action: ${id}`);
}

export function AgentRunCardPage() {
    const [reviewExpanded, setReviewExpanded] = createSignal(false);
    const [reviewOpenExpanded, setReviewOpenExpanded] = createSignal(true);
    const [workingExpanded, setWorkingExpanded] = createSignal(true);
    const [queuedExpanded, setQueuedExpanded] = createSignal(false);
    const [completeExpanded, setCompleteExpanded] = createSignal(false);

    return (
        <ComponentPage
            number="C-013"
            summary="Agent run hero card: four status treatments (mint review glow, gradient working bar, dashed queued, complete check), mono diffstat meta, step checklist, action buttons, and an expanded diff slot."
            title="AgentRunCard"
        >
            <Specimen
                detail="mint-tinted border + glow · header 28px · title 15/700 · mono diffstat 12px · small action buttons"
                label="Needs review — collapsed hero"
                number="01"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px",
                        width: "680px",
                    }}
                >
                    <AgentRunCard
                        actions={[
                            { id: "review-diff", label: "Review diff", variant: "primary" },
                            { id: "open-channel", label: "Open in #eng-core" },
                        ]}
                        expanded={reviewExpanded()}
                        onAction={log}
                        onExpandedChange={setReviewExpanded}
                        run={reviewRun}
                    />
                    <DimensionRule label="680px · max-width" />
                </div>
            </Specimen>

            <Specimen
                detail="expanded: 28px step rows with mint check-circle glyphs, DiffSnippet in the children slot (12px margins)"
                label="Needs review — expanded"
                number="02"
                stage="app"
            >
                <div style={{ width: "680px" }}>
                    <AgentRunCard
                        actions={[
                            { id: "approve-merge", label: "Approve & merge", variant: "primary" },
                            { id: "request-changes", label: "Request changes" },
                        ]}
                        expanded={reviewOpenExpanded()}
                        onAction={log}
                        onExpandedChange={setReviewOpenExpanded}
                        run={reviewRun}
                    >
                        <DiffSnippet lines={diffLines} stats={{ added: 164, removed: 38 }} />
                    </AgentRunCard>
                </div>
            </Specimen>

            <Specimen
                detail="3px brand-gradient progress strip at 62% · warning RUNNING badge · accent working dot, faint pending dots"
                label="Working"
                number="03"
                stage="app"
            >
                <div style={{ width: "620px" }}>
                    <AgentRunCard
                        actions={[{ id: "pause", label: "Pause run" }]}
                        expanded={workingExpanded()}
                        onAction={log}
                        onExpandedChange={setWorkingExpanded}
                        run={workingRun}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="dashed border-strong hairline · neutral QUEUED badge · collapsed by default"
                label="Queued"
                number="04"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px",
                        width: "520px",
                    }}
                >
                    <AgentRunCard
                        expanded={queuedExpanded()}
                        onExpandedChange={setQueuedExpanded}
                        run={queuedRun}
                    />
                    <DimensionRule label="520px · fluid below max-width" />
                </div>
            </Specimen>

            <Specimen
                detail="neutral hairline + 16px mint check-circle in the header · COMPLETED badge · branch row"
                label="Complete"
                number="05"
                stage="app"
            >
                <div style={{ width: "620px" }}>
                    <AgentRunCard
                        actions={[{ id: "open-channel", label: "Open in #eng-core" }]}
                        expanded={completeExpanded()}
                        onAction={log}
                        onExpandedChange={setCompleteExpanded}
                        run={completeRun}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
