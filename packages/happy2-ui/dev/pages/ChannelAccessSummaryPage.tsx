import { ChannelAccessSummary } from "../../src/ChannelAccessSummary";
import { ComponentPage, Specimen } from "../kit";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    maxWidth: "320px",
};
export function ChannelAccessSummaryPage() {
    return (
        <ComponentPage
            number="C-143"
            summary="A read-only account of a channel's access model for the details panel and creation flows: public (freely joinable, creator/admin-managed, no owner; directory listing stated separately) versus private (invite/prior-member constrained, single owner), who is credited, and — for a child — inherited parent visibility with independent membership and history."
            title="Channel access summary"
        >
            <Specimen
                detail="hash glyph · listed public access rule · creator credited (never 'owner')"
                label="Listed public channel"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    <ChannelAccessSummary
                        directoryListed
                        steward={{ name: "Maya Johnson" }}
                        visibility="public"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="hash glyph · unlisted but freely joinable through a reachable channel link"
                label="Unlisted public channel"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <ChannelAccessSummary
                        directoryListed={false}
                        steward={{ name: "Maya Johnson" }}
                        visibility="public"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="lock glyph · private access rule · single owner credited"
                label="Private channel"
                number="03"
                stage="surface"
            >
                <div style={column}>
                    <ChannelAccessSummary steward={{ name: "Steve" }} visibility="private" />
                </div>
            </Specimen>

            <Specimen
                detail="Every child limits joining to eligible parent members; visibility, membership, and history remain inherited/independent as stated"
                label="Inherited visibility (child channel)"
                number="04"
                stage="surface"
            >
                <div style={column}>
                    <ChannelAccessSummary
                        directoryListed={false}
                        inheritedFrom="#launch-week"
                        steward={{ name: "Maya Johnson" }}
                        visibility="private"
                    />
                    <ChannelAccessSummary
                        inheritedFrom="#launch-week"
                        steward={{ name: "Maya Johnson" }}
                        visibility="public"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Unresolved steward: the credit line is omitted, never guessed"
                label="No credited person"
                number="05"
                stage="surface"
            >
                <div style={column}>
                    <ChannelAccessSummary visibility="public" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
