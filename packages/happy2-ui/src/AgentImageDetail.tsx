import { Show, splitProps, type JSX } from "solid-js";
import type { AgentImageStatus } from "./AgentImagePanel";
import { Badge, type BadgeVariant } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";

export type AgentImageDetailProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
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
    const [local, rest] = splitProps(props, [
        "class",
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
            class={["happy2-agent-image-detail", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="agent-image-detail"
            style={local.style}
        >
            <Show
                when={!local.error}
                fallback={
                    <Banner tone="danger" title="Image unavailable">
                        {local.error!}
                    </Banner>
                }
            >
                <Box class="happy2-agent-image-detail__status">
                    <Badge
                        label={statusLabel[local.status]}
                        variant={statusVariant[local.status]}
                    />
                    <Show when={local.builtin}>
                        <Badge label="Built-in" variant="outline" />
                    </Show>
                    <Show when={local.isDefault}>
                        <Badge icon="check" label="Default" variant="accent" />
                    </Show>
                    <Show when={local.status === "building"}>
                        <Box
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={progressValue(local.progress)}
                            class="happy2-agent-image-detail__progress"
                            role="progressbar"
                        >
                            <span class="happy2-agent-image-detail__progress-track">
                                <span
                                    class="happy2-agent-image-detail__progress-fill"
                                    style={{ width: `${progressValue(local.progress)}%` }}
                                />
                            </span>
                            <span class="happy2-agent-image-detail__progress-value">
                                {progressValue(local.progress)}%
                            </span>
                        </Box>
                    </Show>
                </Box>

                <Show when={local.status === "failed" && local.lastError}>
                    <Banner tone="danger" title="Build failed">
                        {local.lastError}
                    </Banner>
                </Show>

                <Section label="Dockerfile">
                    <Show
                        when={!local.loading}
                        fallback={
                            <p class="happy2-agent-image-detail__empty">Loading Dockerfile…</p>
                        }
                    >
                        <pre
                            class="happy2-agent-image-detail__code"
                            data-happy2-ui="agent-image-detail-dockerfile"
                        >
                            {local.dockerfile}
                        </pre>
                    </Show>
                </Section>

                <Section
                    label="Build log"
                    note={local.buildLogTruncated ? "Showing the most recent output" : undefined}
                >
                    <Show
                        when={local.loading}
                        fallback={
                            <Show
                                when={local.buildLog.trim()}
                                fallback={
                                    <p class="happy2-agent-image-detail__empty">
                                        No build output yet.
                                    </p>
                                }
                            >
                                <pre
                                    class="happy2-agent-image-detail__code"
                                    data-happy2-ui="agent-image-detail-log"
                                >
                                    {local.buildLog}
                                </pre>
                            </Show>
                        }
                    >
                        <p class="happy2-agent-image-detail__empty">Loading build log…</p>
                    </Show>
                </Section>
            </Show>
        </Box>
    );
}

function Section(props: { label: string; note?: string; children: JSX.Element }) {
    return (
        <section class="happy2-agent-image-detail__section">
            <header class="happy2-agent-image-detail__section-head">
                <span class="happy2-agent-image-detail__section-label">{props.label}</span>
                <Show when={props.note}>
                    <span class="happy2-agent-image-detail__section-note">{props.note}</span>
                </Show>
            </header>
            {props.children}
        </section>
    );
}
