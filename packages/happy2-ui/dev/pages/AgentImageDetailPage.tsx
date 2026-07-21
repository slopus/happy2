import { type CSSProperties } from "react";
import { AgentImageDetail } from "../../src/AgentImageDetail";
import { Modal } from "../../src/Modal";
import { ComponentPage, Specimen } from "../kit";
const dockerfile = [
    "FROM happy2/agent-base:latest",
    "RUN apt-get update && apt-get install -y python3 python3-pip nodejs",
    "COPY requirements.txt /tmp/requirements.txt",
    "RUN pip install --no-cache-dir -r /tmp/requirements.txt",
    'ENTRYPOINT ["/usr/local/bin/happy2-agent"]',
].join("\n");
const buildLog = [
    "#1 [internal] load build definition from Dockerfile",
    "#2 [internal] load metadata for docker.io/happy2/agent-base:latest",
    "#3 [1/4] FROM docker.io/happy2/agent-base:latest",
    "#4 [2/4] RUN apt-get update && apt-get install -y python3 python3-pip nodejs",
    "#4 12.4 Setting up python3 (3.12.3-1) ...",
    "#4 18.9 Setting up nodejs (20.11.1) ...",
    "#5 [3/4] COPY requirements.txt /tmp/requirements.txt",
    "#6 [4/4] RUN pip install --no-cache-dir -r /tmp/requirements.txt",
    "#6 4.2 Collecting anthropic",
].join("\n");
function frame(height: number, width = 560): CSSProperties {
    return {
        background: "var(--groupped-background)",
        border: "1px solid var(--divider)",
        borderRadius: "14px",
        display: "flex",
        height: `${height}px`,
        overflow: "hidden",
        padding: "20px",
        width: `${width}px`,
    };
}
export function AgentImageDetailPage() {
    return (
        <ComponentPage
            number="C-051"
            summary="The body of an agent image's detail dialog: a status strip with build progress, the exact Dockerfile, and the captured build log — each a scrollable monospace block. Fully controlled; the log streams live while the image builds."
            title="AgentImageDetail"
        >
            <Specimen
                detail="Building: warning status + brand-gradient progress, Dockerfile and a live, truncated build log"
                label="Building — inside its dialog"
                number="01"
                stage="app"
            >
                <div style={frame(560)}>
                    <Modal
                        icon="spark"
                        onClose={() => undefined}
                        size="medium"
                        title="Python + Node"
                    >
                        <AgentImageDetail
                            buildLog={buildLog}
                            buildLogTruncated
                            dockerfile={dockerfile}
                            progress={62}
                            status="building"
                        />
                    </Modal>
                </div>
            </Specimen>

            <Specimen
                detail="Failed: danger banner with the final error above the captured log"
                label="Failed — with the build error"
                number="02"
                stage="app"
            >
                <div style={frame(520)}>
                    <Modal
                        icon="spark"
                        onClose={() => undefined}
                        size="medium"
                        title="GPU inference base"
                    >
                        <AgentImageDetail
                            buildLog={buildLog}
                            dockerfile={dockerfile}
                            lastError="package cuda-toolkit-12-4 has no installation candidate"
                            status="failed"
                        />
                    </Modal>
                </div>
            </Specimen>

            <Specimen
                detail="Ready default: success + accent Default badge; a pending image shows an empty log placeholder"
                label="Ready default and empty log"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <div style={frame(440)}>
                        <Modal
                            icon="spark"
                            onClose={() => undefined}
                            size="medium"
                            title="Daycare — full"
                        >
                            <AgentImageDetail
                                buildLog={buildLog}
                                builtin
                                dockerfile={dockerfile}
                                isDefault
                                status="ready"
                            />
                        </Modal>
                    </div>
                    <div style={frame(360)}>
                        <Modal
                            icon="spark"
                            onClose={() => undefined}
                            size="medium"
                            title="Rust nightly"
                        >
                            <AgentImageDetail
                                buildLog=""
                                dockerfile={dockerfile}
                                status="pending"
                            />
                        </Modal>
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
