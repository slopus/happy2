import { PluginPermissionCard } from "../../src/PluginPermissionCard";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/* Deterministic inline 1×1 violet PNG so the blueprint loads no network assets. */
const PLUGIN_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAChAGAgUOTOAAAAABJRU5ErkJggg==";

function log(message: string) {
    console.info(`[blueprint] PluginPermissionCard: ${message}`);
}

export function PluginPermissionCardPage() {
    return (
        <ComponentPage
            number="C-067"
            summary="Chat-scoped permission prompt for an agent-requested plugin install or uninstall: staged package image, request title, description, agent reason, mono source well, and Approve / Deny actions. Processing disables actions; approved, denied, and failed are clearly terminal."
            title="PluginPermissionCard"
        >
            <Specimen
                detail="card max 560px · amber pending hairline · 48px package image · reason quote · mono source well · Approve/Deny footer"
                label="Pending install"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginPermissionCard
                        action="install"
                        description="Adds a safe helper skill for the chat workflow."
                        imageUrl={PLUGIN_IMAGE}
                        onApprove={() => log("approve")}
                        onDeny={() => log("deny")}
                        pluginName="Chat Helper"
                        reason="The user asked for its chat workflow."
                        requestedBy="Plugin Builder"
                        shortName="chat-helper"
                        source="https://plugins.example/chat-helper.zip"
                        status="pending"
                    />
                </div>
                <DimensionRule label="560px maximum card width" />
            </Specimen>

            <Specimen
                detail="uninstall request without image or reason falls back to the braces glyph"
                label="Pending uninstall — minimal content"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginPermissionCard
                        action="uninstall"
                        description="Adds a safe helper skill for the chat workflow."
                        onApprove={() => log("approve uninstall")}
                        onDeny={() => log("deny uninstall")}
                        pluginName="Chat Helper"
                        requestedBy="Plugin Builder"
                        shortName="chat-helper"
                        status="pending"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="ordinary members see the request without decision actions"
                label="Pending — member view"
                number="02b"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginPermissionCard
                        action="install"
                        canDecide={false}
                        description="Adds a safe helper skill for the chat workflow."
                        imageUrl={PLUGIN_IMAGE}
                        pluginName="Chat Helper"
                        reason="The user asked for its chat workflow."
                        requestedBy="Plugin Builder"
                        shortName="chat-helper"
                        source="https://plugins.example/chat-helper.zip"
                        status="pending"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="a decision in flight disables both actions"
                label="Busy decision"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginPermissionCard
                        action="install"
                        busy
                        description="Adds a safe helper skill for the chat workflow."
                        imageUrl={PLUGIN_IMAGE}
                        pluginName="Chat Helper"
                        requestedBy="Plugin Builder"
                        shortName="chat-helper"
                        status="pending"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="processing swaps the actions for an info state line"
                label="Processing"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginPermissionCard
                        action="install"
                        description="Adds a safe helper skill for the chat workflow."
                        imageUrl={PLUGIN_IMAGE}
                        pluginName="Chat Helper"
                        requestedBy="Plugin Builder"
                        shortName="chat-helper"
                        status="processing"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="terminal states add a resolution banner and a muted state line"
                label="Approved / denied / failed"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={{ display: "flex", width: "560px" }}>
                        <PluginPermissionCard
                            action="install"
                            description="Adds a safe helper skill for the chat workflow."
                            pluginName="Chat Helper"
                            requestedBy="Plugin Builder"
                            shortName="chat-helper"
                            status="approved"
                        />
                    </div>
                    <div style={{ display: "flex", width: "560px" }}>
                        <PluginPermissionCard
                            action="uninstall"
                            description="Adds a safe helper skill for the chat workflow."
                            pluginName="Chat Helper"
                            requestedBy="Plugin Builder"
                            shortName="chat-helper"
                            status="denied"
                        />
                    </div>
                    <div style={{ display: "flex", width: "560px" }}>
                        <PluginPermissionCard
                            action="install"
                            description="Adds a safe helper skill for the chat workflow."
                            error="MCP initialize timed out after 20s."
                            pluginName="Chat Helper"
                            requestedBy="Plugin Builder"
                            shortName="chat-helper"
                            status="failed"
                        />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
