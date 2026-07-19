import { PluginUninstallDialog } from "../../src/PluginUninstallDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
function log(message: string) {
    console.info(`[blueprint] PluginUninstallDialog: ${message}`);
}
function frame(children: React.ReactNode, height = 320) {
    return (
        <div
            style={{ display: "flex", position: "relative", width: "560px", height: `${height}px` }}
        >
            {children}
        </div>
    );
}
export function PluginUninstallDialogPage() {
    return (
        <ComponentPage
            number="C-076"
            summary="Destructive uninstall confirmation in a 360px danger modal. The copy names the exact blast radius: every installation (by count when known), dedicated containers, the stored package, configured secrets, and all persistent /workspace plugin data."
            title="PluginUninstallDialog"
        >
            <Specimen
                detail="danger tone · installation count named in the message · danger confirm action"
                label="Confirmation"
                number="01"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        installationCount={3}
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                        pluginName="Project Search"
                        sourceLabel="GitHub"
                    />,
                )}
                <DimensionRule label="modal small 360px" />
            </Specimen>

            <Specimen
                detail="singular installation copy"
                label="Single installation"
                number="02"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        installationCount={1}
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                        pluginName="Linked Tools"
                        sourceLabel="ZIP URL"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="in-flight uninstall: both actions disabled, close hidden, progress label"
                label="Uninstall pending"
                number="03"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        installationCount={2}
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                        pending
                        pluginName="Uploaded Tools"
                        sourceLabel="Uploaded ZIP"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="terminal failure banner above the message for retry"
                label="Uninstall failure"
                number="04"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        error="System plugin was not found"
                        installationCount={2}
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                        pluginName="Uploaded Tools"
                        sourceLabel="Uploaded ZIP"
                    />,
                    380,
                )}
            </Specimen>
        </ComponentPage>
    );
}
