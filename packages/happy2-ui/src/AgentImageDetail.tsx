import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import type { AgentImageStatus } from "./AgentImagePanel";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
export type AgentImageDetailProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    status: AgentImageStatus;
    /** Best-effort build completion percentage (0–100); shown while building. */
    progress?: number;
    builtin?: boolean;
    isDefault?: boolean;
    dockerfile: string;
    buildLog: string;
    /** The captured log kept only its most recent tail. */
    buildLogTruncated?: boolean;
    /** Final build failure, shown as a banner for a failed image. */
    lastError?: string;
    /** The detail is still being fetched. */
    loading?: boolean;
    /** The detail fetch failed. */
    error?: string;
};
const statusVariant: Record<AgentImageStatus, BadgeVariant> = {
    pending: "info",
    building: "warning",
    ready: "success",
    failed: "danger",
};
const statusLabel: Record<AgentImageStatus, string> = {
    pending: "Pending",
    building: "Building",
    ready: "Ready",
    failed: "Failed",
};
function progressValue(value: number | undefined): number {
    return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}
/**
 * C-051 AgentImageDetail — the body of an agent image's detail: a status strip
 * with its build progress, the exact Dockerfile it builds from, and the captured
 * build log. Presentational and fully controlled; a consuming app fetches the
 * image and keeps `buildLog`/`progress` live so the log streams while it builds.
 * Designed to sit inside a Modal (which carries the image name as its title).
 */
export function AgentImageDetail(props: AgentImageDetailProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "status",
        "progress",
        "builtin",
        "isDefault",
        "dockerfile",
        "buildLog",
        "buildLogTruncated",
        "lastError",
        "loading",
        "error",
    ]);
    return (
        <Box
            {...rest}
            className={["happy2-agent-image-detail", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="agent-image-detail"
            style={local.style}
        >
            {!local.error ? (
                <>
                    <Box className="happy2-agent-image-detail__status">
                        <Badge
                            label={statusLabel[local.status]}
                            variant={statusVariant[local.status]}
                        />
                        {local.builtin ? <Badge label="Built-in" variant="outline" /> : null}
                        {local.isDefault ? (
                            <Badge icon="check" label="Default" variant="accent" />
                        ) : null}
                        {local.status === "building" ? (
                            <Box
                                aria-valuemax={100}
                                aria-valuemin={0}
                                aria-valuenow={progressValue(local.progress)}
                                className="happy2-agent-image-detail__progress"
                                role="progressbar"
                            >
                                <span className="happy2-agent-image-detail__progress-track">
                                    <span
                                        className="happy2-agent-image-detail__progress-fill"
                                        style={{ width: `${progressValue(local.progress)}%` }}
                                    />
                                </span>
                                <span className="happy2-agent-image-detail__progress-value">
                                    {progressValue(local.progress)}%
                                </span>
                            </Box>
                        ) : null}
                    </Box>
                    {local.status === "failed" && local.lastError ? (
                        <Banner tone="danger" title="Build failed">
                            {local.lastError}
                        </Banner>
                    ) : null}
                    <Section label="Dockerfile">
                        {!local.loading ? (
                            <pre
                                className="happy2-agent-image-detail__code"
                                data-happy2-ui="agent-image-detail-dockerfile"
                            >
                                {local.dockerfile}
                            </pre>
                        ) : (
                            <p className="happy2-agent-image-detail__empty">Loading Dockerfile…</p>
                        )}
                    </Section>
                    <Section
                        label="Build log"
                        note={
                            local.buildLogTruncated ? "Showing the most recent output" : undefined
                        }
                    >
                        {local.loading ? (
                            <p className="happy2-agent-image-detail__empty">Loading build log…</p>
                        ) : local.buildLog.trim() ? (
                            <pre
                                className="happy2-agent-image-detail__code"
                                data-happy2-ui="agent-image-detail-log"
                            >
                                {local.buildLog}
                            </pre>
                        ) : (
                            <p className="happy2-agent-image-detail__empty">No build output yet.</p>
                        )}
                    </Section>
                </>
            ) : (
                <Banner tone="danger" title="Image unavailable">
                    {local.error!}
                </Banner>
            )}
        </Box>
    );
}
function Section(props: { label: string; note?: string; children: ReactNode }) {
    return (
        <section className="happy2-agent-image-detail__section">
            <header className="happy2-agent-image-detail__section-head">
                <span className="happy2-agent-image-detail__section-label">{props.label}</span>
                {props.note ? (
                    <span className="happy2-agent-image-detail__section-note">{props.note}</span>
                ) : null}
            </header>
            {props.children}
        </section>
    );
}
