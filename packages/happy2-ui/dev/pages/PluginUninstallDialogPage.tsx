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
            summary="Destructive per-installation uninstall confirmation in a 360px danger modal. The copy names the exact blast radius for one installation: its dedicated container, configured secrets, and persistent /workspace data — and, when it is the plugin's last installation, the stored package too."
            title="PluginUninstallDialog"
        >
            <Specimen
                detail="danger tone · one installation named by version · other installations left in place · danger confirm action"
                label="Confirmation — not the last installation"
                number="01"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        installationVersion="2.1.0"
                        onCancel={() => log("cancel")}
                        onConfirm={() => log("confirm")}
                        pluginName="Project Search"
                        sourceLabel="GitHub"
                    />,
                )}
                <DimensionRule label="modal small 360px" />
            </Specimen>

            <Specimen
                detail="the plugin's last installation: the plugin and stored package are removed too"
                label="Last installation"
                number="02"
                stage="app"
            >
                {frame(
                    <PluginUninstallDialog
                        installationVersion="2.0.0"
                        lastInstallation
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
                        installationVersion="1.0.0"
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
                        error="Plugin installation was not found"
                        installationVersion="1.0.0"
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
