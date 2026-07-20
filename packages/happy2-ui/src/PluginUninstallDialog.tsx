import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Modal } from "./Modal";
export type PluginUninstallDialogProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    pluginName: string;
    /** The version of the specific installation being removed. */
    installationVersion?: string;
    /** Display label of the package source, e.g. "GitHub · owner/repo". */
    sourceLabel?: string;
    /**
     * True when this is the plugin's last installation, so removing it also
     * removes the plugin and its stored package entirely.
     */
    lastInstallation?: boolean;
    /** The uninstall request is in flight; actions disable. */
    pending?: boolean;
    /** Terminal uninstall failure, shown inside the dialog for retry. */
    error?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
};
/**
 * C-068 PluginUninstallDialog — the destructive confirmation for removing one
 * plugin installation. It states exactly what is deleted: this installation, its
 * dedicated container, its configured secrets, and its persistent `/workspace`
 * plugin data — and, when it is the plugin's last installation, the stored
 * package too. Presentational and fully controlled; the consumer owns the
 * uninstall request and supplies pending/failure state.
 */
export function PluginUninstallDialog(props: PluginUninstallDialogProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "pluginName",
        "installationVersion",
        "sourceLabel",
        "lastInstallation",
        "pending",
        "error",
        "onConfirm",
        "onCancel",
    ]);
    const target = () =>
        local.installationVersion
            ? `the v${local.installationVersion} installation of ${local.pluginName}`
            : `this installation of ${local.pluginName}`;
    return (
        <Modal
            {...rest}
            className={["happy2-plugin-uninstall-dialog", local.className]
                .filter(Boolean)
                .join(" ")}
            footer={
                <Box className="happy2-plugin-uninstall-dialog__actions">
                    <Button
                        disabled={local.pending}
                        onClick={() => local.onCancel?.()}
                        variant="ghost"
                    >
                        Cancel
                    </Button>
                    <Button
                        data-testid="plugin-uninstall-confirm"
                        disabled={local.pending}
                        onClick={() => local.onConfirm?.()}
                        variant="danger"
                    >
                        {local.pending ? "Uninstalling…" : "Uninstall installation"}
                    </Button>
                </Box>
            }
            icon="close"
            onClose={local.pending ? undefined : local.onCancel}
            size="small"
            title={`Uninstall this installation?`}
            tone="danger"
        >
            <Box className="happy2-plugin-uninstall-dialog__body">
                {local.error ? (
                    <Banner
                        data-testid="plugin-uninstall-error"
                        tone="danger"
                        title="Uninstall failed"
                    >
                        {local.error}
                    </Banner>
                ) : null}
                <span
                    className="happy2-plugin-uninstall-dialog__message"
                    data-happy2-ui="plugin-uninstall-message"
                >
                    This permanently deletes {target()}
                    {local.sourceLabel ? ` (${local.sourceLabel})` : ""}, including its dedicated
                    container, its configured secrets, and all persistent <code>/workspace</code>{" "}
                    data for this installation.
                    {local.lastInstallation
                        ? " It is the last installation, so the plugin and its stored package are removed too."
                        : " Other installations of this plugin are left in place."}{" "}
                    This cannot be undone.
                </span>
            </Box>
        </Modal>
    );
}
