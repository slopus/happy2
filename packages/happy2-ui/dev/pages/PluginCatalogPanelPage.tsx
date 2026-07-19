import { useState } from "react";
import { PluginCatalogPanel, type PluginCatalogEntry } from "../../src/PluginCatalogPanel";
import { PluginUninstallDialog } from "../../src/PluginUninstallDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
const hello: PluginCatalogEntry = {
    shortName: "hello",
    displayName: "Hello",
    description: "A minimal skills-only example plugin bundled with the server.",
    version: "1.0.0",
    skills: [
        {
            name: "hello",
            description: "Greets the current user and confirms the plugin runtime is reachable.",
        },
    ],
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
        {
            name: "run-task",
            description:
                "Runs one named automation task in the container and streams its output back to the agent.",
        },
        { name: "list-tasks", description: "Lists every automation task the project defines." },
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
const longSkill: PluginCatalogEntry = {
    shortName: "toolkit",
    displayName: "Toolkit",
    description: "Demonstrates the maximum 64-character skill name in a narrow card.",
    version: "1.0.0",
    skills: [
        {
            name: "a".repeat(64),
            description:
                "Runs a lengthy automation workflow that must stay readable beside a very long skill name.",
        },
    ],
    variables: [],
    installed: false,
    installations: [],
};
const linkedTools: PluginCatalogEntry = {
    id: "system:plugin-linked",
    shortName: "linked-tools",
    displayName: "Linked Tools",
    description: "A skills-only package installed from a ZIP URL.",
    version: "2.0.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [{ id: "ins-9", version: "2.0.0", status: "ready" }],
    pluginId: "plugin-linked",
    sourceLabel: "ZIP URL",
    installable: false,
    updateCheck: { status: "checked", updateAvailable: true, remoteVersion: "2.1.0" },
};
const repoTools: PluginCatalogEntry = {
    id: "system:plugin-repo",
    shortName: "repo-tools",
    displayName: "Repo Tools",
    description: "Release helpers installed from a GitHub repository.",
    version: "1.0.0",
    skills: [],
    mcp: { type: "remote", container: "none" },
    variables: [],
    installed: true,
    installations: [{ id: "ins-10", version: "1.0.0", status: "starting" }],
    pluginId: "plugin-repo",
    sourceLabel: "GitHub",
    installable: false,
    updateCheck: {
        status: "checking",
        detail: "Downloading the current remote plugin package.",
    },
};
const currentTools: PluginCatalogEntry = {
    id: "system:plugin-current",
    shortName: "current-tools",
    displayName: "Current Tools",
    description: "A GitHub package whose installed snapshot matches its remote source.",
    version: "1.2.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [{ id: "ins-current", version: "1.2.0", status: "ready" }],
    pluginId: "plugin-current",
    sourceLabel: "GitHub",
    installable: false,
    updateCheck: { status: "checked", updateAvailable: false, remoteVersion: "1.2.0" },
};
const uploadedTools: PluginCatalogEntry = {
    id: "system:plugin-uploaded",
    shortName: "uploaded-tools",
    displayName: "Uploaded Tools",
    description: "A package uploaded as a ZIP; it has no remote update source.",
    version: "1.0.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [{ id: "ins-11", version: "1.0.0", status: "ready" }],
    pluginId: "plugin-uploaded",
    sourceLabel: "Uploaded ZIP",
    installable: false,
};
const brokenTools: PluginCatalogEntry = {
    id: "system:plugin-broken",
    shortName: "broken-tools",
    displayName: "Broken Tools",
    description: "An external package whose remote update check failed.",
    version: "0.3.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [
        {
            id: "ins-12",
            version: "0.3.0",
            status: "failed",
            detail: "Container creation failed.",
        },
    ],
    pluginId: "plugin-broken",
    sourceLabel: "GitHub",
    installable: false,
    updateCheck: {
        status: "failed",
        detail: "The installed plugin path no longer exists remotely",
    },
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
            summary="Administrator plugin catalog: cards with a 40px icon slot, mono version, capability badges, an accent mono name and description for every Agent Skill the package provides, per-installation health badges, and a controlled install dialog collecting declared variables (masked secrets) plus an optional ready container-image selection."
            title="PluginCatalogPanel"
        >
            <Specimen
                detail="card 16px padding · icon 40px radius 8 · name 14/600 · mono version 12px · accent mono skill name + description rows · status badges per installation"
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
                detail="360px card · a maximum 64-character skill name wraps within half the row while the description keeps the rest, clear of the install action"
                label="Skills — long name in a constrained card"
                number="01b"
                stage="app"
            >
                <div style={{ display: "flex", width: "360px", minHeight: "220px" }}>
                    <PluginCatalogPanel
                        onOpenInstall={() => log("open toolkit")}
                        plugins={[longSkill]}
                    />
                </div>
                <DimensionRule label="360px · constrained catalog card" />
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
                detail="external rows: source badge, automatic update-check badges (update available, checking, up to date absent for uploads, failed with title detail), header Install plugin entry point, per-row Uninstall"
                label="External plugins with automatic update status"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", width: "880px" }}>
                    <PluginCatalogPanel
                        onOpenExternalInstall={() => log("open external install")}
                        onUninstall={(pluginId) => log(`uninstall ${pluginId}`)}
                        plugins={[linkedTools, currentTools, repoTools, uploadedTools, brokenTools]}
                        subtitle="Bundled packages plus plugins installed from uploads, ZIP URLs, and GitHub."
                        uninstallingPluginIds={["plugin-uploaded"]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="C-068 hosted over the panel scrim: blast radius named with the installation count"
                label="Uninstall confirmation"
                number="06"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        position: "relative",
                        width: "720px",
                        height: "400px",
                    }}
                >
                    <PluginCatalogPanel
                        onUninstall={(pluginId) => log(`uninstall ${pluginId}`)}
                        plugins={[linkedTools]}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "rgb(0 0 0 / 0.48)",
                        }}
                    >
                        <PluginUninstallDialog
                            installationCount={1}
                            onCancel={() => log("cancel uninstall")}
                            onConfirm={() => log("confirm uninstall")}
                            pluginName="Linked Tools"
                            sourceLabel="ZIP URL"
                        />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="loading and fatal-error affordances replace the list"
                label="Loading / error / empty"
                number="07"
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
