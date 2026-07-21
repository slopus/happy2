import { type CSSProperties } from "react";
import { AgentSecretDetail, type AgentSecretBinding } from "../../src/AgentSecretDetail";
import { Modal } from "../../src/Modal";
import { ComponentPage, Specimen } from "../kit";
const agents: AgentSecretBinding[] = [
    { id: "agent-1", name: "Secret Worker", secondary: "@secret_worker" },
    { id: "agent-2", name: "Deploy Bot", secondary: "@deploy_bot" },
];
const channels: AgentSecretBinding[] = [
    { id: "chan-1", name: "Deployments", secondary: "#secret-deployments" },
];
const availableAgents = [
    { value: "agent-3", label: "Release Agent (@release_agent)" },
    { value: "agent-4", label: "QA Agent (@qa_agent)" },
];
const availableChannels = [
    { value: "chan-2", label: "Incidents (#incidents)" },
    { value: "chan-3", label: "On-call (#on-call)" },
];
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
export function AgentSecretDetailPage() {
    return (
        <ComponentPage
            number="C-056"
            summary="The body of an agent secret's detail dialog: the secret's environment-variable names (values are held only in the Rig and never shown) and the agents and channels the secret is attached to. Each attachment can be removed and an available agent or channel attached from a picker."
            title="AgentSecretDetail"
        >
            <Specimen
                detail="Variables strip over agent and channel attachment sections; each binding has a detach control and each section a picker"
                label="Attachments — inside its dialog"
                number="01"
                stage="app"
            >
                <div style={frame(560)}>
                    <Modal
                        icon="shield"
                        onClose={() => undefined}
                        size="medium"
                        title="Service API credentials"
                    >
                        <AgentSecretDetail
                            agents={agents}
                            availableAgents={availableAgents}
                            availableChannels={availableChannels}
                            channels={channels}
                            environmentVariables={["SERVICE_API_TOKEN", "SERVICE_API_REGION"]}
                            onAttachAgent={() => undefined}
                            onAttachChannel={() => undefined}
                            onDetachAgent={() => undefined}
                            onDetachChannel={() => undefined}
                        />
                    </Modal>
                </div>
            </Specimen>

            <Specimen
                detail="No attachments yet: each section shows an empty note and its attach picker"
                label="Unattached secret"
                number="02"
                stage="app"
            >
                <div style={frame(500)}>
                    <Modal
                        icon="shield"
                        onClose={() => undefined}
                        size="medium"
                        title="OpenAI organization key"
                    >
                        <AgentSecretDetail
                            agents={[]}
                            availableAgents={availableAgents}
                            availableChannels={availableChannels}
                            channels={[]}
                            environmentVariables={["OPENAI_API_KEY", "OPENAI_ORG_ID"]}
                            onAttachAgent={() => undefined}
                            onAttachChannel={() => undefined}
                            onDetachAgent={() => undefined}
                            onDetachChannel={() => undefined}
                        />
                    </Modal>
                </div>
            </Specimen>

            <Specimen
                detail="Everything attached (empty pickers disable), a detach in flight, and a mutation error banner"
                label="Fully attached and busy"
                number="03"
                stage="app"
            >
                <div style={frame(520)}>
                    <Modal
                        icon="shield"
                        onClose={() => undefined}
                        size="medium"
                        title="Deployment bot GitHub token"
                    >
                        <AgentSecretDetail
                            agents={agents}
                            availableAgents={[]}
                            availableChannels={[]}
                            busyAgentIds={["agent-2"]}
                            channels={channels}
                            environmentVariables={["GITHUB_TOKEN"]}
                            error="The agent is no longer available."
                            onAttachAgent={() => undefined}
                            onAttachChannel={() => undefined}
                            onDetachAgent={() => undefined}
                            onDetachChannel={() => undefined}
                        />
                    </Modal>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
