import type { JSX } from "solid-js";
import { BuildProgressPanel } from "../../src/BuildProgressPanel";
import { ComponentPage, Specimen } from "../kit";

/*
 * Deterministic, network-free build logs: static multi-line strings (no
 * timestamps that vary between renders) so the retained-log block and its
 * scroll geometry stay screenshot-stable.
 */
const buildingLog = [
    "resolved base image node:20-bookworm-slim",
    "pulling layer sha256:9f3e… (12.4 MB)",
    "pulling layer sha256:1ab7… (48.9 MB)",
    "extracting rootfs → /var/lib/daycare/base",
].join("\n");

const failedLog = [
    "resolved base image node:20-bookworm-slim",
    "pulling layer sha256:9f3e… (12.4 MB)",
    "extracting rootfs → /var/lib/daycare/base",
    "running provisioning step 3/6: apt-get install -y build-essential",
    "E: Unable to locate package build-essentail",
    "provisioning step 3/6 exited with code 100",
    "build aborted after 42s",
].join("\n");

function column(children: JSX.Element) {
    return (
        <div style={{ display: "flex", "flex-direction": "column", gap: "16px", width: "560px" }}>
            {children}
        </div>
    );
}

export function BuildProgressPanelPage() {
    return (
        <ComponentPage
            number="C-063"
            summary="Onboarding-sized live view of a durable agent base-image build — phase badge, deterministic progress bar, current log line, retained scrollable log, failure detail, and Retry. Props only; no timers or animation."
            title="Build progress panel"
        >
            <Specimen
                detail='status="building" · ~45% · current log line · phase + percent'
                label="Building"
                number="01"
                stage="app"
            >
                {column(
                    <BuildProgressPanel
                        currentLogLine="pulling layer sha256:1ab7… (48.9 MB) → extracting rootfs to /var/lib/daycare/base/overlay/diff"
                        progress={45}
                        status="building"
                        statusLabel="Downloading base layers"
                        title="Daycare Minimal"
                    />,
                )}
            </Specimen>

            <Specimen
                detail='status="ready" · 100% · success fill · no current log line'
                label="Ready"
                number="02"
                stage="app"
            >
                {column(
                    <BuildProgressPanel
                        currentLogLine="tagged daycare-minimal:latest"
                        progress={100}
                        status="ready"
                        statusLabel="Build complete"
                        title="Daycare Minimal"
                    />,
                )}
            </Specimen>

            <Specimen
                detail='status="failed" · error text + Retry · retained multi-line log · logTruncated'
                label="Failed"
                number="03"
                stage="app"
            >
                {column(
                    <BuildProgressPanel
                        error="Provisioning step 3/6 failed: package build-essentail could not be located."
                        log={failedLog}
                        logTruncated
                        progress={38}
                        status="failed"
                        statusLabel="Build failed while provisioning"
                        title="Research Heavy"
                    />,
                )}
            </Specimen>

            <Specimen
                detail='status="failed" + retrying · disabled Retry · static ring · retained log'
                label="Retrying"
                number="04"
                stage="app"
            >
                {column(
                    <BuildProgressPanel
                        error="Provisioning step 3/6 failed: package build-essentail could not be located."
                        log={buildingLog}
                        progress={38}
                        retrying
                        status="failed"
                        statusLabel="Retrying build"
                        title="Research Heavy"
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
