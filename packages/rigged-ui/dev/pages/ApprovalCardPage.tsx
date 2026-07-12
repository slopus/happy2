import { createSignal } from "solid-js";
import {
    ApprovalCard,
    type ApprovalRequest,
    type ApprovalResolution,
} from "../../src/ApprovalCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const column: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "14px",
    width: "680px",
};

const request: ApprovalRequest = {
    action: "edit config/releases/onboarding.json",
    agent: "Codex",
    impact: "Applies to the next deploy only; nothing ships until the release train cuts on Friday.",
    initials: "CX",
    reason: "Wants to raise the rollout gate from 20% to 50% before Friday's release.",
    resources: ["onboarding.json", "release-train", "deploy-bot"],
    title: "Edit release gating config",
    tone: "mint",
    typeLabel: "PERMISSION",
};

const deleteRequest: ApprovalRequest = {
    action: "rm -rf .cache/render && pnpm run rebuild",
    agent: "Claude",
    impact: "Rebuild takes about four minutes; preview deploys pause until it finishes.",
    initials: "CL",
    reason: "The render cache is stale after the asset pipeline change and must be rebuilt.",
    resources: [".cache/render", "preview-deploys"],
    title: "Clear the render cache",
    tone: "ember",
    typeLabel: "DESTRUCTIVE",
};

const noop = () => {};

export function ApprovalCardPage() {
    const [expanded, setExpanded] = createSignal(false);
    const [resolution, setResolution] = createSignal<ApprovalResolution>("pending");

    return (
        <ComponentPage
            number="C-014"
            summary="Approval gate for guarded agent actions — amber pending treatment with a mono action well, resource chips on expand, and mint/red resolution banners."
            title="ApprovalCard"
        >
            <Specimen
                detail="680px max · radius 10 · warning-soft hairline · shield chip 26 · footer 28px actions"
                label="Pending — collapsed"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <ApprovalCard
                        expanded={false}
                        onExpandedChange={noop}
                        onResolutionChange={noop}
                        request={request}
                        resolution="pending"
                    />
                    <DimensionRule label="680 px max · 191 px collapsed" />
                </div>
            </Specimen>

            <Specimen
                detail="Impact paragraph + outline resource badges · chevron rotates 180°"
                label="Pending — expanded"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <ApprovalCard
                        expanded
                        onExpandedChange={noop}
                        onResolutionChange={noop}
                        request={request}
                        resolution="pending"
                    />
                    <DimensionRule label="details add 96 px" />
                </div>
            </Specimen>

            <Specimen
                detail="32px success banner · chip goes mint · actions collapse to a muted state line"
                label="Approved"
                number="03"
                stage="app"
            >
                <div style={column}>
                    <ApprovalCard
                        expanded={false}
                        onExpandedChange={noop}
                        onResolutionChange={noop}
                        request={request}
                        resolution="approved"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Danger equivalent — red banner, chip, and state line"
                label="Denied"
                number="04"
                stage="app"
            >
                <div style={column}>
                    <ApprovalCard
                        expanded={false}
                        onExpandedChange={noop}
                        onResolutionChange={noop}
                        request={deleteRequest}
                        resolution="denied"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Live props wiring — Approve / Request changes resolve, Details toggles"
                label="Interactive"
                number="05"
                stage="app"
            >
                <div style={column}>
                    <ApprovalCard
                        expanded={expanded()}
                        onExpandedChange={setExpanded}
                        onResolutionChange={setResolution}
                        request={deleteRequest}
                        resolution={resolution()}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Fluid below the 680px clamp — action line truncates with ellipsis"
                label="Narrow container (440px)"
                number="06"
                stage="app"
            >
                <div style={{ ...column, width: "440px" }}>
                    <ApprovalCard
                        expanded={false}
                        onExpandedChange={noop}
                        onResolutionChange={noop}
                        request={request}
                        resolution="pending"
                    />
                    <DimensionRule label="440 px container" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
