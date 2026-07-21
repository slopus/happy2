import { useState, type CSSProperties } from "react";
import { AgentImagePanel, type AgentImageItem } from "../../src/AgentImagePanel";
import { ComponentPage, Specimen } from "../kit";
const images: AgentImageItem[] = [
    {
        id: "img-default",
        name: "Daycare — full toolchain",
        status: "ready",
        builtin: true,
        isDefault: true,
        updatedLabel: "Jul 12, 2:14 PM",
    },
    {
        id: "img-minimal",
        name: "Daycare — minimal",
        status: "ready",
        builtin: true,
        updatedLabel: "Jul 12, 2:14 PM",
    },
    {
        id: "img-building",
        name: "Python + Node toolchain",
        status: "building",
        progress: 62,
        lastLogLine: "#6 [4/4] RUN pip install --no-cache-dir -r /tmp/requirements.txt",
        updatedLabel: "Jul 13, 9:02 AM",
    },
    {
        id: "img-pending",
        name: "Rust nightly",
        status: "pending",
        updatedLabel: "Jul 13, 9:05 AM",
    },
    {
        id: "img-failed",
        name: "GPU inference base",
        status: "failed",
        error: "apt-get: package cuda-toolkit-12-4 has no installation candidate",
        updatedLabel: "Jul 13, 8:47 AM",
    },
];
function frame(height: number): CSSProperties {
    return {
        background: "var(--groupped-background)",
        border: "1px solid var(--divider)",
        borderRadius: "14px",
        display: "flex",
        height: `${height}px`,
        overflow: "hidden",
        padding: "16px",
        width: "980px",
    };
}
export function AgentImagePanelPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("Python + Node toolchain");
    const [dockerfile, setDockerfile] = useState(
        "FROM happy2/agent-base:latest\nRUN apt-get update && apt-get install -y python3 nodejs",
    );
    return (
        <ComponentPage
            number="C-050"
            summary="The administrator surface for immutable agent container images: build status per image, promote a ready image to default, retry pending or failed builds, and author a new image from a Dockerfile. Fully controlled — data and mutations flow through props."
            title="AgentImagePanel"
        >
            <Specimen
                detail="Building row shows a progress bar + last log line; rows are clickable to open the detail"
                label="Image list — full lifecycle"
                number="01"
                stage="app"
            >
                <div style={frame(360)}>
                    <AgentImagePanel
                        images={images}
                        onBuildImage={() => undefined}
                        onOpenCreate={() => undefined}
                        onSelectImage={() => undefined}
                        onSetDefaultImage={() => undefined}
                        subtitle="Immutable images every server-owned agent runs inside."
                    />
                </div>
            </Specimen>

            <Specimen
                detail="A pending build is in flight — its row actions disable via busyImageIds"
                label="Busy row — in-flight mutation"
                number="02"
                stage="app"
            >
                <div style={frame(300)}>
                    <AgentImagePanel
                        busyImageIds={["img-pending"]}
                        images={images.slice(2)}
                        onBuildImage={() => undefined}
                        onSetDefaultImage={() => undefined}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Empty and loading affordances draw from EmptyState"
                label="Empty and loading"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <div style={frame(240)}>
                        <AgentImagePanel images={[]} onOpenCreate={() => undefined} />
                    </div>
                    <div style={frame(240)}>
                        <AgentImagePanel images={[]} loading />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="Create dialog renders in a self-contained overlay; inputs are controlled"
                label="Author a new image — live"
                number="04"
                stage="app"
            >
                <div style={frame(420)}>
                    <AgentImagePanel
                        createOpen={createOpen}
                        draftDockerfile={dockerfile}
                        draftName={name}
                        images={images}
                        onCloseCreate={() => setCreateOpen(false)}
                        onDraftDockerfileChange={setDockerfile}
                        onDraftNameChange={setName}
                        onOpenCreate={() => setCreateOpen(true)}
                        onSubmitCreate={() => setCreateOpen(false)}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
