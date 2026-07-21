import { type ReactNode } from "react";
import { InfoPanel } from "../../src/InfoPanel";
import type { MemberItem } from "../../src/MemberList";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const roster: MemberItem[] = [
    {
        id: "maya",
        initials: "MC",
        name: "Maya Chen",
        presence: "online",
        role: "owner",
        tone: "ember",
    },
    {
        id: "theo",
        initials: "TG",
        name: "Theo Grant",
        presence: "offline",
        role: "admin",
        tone: "ocean",
        username: "theo",
    },
    {
        id: "nora",
        initials: "NK",
        name: "Nora Kim",
        presence: "online",
        role: "member",
        title: "Design",
        tone: "rose",
    },
    {
        id: "steve",
        initials: "ST",
        name: "Steve",
        presence: "offline",
        role: "member",
        tone: "violet",
    },
];
/* A fixed 320px panel region, the width the side panel occupies in the shell. */
function panelFrame(children: ReactNode, height = 560) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
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
export function InfoPanelPage() {
    return (
        <ComponentPage
            number="C-047"
            summary="The channel/user detail side panel: a 52px surface header, then a scrolling body with a person ProfileCard or a read-only channel About, an optional editable body slot, and a labeled member roster."
            title="InfoPanel"
        >
            <Specimen
                detail="Channel — hash header · read-only About · Members roster"
                label="Channel details"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {panelFrame(
                        <InfoPanel
                            about="Ship mobile v2 by Friday. Humans plan, agents ship."
                            leadingIcon="hash"
                            members={roster}
                            onClose={() => {}}
                            subtitle="Details"
                            title="launch-week"
                        />,
                    )}
                    <DimensionRule label="320 px panel · 52 px header · 16 px body inset" />
                </div>
            </Specimen>

            <Specimen
                detail="Direct message — person ProfileCard header identity"
                label="User details"
                number="02"
                stage="surface"
            >
                {panelFrame(
                    <InfoPanel
                        onClose={() => {}}
                        profile={{
                            initials: "TG",
                            name: "Theo Grant",
                            presence: "online",
                            status: { emoji: "🎧", text: "In the zone" },
                            title: "Staff Engineer",
                            tone: "ocean",
                            username: "theo",
                        }}
                        subtitle="Direct message"
                        title="Theo Grant"
                    />,
                    360,
                )}
            </Specimen>
        </ComponentPage>
    );
}
