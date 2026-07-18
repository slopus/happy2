import { useState } from "react";
import { PluginCatalogPanel, type PluginCatalogEntry } from "../../src/PluginCatalogPanel";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const hello: PluginCatalogEntry = {
    shortName: "hello",
    displayName: "Hello",
    description: "A minimal skills-only example plugin bundled with the server.",
    version: "1.0.0",
    skills: [{ name: "hello", description: "Says hello." }],
    variables: [],
    installed: true,
    installations: [
        { id: "ins-1", version: "1.0.0", status: "ready" },
        { id: "ins-2", version: "1.0.0", status: "ready" },
    ],
};
const projectSearch: PluginCatalogEntry = {
    shortName: "project-search",
    displayName: "Project Search",
    description: "Searches source code and project documentation over a remote MCP endpoint.",
    version: "2.1.0",
    skills: [],
    mcp: { type: "remote", container: "none" },
    variables: [
        {
            key: "PROJECT_API_TOKEN",
            displayName: "API token",
            description: "Token used by the MCP server.",
            kind: "secret",
        },
        {
            key: "PROJECT_REGION",
            displayName: "Region",
            description: "Region used for project queries.",
            kind: "text",
        },
    ],
    installed: true,
    installedVersion: "2.0.0",
    updateAvailable: true,
    installations: [
        { id: "ins-3", version: "2.0.0", status: "starting" },
        {
            id: "ins-4",
            version: "2.0.0",
            status: "failed",
            detail: "MCP initialize timed out after 20s.",
        },
    ],
};
const runner: PluginCatalogEntry = {
    shortName: "task-runner",
    displayName: "Task Runner",
    description: "Runs project task automation through a stdio MCP in a selected container.",
    version: "0.4.2",
    skills: [
        { name: "run-task", description: "Runs one task." },
        { name: "list-tasks", description: "Lists tasks." },
    ],
    mcp: { type: "stdio", container: "selection_required" },
    variables: [
        {
            key: "RUNNER_TOKEN",
            displayName: "Runner token",
            description: "Token the runner uses against the project API.",
            kind: "secret",
        },
    ],
    installed: false,
    installations: [],
};
const imageOptions = [
    { value: "img-1", label: "daycare-full" },
    { value: "img-2", label: "daycare-minimal" },
];
function log(message: string) {
    console.info(`[blueprint] PluginCatalogPanel: ${message}`);
}
export function PluginCatalogPanelPage() {
    const [installOpen, setInstallOpen] = useState<string>();
    const [values, setValues] = useState<Readonly<Record<string, string>>>({});
    const [imageId, setImageId] = useState<string>();
    return (
        <ComponentPage
            number="C-066"
            summary="Administrator plugin catalog: cards with a 40px icon slot, mono version, capability badges, per-installation health badges, and a controlled install dialog collecting declared variables (masked secrets) plus an optional ready container-image selection."
            title="PluginCatalogPanel"
        >
            <Specimen
                detail="card 16px padding · icon 40px radius 8 · name 14/600 · mono version 12px · status badges per installation"
                label="Catalog — installed, update available, and installable"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", width: "880px", minHeight: "420px" }}>
                    <PluginCatalogPanel
                        busyShortNames={[]}
                        containerImageOptions={imageOptions}
                        draftContainerImageId={imageId}
                        draftValues={values}
                        installOpen={installOpen}
                        onCloseInstall={() => setInstallOpen(undefined)}
                        onDraftContainerImageChange={setImageId}
                        onDraftValueChange={(key, value) =>
                            setValues((current) => ({ ...current, [key]: value }))
                        }
                        onOpenInstall={(shortName) => {
                            setValues({});
                            setImageId(undefined);
                            setInstallOpen(shortName);
                        }}
                        onSubmitInstall={() => {
                            log(`install ${installOpen}`);
                            setInstallOpen(undefined);
                        }}
                        plugins={[hello, projectSearch, runner]}
                        subtitle="Packages of Agent Skills and MCP servers bundled with the server."
                    />
                </div>
                <DimensionRule label="880px · panel fills its container" />
            </Specimen>

            <Specimen
                detail="modal medium 480px · declared variables as stacked FormRows · secret values masked · container image Select"
                label="Install dialog — variables and container selection"
                number="02"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        position: "relative",
                        width: "720px",
                        height: "560px",
                    }}
                >
                    <PluginCatalogPanel
                        containerImageOptions={imageOptions}
                        draftContainerImageId="img-1"
                        draftValues={{ RUNNER_TOKEN: "secret-value" }}
                        installOpen="task-runner"
                        onCloseInstall={() => log("close")}
                        onSubmitInstall={() => log("submit")}
                        plugins={[runner]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="in-flight install: card button disabled with progress label"
                label="Installing"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", width: "720px" }}>
                    <PluginCatalogPanel
                        busyShortNames={["hello"]}
                        onOpenInstall={() => undefined}
                        plugins={[hello]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="dismissible danger banner above the list"
                label="Action error"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", width: "720px" }}>
                    <PluginCatalogPanel
                        actionError="PROJECT_API_TOKEN is required."
                        onDismissActionError={() => log("dismiss")}
                        onOpenInstall={() => undefined}
                        plugins={[projectSearch]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="loading and fatal-error affordances replace the list"
                label="Loading / error / empty"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={{ display: "flex", width: "560px", height: "180px" }}>
                        <PluginCatalogPanel loading plugins={[]} />
                    </div>
                    <div style={{ display: "flex", width: "560px" }}>
                        <PluginCatalogPanel
                            error="You must be a server administrator."
                            plugins={[]}
                        />
                    </div>
                    <div style={{ display: "flex", width: "560px", height: "200px" }}>
                        <PluginCatalogPanel plugins={[]} />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
