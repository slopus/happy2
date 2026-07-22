import { AutomatedTag } from "../../src/AutomatedTag";
import { Message } from "../../src/Message";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
const row: Record<string, string> = {
    alignItems: "center",
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
};
/* Messages are full-bleed rows; the in-context specimen frames them in a card. */
function channelFrame(children: React.ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: "680px",
            }}
        >
            {children}
        </div>
    );
}
export function AutomatedTagPage() {
    return (
        <ComponentPage
            number="C-142"
            summary="A quiet inline marker that a user-attributed message was posted through automation — a plugin or API acting on the author's behalf. It keeps the human author's identity and never reads as the separate agent/system treatment."
            title="Automated tag"
        >
            <Specimen
                detail="16px inline row · 12px chip glyph + 4px gap + mono 10/700 uppercase caption · text-secondary · no fill or border"
                label="AutomatedTag"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <div style={row}>
                        <AutomatedTag />
                    </div>
                    <DimensionRule label="16 px high · glyph + caption share one baseline" />
                </div>
            </Specimen>

            <Specimen
                detail="Beside a bolded author name, as it composes in a message meta row"
                label="AutomatedTag — beside an author"
                number="02"
                stage="surface"
            >
                <div style={{ ...row, gap: "8px" }}>
                    <span
                        style={{
                            color: "var(--text)",
                            font: "600 14px var(--happy2-font-ui)",
                        }}
                    >
                        Maya Johnson
                    </span>
                    <AutomatedTag />
                </div>
            </Specimen>

            <Specimen
                detail="Incoming automated message keeps the human author + avatar; the marker sits after the name, before the hover time"
                label="In context — incoming automated"
                number="03"
                stage="app"
            >
                {channelFrame(
                    <Message
                        author="Maya Johnson"
                        automated
                        body="Standup reminder posted for the team — reply here when you're ready."
                        time="09:00"
                        tone="amber"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Own automated message: no meta row, so the marker rides the bubble line in the aside lane and stays visible without hover"
                label="In context — own automated"
                number="04"
                stage="app"
            >
                {channelFrame(
                    <Message
                        author="Steve"
                        automated
                        body="Deploying the release on schedule."
                        own
                        time="10:53"
                        tone="ocean"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Automation is orthogonal to authorship: an ordinary human message shows no marker; an agent message keeps its own AGENT treatment, never this tag"
                label="In context — not automated"
                number="05"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Maya Johnson"
                            body="Typed this one by hand."
                            time="10:42"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Codex"
                            body="Agent authorship is a separate concept — no automated tag here."
                            initials="CX"
                            time="10:43"
                            tone="mint"
                        />
                    </>,
                )}
            </Specimen>
        </ComponentPage>
    );
}
