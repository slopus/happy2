import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Box } from "./Box";

export type PluginDiagnosticsStatus =
    | "preparing"
    | "starting"
    | "ready"
    | "broken_configuration"
    | "failed";

export type PluginDiagnosticsViewerProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The diagnostics read is in flight; shows a static loading row. */
    loading?: boolean;
    /** Terminal read failure; replaces content with an inline unavailable notice. */
    error?: string;
    /** Installation health status; drives the status badge when known. */
    status?: PluginDiagnosticsStatus;
    /** Human status detail line (statusDetail). */
    detail?: string;
    /** The stored terminal failure message (lastError). */
    failure?: string;
    /** Captured inert runtime output; rendered verbatim as text, never HTML. */
    output?: string;
    /** When the diagnostics were last updated, already formatted for display. */
    updatedLabel?: string;
};

const statusLabels: Record<PluginDiagnosticsStatus, string> = {
    preparing: "Preparing",
    starting: "Starting",
    ready: "Ready",
    broken_configuration: "Broken configuration",
    failed: "Failed",
};
const statusVariants: Record<PluginDiagnosticsStatus, BadgeVariant> = {
    preparing: "neutral",
    starting: "info",
    ready: "success",
    broken_configuration: "danger",
    failed: "danger",
};

/**
 * C-069 PluginDiagnosticsViewer — the read-only failure/log surface for one
 * plugin installation. Renders the durable status, an optional human detail
 * line, the stored terminal failure, and captured runtime output as inert,
 * scrollable, wrapping monospace text (never HTML). Covers loading, read
 * failure, empty, and long-output states. Presentational and fully controlled;
 * the consumer owns the on-demand read and supplies each state through props.
 */
export function PluginDiagnosticsViewer(props: PluginDiagnosticsViewerProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "loading",
        "error",
        "status",
        "detail",
        "failure",
        "output",
        "updatedLabel",
    ]);
    const hasBody = Boolean(local.detail || local.failure || local.output);
    return (
        <Box
            {...rest}
            className={["happy2-plugin-diagnostics", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="plugin-diagnostics"
            style={local.style}
        >
            {local.loading ? (
                <Box
                    className="happy2-plugin-diagnostics__row"
                    data-happy2-ui="plugin-diagnostics-loading"
                >
                    <span className="happy2-plugin-diagnostics__spinner" />
                    <span className="happy2-plugin-diagnostics__note">Loading diagnostics…</span>
                </Box>
            ) : local.error ? (
                <Box
                    className="happy2-plugin-diagnostics__row happy2-plugin-diagnostics__row--error"
                    data-happy2-ui="plugin-diagnostics-error"
                >
                    <span className="happy2-plugin-diagnostics__error-text">
                        Diagnostics unavailable: {local.error}
                    </span>
                </Box>
            ) : (
                <>
                    <Box className="happy2-plugin-diagnostics__header">
                        {local.status ? (
                            <Badge
                                label={statusLabels[local.status]}
                                variant={statusVariants[local.status]}
                            />
                        ) : null}
                        {local.updatedLabel ? (
                            <span
                                className="happy2-plugin-diagnostics__updated"
                                data-happy2-ui="plugin-diagnostics-updated"
                            >
                                {local.updatedLabel}
                            </span>
                        ) : null}
                    </Box>
                    {local.detail ? (
                        <span
                            className="happy2-plugin-diagnostics__detail"
                            data-happy2-ui="plugin-diagnostics-detail"
                        >
                            {local.detail}
                        </span>
                    ) : null}
                    {local.failure ? (
                        <span
                            className="happy2-plugin-diagnostics__failure"
                            data-happy2-ui="plugin-diagnostics-failure"
                        >
                            {local.failure}
                        </span>
                    ) : null}
                    {local.output ? (
                        // Inert captured output: rendered as text inside pre/code, never HTML.
                        <pre
                            className="happy2-plugin-diagnostics__output"
                            data-happy2-ui="plugin-diagnostics-output"
                        >
                            <code className="happy2-plugin-diagnostics__output-inner">
                                {local.output}
                            </code>
                        </pre>
                    ) : null}
                    {!hasBody ? (
                        <span
                            className="happy2-plugin-diagnostics__note"
                            data-happy2-ui="plugin-diagnostics-empty"
                        >
                            No diagnostic output was recorded for this installation.
                        </span>
                    ) : null}
                </>
            )}
        </Box>
    );
}
