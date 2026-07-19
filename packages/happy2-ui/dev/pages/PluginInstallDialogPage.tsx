import { useState } from "react";
import {
    PluginInstallDialog,
    type PluginInstallDialogCandidate,
    type PluginInstallDialogSourceKind,
} from "../../src/PluginInstallDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const alphaTools: PluginInstallDialogCandidate = {
    id: "token-alpha",
    displayName: "Alpha Tools",
    shortName: "alpha-tools",
    version: "1.4.0",
    description: "Project search and refactoring helpers for the alpha toolchain.",
    sourceKind: "github",
    sourceReference: "https://github.com/example/toolbox",
    skills: [
        { name: "alpha-search", description: "Searches the alpha index." },
        { name: "alpha-refactor", description: "Rewrites alpha modules safely." },
    ],
    variables: [
        {
            key: "ALPHA_API_TOKEN",
            displayName: "API token",
            description: "Token used by the MCP server.",
            kind: "secret",
        },
        {
            key: "ALPHA_REGION",
            displayName: "Region",
            description: "Region used for alpha queries.",
            kind: "text",
        },
    ],
    mcp: { type: "stdio", container: "selection_required" },
};
const betaTools: PluginInstallDialogCandidate = {
    id: "token-beta",
    displayName: "Beta Tools",
    shortName: "beta-tools",
    version: "0.9.2",
    description: "Release automation for the beta pipeline.",
    sourceKind: "github",
    sourceReference: "https://github.com/example/toolbox",
    skills: [{ name: "beta-release", description: "Cuts one beta release." }],
    variables: [],
    mcp: { type: "remote", container: "none" },
};
const linkedTools: PluginInstallDialogCandidate = {
    id: "token-linked",
    displayName: "Linked Tools",
    shortName: "linked-tools",
    version: "2.0.0",
    description: "A skills-only package downloaded from a ZIP URL.",
    sourceKind: "zip_url",
    sourceReference: "https://example.com/linked-tools.zip",
    skills: [{ name: "linked-lint", description: "Lints linked projects." }],
    variables: [],
};
const imageOptions = [
    { value: "img-1", label: "daycare-full" },
    { value: "img-2", label: "daycare-minimal" },
];
function log(message: string) {
    console.info(`[blueprint] PluginInstallDialog: ${message}`);
}
function frame(children: React.ReactNode, height = 560) {
    return (
        <div
            style={{ display: "flex", position: "relative", width: "720px", height: `${height}px` }}
        >
            {children}
        </div>
    );
}
export function PluginInstallDialogPage() {
    const [sourceKind, setSourceKind] = useState<PluginInstallDialogSourceKind>("upload");
    const [url, setUrl] = useState("");
    const [values, setValues] = useState<Readonly<Record<string, string>>>({});
    const [imageId, setImageId] = useState<string>();
    return (
        <ComponentPage
            number="C-075"
            summary="External plugin installation flow in a 480px modal: source choice (upload / ZIP URL / GitHub), live verified-preparation progress, a keyboard-navigable candidate listbox, and the verified pre-install preview with masked secret variables and container-image selection."
            title="PluginInstallDialog"
        >
            <Specimen
                detail="three radio source cards · upload hint · Prepare disabled until a source is chosen"
                label="Source choice — empty default"
                number="01"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onArchiveSelect={(file) => log(`archive ${file.name}`)}
                        onClose={() => log("close")}
                        onPrepare={() => log("prepare")}
                        onSourceKindChange={setSourceKind}
                        onUrlChange={setUrl}
                        sourceKind={sourceKind}
                        step={{ step: "source" }}
                        url={url}
                    />,
                    420,
                )}
                <DimensionRule label="modal medium 480px" />
            </Specimen>

            <Specimen
                detail="selected archive row with mono byte size and a clear action"
                label="Upload selected"
                number="02"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        archive={{ name: "project-search.zip", size: 1_482_752 }}
                        onArchiveClear={() => log("clear")}
                        onClose={() => log("close")}
                        onPrepare={() => log("prepare")}
                        sourceKind="upload"
                        step={{ step: "source" }}
                        url=""
                    />,
                    420,
                )}
            </Specimen>

            <Specimen
                detail="local https validation error under the URL field"
                label="URL validation error"
                number="03"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onClose={() => log("close")}
                        onPrepare={() => log("prepare")}
                        onUrlChange={setUrl}
                        sourceKind="zip_url"
                        step={{ step: "source" }}
                        url="http://example.com/plugin.zip"
                        urlError="Plugin sources must use https://."
                    />,
                    420,
                )}
            </Specimen>

            <Specimen
                detail="deterministic byte progress bar · cancel is the only footer action"
                label="Downloading"
                number="04"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onCancelPrepare={() => log("cancel prepare")}
                        onClose={() => log("close")}
                        sourceKind="zip_url"
                        step={{
                            step: "preparing",
                            progress: {
                                stage: "downloading",
                                detail: "Downloading plugin archive",
                                receivedBytes: 3_244_032,
                                totalBytes: 8_388_608,
                            },
                        }}
                        url="https://example.com/plugin.zip"
                    />,
                    380,
                )}
            </Specimen>

            <Specimen
                detail="verification stage without byte totals renders the dimmed full-width fill"
                label="Verifying"
                number="05"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onCancelPrepare={() => log("cancel prepare")}
                        onClose={() => log("close")}
                        sourceKind="upload"
                        step={{
                            step: "preparing",
                            progress: {
                                stage: "verifying",
                                detail: "Verifying package structure",
                            },
                        }}
                        url=""
                    />,
                    380,
                )}
            </Specimen>

            <Specimen
                detail="listbox rows with roving tab index · Enter or click chooses a candidate"
                label="Multiple GitHub candidates"
                number="06"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onCandidateChoose={(id) => log(`choose ${id}`)}
                        onClose={() => log("close")}
                        sourceKind="github"
                        step={{ step: "choose", candidates: [alphaTools, betaTools] }}
                        url="https://github.com/example/toolbox"
                    />,
                    460,
                )}
            </Specimen>

            <Specimen
                detail="verified preview: thumb slot, source badge, skills, MCP badges, no configuration note"
                label="Single prepared plugin"
                number="07"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onClose={() => log("close")}
                        onInstall={() => log("install")}
                        sourceKind="zip_url"
                        step={{ step: "configure", candidate: linkedTools, candidateCount: 1 }}
                        url="https://example.com/linked-tools.zip"
                    />,
                    520,
                )}
            </Specimen>

            <Specimen
                detail="masked secret, text variable, container-image select, Back to candidate list"
                label="Variables and container configuration"
                number="08"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        containerImageOptions={imageOptions}
                        draftContainerImageId={imageId}
                        draftValues={values}
                        onCandidateListReturn={() => log("back")}
                        onClose={() => log("close")}
                        onDraftContainerImageChange={setImageId}
                        onDraftValueChange={(key, value) =>
                            setValues((current) => ({ ...current, [key]: value }))
                        }
                        onInstall={() => log("install")}
                        sourceKind="github"
                        step={{ step: "configure", candidate: alphaTools, candidateCount: 2 }}
                        url="https://github.com/example/toolbox"
                    />,
                    880,
                )}
            </Specimen>

            <Specimen
                detail="in-flight durable install: disabled fields and progress label on the submit action"
                label="Installing"
                number="09"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        containerImageOptions={imageOptions}
                        draftContainerImageId="img-1"
                        draftValues={{ ALPHA_API_TOKEN: "secret", ALPHA_REGION: "us-west" }}
                        onClose={() => log("close")}
                        sourceKind="github"
                        step={{ step: "installing", candidate: alphaTools }}
                        url="https://github.com/example/toolbox"
                    />,
                    880,
                )}
            </Specimen>

            <Specimen
                detail="terminal preparation failure with Retry"
                label="Preparation failure"
                number="10"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        onClose={() => log("close")}
                        onRetry={() => log("retry")}
                        sourceKind="zip_url"
                        step={{
                            step: "failed",
                            error: "A plugin ZIP must contain exactly one plugin.json",
                            canRetry: true,
                        }}
                        url="https://example.com/plugin.zip"
                    />,
                    360,
                )}
            </Specimen>

            <Specimen
                detail="expired prepared token returns to the source step with guidance"
                label="Token expiration"
                number="11"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        notice="The prepared package expired or was already used. Prepare the plugin again to install it."
                        onClose={() => log("close")}
                        onPrepare={() => log("prepare")}
                        onUrlChange={setUrl}
                        sourceKind="zip_url"
                        step={{ step: "source" }}
                        url="https://example.com/plugin.zip"
                    />,
                    480,
                )}
            </Specimen>

            <Specimen
                detail="terminal install failure shown on the configure step for retry"
                label="Install conflict"
                number="12"
                stage="app"
            >
                {frame(
                    <PluginInstallDialog
                        installError="This remote plugin has changed since its installed snapshot; update it before adding another installation"
                        onClose={() => log("close")}
                        onInstall={() => log("install")}
                        sourceKind="zip_url"
                        step={{ step: "configure", candidate: linkedTools, candidateCount: 1 }}
                        url="https://example.com/linked-tools.zip"
                    />,
                    620,
                )}
            </Specimen>
        </ComponentPage>
    );
}
