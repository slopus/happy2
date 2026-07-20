import { PluginDiagnosticsViewer } from "../../src/PluginDiagnosticsViewer";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const longOutput = Array.from(
    { length: 40 },
    (_, index) =>
        `[boot ${String(index).padStart(2, "0")}] initializing plugin runtime step ${index}`,
).join("\n");

export function PluginDiagnosticsViewerPage() {
    return (
        <ComponentPage
            number="C-069"
            summary="Read-only per-installation failure/log surface. Renders the durable status, an optional human detail line, the stored terminal failure, and captured runtime output as inert, scrollable, wrapping monospace text (never HTML). Covers loading, read failure, empty, and long-output states."
            title="PluginDiagnosticsViewer"
        >
            <Specimen
                detail="failed status badge · detail line · danger failure line · inert scrollable output block"
                label="Failed installation with output"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginDiagnosticsViewer
                        detail="MCP initialize timed out after 20s."
                        failure="container exited 1"
                        output={
                            "[boot] starting container\n[boot] running mcp server\n[error] connection refused"
                        }
                        status="failed"
                        updatedLabel="Updated 2m ago"
                    />
                </div>
                <DimensionRule label="560px · viewer fills its container" />
            </Specimen>

            <Specimen
                detail="quarantined manifest: broken configuration status, failure, and a legible unloaded explanation"
                label="Broken configuration"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginDiagnosticsViewer
                        detail="The installed manifest declares a permission the server no longer supports."
                        failure="Quarantined: unknown host permission 'legacy:admin' in installed manifest."
                        output={
                            "[boot] loading manifest\n[boot] validating declared permissions\n[error] unknown permission legacy:admin\n[boot] installation quarantined and unloaded"
                        }
                        status="broken_configuration"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="long output stays inside a 200px scrollport; the inner code block carries the inset"
                label="Long output — scrollable"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <PluginDiagnosticsViewer output={longOutput} status="failed" />
                </div>
                <DimensionRule label="output scrollport max-height 200px" />
            </Specimen>

            <Specimen
                detail="loading, empty, and read-failure states"
                label="Loading / empty / unavailable"
                number="04"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        width: "560px",
                    }}
                >
                    <PluginDiagnosticsViewer loading />
                    <PluginDiagnosticsViewer status="ready" updatedLabel="Updated just now" />
                    <PluginDiagnosticsViewer error="Diagnostics store failed" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
