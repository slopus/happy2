import type { JSX } from "solid-js";
import { AgentDesk, type DeskListItem, type DeskRun } from "../../src/AgentDesk";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const running: DeskRun[] = [
    {
        agent: "Codex",
        detail: "iPhone 15 ✓ · Pixel 9 ✓ · iPhone SE running…",
        eta: "4m left",
        id: "run-device",
        initials: "CX",
        progress: 62,
        title: "Device farm run",
        tone: "mint",
    },
    {
        agent: "Claude",
        detail: "Pulling merged PRs since v2.3.1…",
        eta: "writing",
        id: "run-notes",
        initials: "CL",
        progress: 34,
        title: "Release notes draft",
        tone: "ember",
    },
];

const queued: DeskListItem[] = [
    { id: "q-triage", meta: "Fri 9:00", title: "Weekly triage sweep" },
    { icon: "branch", id: "q-backport", meta: "after review", title: "Backport fix to v2.2" },
];

const done: DeskListItem[] = [
    { id: "d-eng479", meta: "merged", title: "ENG-479 rate limiter fix" },
    { id: "d-sup88", meta: "posted", title: "SUP-88 triage summary" },
];

function panelFrame(width: number, height: number): JSX.CSSProperties {
    return {
        background: "var(--happy2-bg-app)",
        border: "1px solid var(--happy2-border)",
        "border-radius": "14px",
        display: "flex",
        height: `${height}px`,
        overflow: "hidden",
        width: `${width}px`,
    };
}

const row: JSX.CSSProperties = {
    "align-items": "flex-start",
    display: "flex",
    gap: "24px",
    "flex-wrap": "wrap",
};

const column: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "12px",
};

export function AgentDeskPage() {
    return (
        <ComponentPage
            number="C-016"
            summary="The docked right-panel agent overview: running tiles with a brand-gradient progress bar, dashed queued rows, and done-today rows. Fluid width, fills height, scrolls."
            title="AgentDesk"
        >
            <Specimen
                detail="340×620 shell panel · header 48 px, 14 px x-pad · raised tiles radius 10 · 3 px gradient progress"
                label="Full desk — inside the AppShell panel"
                number="01"
                stage="chrome"
            >
                <div style={column}>
                    <div style={panelFrame(340, 620)}>
                        <AgentDesk done={done} queued={queued} running={running} />
                    </div>
                    <DimensionRule label="340 px panel · desk fills height" />
                </div>
            </Specimen>

            <Specimen
                detail="Avatar xs agent + 13/700 title + 11 mono eta · 12 muted detail · inset track, brand-gradient fill"
                label="Running tiles — progress states"
                number="02"
                stage="chrome"
            >
                <div style={panelFrame(340, 320)}>
                    <AgentDesk
                        running={[
                            running[0]!,
                            {
                                agent: "Claude",
                                eta: "finishing",
                                id: "run-92",
                                initials: "CL",
                                progress: 92,
                                title: "Flaky test bisect",
                                tone: "violet",
                            },
                            {
                                agent: "Triage bot",
                                detail: "Waiting on sandbox slot…",
                                id: "run-hold",
                                initials: "TB",
                                title: "Support sweep",
                                tone: "ocean",
                            },
                        ]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="QUEUED: 36 px dashed strong-hairline rows, clock icon · DONE TODAY: 32 px quiet rows, mint check, no strike-through"
                label="Queued and done rows"
                number="03"
                stage="chrome"
            >
                <div style={panelFrame(340, 336)}>
                    <AgentDesk done={done} queued={queued} running={[]} runningLabel="IDLE" />
                </div>
            </Specimen>

            <Specimen
                detail="Fluid width: same contract at 280 and 400 · custom title and runningLabel"
                label="Fluid width + label overrides"
                number="04"
                stage="chrome"
            >
                <div style={row}>
                    <div style={column}>
                        <div style={panelFrame(280, 220)}>
                            <AgentDesk
                                running={[
                                    {
                                        agent: "Codex",
                                        id: "run-narrow",
                                        initials: "CX",
                                        title: "Nightly sweep",
                                        tone: "violet",
                                    },
                                ]}
                                runningLabel="PAUSED"
                                title="Codex desk"
                            />
                        </div>
                        <DimensionRule label="280 px" />
                    </div>
                    <div style={column}>
                        <div style={panelFrame(400, 220)}>
                            <AgentDesk queued={queued.slice(0, 1)} running={[running[1]!]} />
                        </div>
                        <DimensionRule label="400 px" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="Constrained to 300 px tall — the header stays pinned and the body scrolls"
                label="Overflow — body scrolls"
                number="05"
                stage="chrome"
            >
                <div style={column}>
                    <div style={panelFrame(340, 300)}>
                        <AgentDesk done={done} queued={queued} running={running} />
                    </div>
                    <DimensionRule label="300 px tall · content ≈ 458 px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
