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
    /** Display label of the package source, e.g. "GitHub · owner/repo". */
    sourceLabel?: string;
    /** Number of independent installations that will be deleted, when known. */
    installationCount?: number;
    /** The uninstall request is in flight; actions disable. */
    pending?: boolean;
    /** Terminal uninstall failure, shown inside the dialog for retry. */
    error?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
};
/**
 * C-068 PluginUninstallDialog — the destructive confirmation for removing a
 * system plugin. It states exactly what is deleted: every independent
 * installation (named by count when known), their dedicated containers, the
 * immutable package snapshot, and all persistent `/workspace` plugin data.
 * Presentational and fully controlled; the consumer owns the uninstall
 * request and supplies pending/failure state.
 */
export function PluginUninstallDialog(props: PluginUninstallDialogProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "pluginName",
        "sourceLabel",
        "installationCount",
        "pending",
        "error",
        "onConfirm",
        "onCancel",
    ]);
    const installations = () =>
        local.installationCount === undefined
            ? "every installation"
            : local.installationCount === 1
              ? "its 1 installation"
              : `all ${local.installationCount} installations`;
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
                        {local.pending ? "Uninstalling…" : "Uninstall plugin"}
                    </Button>
                </Box>
            }
            icon="close"
            onClose={local.pending ? undefined : local.onCancel}
            size="small"
            title={`Uninstall ${local.pluginName}?`}
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
                    This permanently deletes {installations()} of {local.pluginName}
                    {local.sourceLabel ? ` (${local.sourceLabel})` : ""}, including their dedicated
                    containers, the stored package, its configured secrets, and all persistent{" "}
                    <code>/workspace</code> plugin data. This cannot be undone.
                </span>
            </Box>
        </Modal>
    );
}
