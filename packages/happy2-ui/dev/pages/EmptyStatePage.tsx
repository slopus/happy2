import { EmptyState } from "../../src/EmptyState";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const noop = () => {};

const panelStage: Record<string, string> = {
    display: "flex",
    "flex-direction": "column",
    gap: "12px",
    width: "440px",
};

export function EmptyStatePage() {
    return (
        <ComponentPage
            number="C-024"
            summary="Centered icon medallion + title + description + action. Panel fills and vertically centers its host region; inline is a compact content-sized block. Replaces the app's raw .feature-empty."
            title="Empty state"
        >
            <div class="specimen-grid">
                <Specimen
                    detail="panel · 48px medallion · title 15/20 · description 13/18 · medium action"
                    label="Panel — full"
                    number="E-01"
                    stage="app"
                >
                    <div style={panelStage}>
                        <div style={{ width: "440px", height: "320px" }}>
                            <EmptyState
                                action={{
                                    icon: "edit",
                                    label: "Start a conversation",
                                    onClick: noop,
                                }}
                                description="Messages you send and receive will show up here."
                                icon="inbox"
                                size="panel"
                                title="No messages yet"
                            />
                        </div>
                        <DimensionRule label="440 × 320 host · content vertically centered" />
                    </div>
                </Specimen>

                <Specimen
                    detail="panel · icon + title only (no description, no action)"
                    label="Panel — minimal"
                    number="E-02"
                    stage="app"
                >
                    <div style={panelStage}>
                        <div style={{ width: "440px", height: "320px" }}>
                            <EmptyState icon="search" size="panel" title="No results found" />
                        </div>
                        <DimensionRule label="medallion 48 · title only" />
                    </div>
                </Specimen>
            </div>

            <div class="specimen-grid">
                <Specimen
                    detail="inline · 40px medallion · title 14/18 · small action"
                    label="Inline — full"
                    number="E-03"
                    stage="surface"
                >
                    <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
                        <EmptyState
                            action={{ icon: "plus", label: "New thread", onClick: noop }}
                            description="Follow a thread to keep it here for quick access."
                            icon="thread"
                            size="inline"
                            title="No followed threads"
                        />
                        <DimensionRule label="content-sized · 24px padding" />
                    </div>
                </Specimen>

                <Specimen
                    detail="inline · description, no action"
                    label="Inline — no action"
                    number="E-04"
                    stage="surface"
                >
                    <EmptyState
                        description="Files shared in this channel will appear here."
                        icon="files"
                        size="inline"
                        title="No files shared"
                    />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
