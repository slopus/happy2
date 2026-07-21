import { useState, type CSSProperties } from "react";
import {
    AgentSecretPanel,
    type AgentSecretDraftVariable,
    type AgentSecretItem,
} from "../../src/AgentSecretPanel";
import { ComponentPage, Specimen } from "../kit";
const secrets: AgentSecretItem[] = [
    {
        id: "service-api",
        description: "Service API credentials",
        environmentVariables: ["SERVICE_API_TOKEN", "SERVICE_API_REGION"],
        agentCount: 2,
        channelCount: 1,
    },
    {
        id: "openai",
        description: "OpenAI organization key",
        environmentVariables: [
            "OPENAI_API_KEY",
            "OPENAI_ORG_ID",
            "OPENAI_PROJECT",
            "OPENAI_BASE_URL",
            "OPENAI_TIMEOUT",
        ],
        agentCount: 5,
        channelCount: 0,
    },
    {
        id: "deploy-bot",
        description: "Deployment bot GitHub token",
        environmentVariables: ["GITHUB_TOKEN"],
        agentCount: 0,
        channelCount: 3,
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
export function AgentSecretPanelPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const [id, setId] = useState("service-api");
    const [description, setDescription] = useState("Service API credentials");
    const [variables, setVariables] = useState<AgentSecretDraftVariable[]>([
        { name: "SERVICE_API_TOKEN", value: "sk-live-9f2c" },
        { name: "SERVICE_API_REGION", value: "west" },
    ]);
    const changeVariable = (index: number, field: "name" | "value", value: string) =>
        setVariables((current) =>
            current.map((variable, i) =>
                i === index ? { ...variable, [field]: value } : variable,
            ),
        );
    return (
        <ComponentPage
            number="C-055"
            summary="The administrator surface for Rig-owned secrets: named bundles of environment variables the Rig injects into the agents and channels they are attached to. Delete a secret or author a new one from an id, a description, and one or more name/value variables. Values are write-only — the list only ever shows variable names."
            title="AgentSecretPanel"
        >
            <Specimen
                detail="Variable names show as outline badges; the attachment column counts agents and channels; rows open the detail"
                label="Secret list"
                number="01"
                stage="app"
            >
                <div style={frame(320)}>
                    <AgentSecretPanel
                        onDeleteSecret={() => undefined}
                        onOpenCreate={() => undefined}
                        onSelectSecret={() => undefined}
                        secrets={secrets}
                        subtitle="Bundles of environment variables the Rig injects into agents and channels."
                    />
                </div>
            </Specimen>

            <Specimen
                detail="A delete is in flight — its row action disables via busySecretIds"
                label="Busy row — in-flight delete"
                number="02"
                stage="app"
            >
                <div style={frame(260)}>
                    <AgentSecretPanel
                        busySecretIds={["service-api"]}
                        onDeleteSecret={() => undefined}
                        secrets={secrets.slice(0, 2)}
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
                        <AgentSecretPanel onOpenCreate={() => undefined} secrets={[]} />
                    </div>
                    <div style={frame(240)}>
                        <AgentSecretPanel loading secrets={[]} />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="Create dialog renders in a self-contained overlay; the value fields are masked and controlled"
                label="Author a new secret — live"
                number="04"
                stage="app"
            >
                <div style={frame(520)}>
                    <AgentSecretPanel
                        createOpen={createOpen}
                        draftDescription={description}
                        draftId={id}
                        draftVariables={variables}
                        onAddDraftVariable={() =>
                            setVariables((current) => [...current, { name: "", value: "" }])
                        }
                        onCloseCreate={() => setCreateOpen(false)}
                        onDraftDescriptionChange={setDescription}
                        onDraftIdChange={setId}
                        onDraftVariableChange={changeVariable}
                        onOpenCreate={() => setCreateOpen(true)}
                        onRemoveDraftVariable={(index) =>
                            setVariables((current) => current.filter((_, i) => i !== index))
                        }
                        onSubmitCreate={() =>
                            (() => {
                                setCreateOpen(false);
                            })()
                        }
                        secrets={secrets}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
