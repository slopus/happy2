import { useState, type ReactNode } from "react";
import { PluginCatalogPanel, type PluginCatalogEntry } from "../../src/PluginCatalogPanel";
import { GRANULAR_PERMISSION_SECTIONS } from "../../src/PluginCatalogPanel.fixtures";
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
    installations: [
        {
            id: "ins-3",
            version: "2.0.0",
            status: "ready",
            updateCheck: { status: "checked", updateAvailable: true, remoteVersion: "2.1.0" },
        },
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
    installations: [
        {
            id: "ins-9",
            version: "2.0.0",
            status: "ready",
            updateCheck: { status: "checked", updateAvailable: true, remoteVersion: "2.1.0" },
        },
    ],
    pluginId: "plugin-linked",
    sourceLabel: "ZIP URL",
    installable: false,
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
    installations: [
        {
            id: "ins-10",
            version: "1.0.0",
            status: "starting",
            updateCheck: {
                status: "checking",
                detail: "Downloading the current remote plugin package.",
            },
        },
    ],
    pluginId: "plugin-repo",
    sourceLabel: "GitHub",
    installable: false,
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
    installations: [
        {
            id: "ins-current",
            version: "1.2.0",
            status: "ready",
            updateCheck: { status: "checked", updateAvailable: false, remoteVersion: "1.2.0" },
        },
    ],
    pluginId: "plugin-current",
    sourceLabel: "GitHub",
    installable: false,
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
    installations: [{ id: "ins-11", version: "1.0.0", status: "ready", uninstalling: true }],
    pluginId: "plugin-uploaded",
    sourceLabel: "Uploaded ZIP",
    installable: false,
};
const brokenTools: PluginCatalogEntry = {
    id: "system:plugin-broken",
    shortName: "broken-tools",
    displayName: "Broken Tools",
    description: "An external package whose installed manifest is quarantined and unloaded.",
    version: "0.3.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [
        {
            id: "ins-12",
            version: "0.3.0",
            status: "broken_configuration",
            detail: "The installed manifest declares a permission the server no longer supports.",
            updateCheck: {
                status: "failed",
                detail: "The installed plugin path no longer exists remotely",
            },
            diagnosticsOpen: true,
            diagnostics: {
                status: "broken_configuration",
                detail: "The installed manifest declares a permission the server no longer supports.",
                failure:
                    "Quarantined: unknown host permission 'legacy:admin' in installed manifest.",
                output: "[boot] loading manifest\n[boot] validating declared permissions\n[error] unknown permission legacy:admin\n[boot] installation quarantined and unloaded",
                updatedLabel: "Updated 3m ago",
            },
        },
    ],
    pluginId: "plugin-broken",
    sourceLabel: "GitHub",
    installable: false,
};
const updatingTools: PluginCatalogEntry = {
    id: "system:plugin-updating",
    shortName: "updating-tools",
    displayName: "Updating Tools",
    description: "A GitHub package committing an update over its own SSE stream.",
    version: "1.0.0",
    skills: [],
    variables: [],
    installed: true,
    installations: [
        {
            id: "ins-13",
            version: "1.0.0",
            status: "ready",
            updateCheck: { status: "checked", updateAvailable: true, remoteVersion: "1.4.0" },
            updating: true,
            updateProgress: "Committing the updated plugin package.",
        },
    ],
    pluginId: "plugin-updating",
    sourceLabel: "GitHub",
    installable: false,
};
// A worst-case package that declares every granular host capability across all
// nine sections; its install and permission dialogs stress the long checklist.
const orchestrator: PluginCatalogEntry = {
    shortName: "orchestrator",
    displayName: "Workspace Orchestrator",
    description:
        "Coordinates chats, messages, search, workspace files, environments, and other plugins on the user's behalf.",
    version: "3.0.0",
    skills: [],
    mcp: { type: "stdio", container: "bundled" },
    variables: [],
    apiPermissions: GRANULAR_PERMISSION_SECTIONS,
    installed: true,
    installations: [
        {
            id: "ins-orch",
            version: "3.0.0",
            status: "ready",
            grantedPermissions: [
                "messages:history",
                "messages:read",
                "search:messages",
                "commands:run",
                "workspace:read",
            ],
        },
    ],
    pluginId: "plugin-orchestrator",
};
// A pre-selected subset spanning read-only and mutation classes in several
// sections, used to show the checked state of the granular checklist.
const orchestratorSelected: readonly string[] = [
    "chats:update",
    "messages:history",
    "messages:read",
    "search:messages",
    "commands:run",
    "workspace:read",
    "workspace:write",
    "plugins:request-install",
];
const imageOptions = [
    { value: "img-1", label: "daycare-full" },
    { value: "img-2", label: "daycare-minimal" },
];
function log(message: string) {
    console.info(`[blueprint] PluginCatalogPanel: ${message}`);
}
/**
 * A bounded flex frame for specimens that host an open ModalOverlay. ModalOverlay
 * is `position: fixed`; `transform: translateZ(0)` establishes a fixed-position
 * containing block and `overflow: hidden` clips the scrim, so each dialog stays
 * inside its own 720px specimen instead of covering the whole workbench.
 */
function ModalSpecimenFrame(props: { width: number; height: number; children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
            }}
        >
            {props.children}
        </div>
    );
}
export function PluginCatalogPanelPage() {
    const [installOpen, setInstallOpen] = useState<string>();
    const [values, setValues] = useState<Readonly<Record<string, string>>>({});
    const [imageId, setImageId] = useState<string>();
    const [granularInstall, setGranularInstall] = useState<readonly string[]>([
        "messages:history",
        "search:messages",
        "commands:run",
    ]);
    const [granularEdit, setGranularEdit] = useState<readonly string[]>(orchestratorSelected);
    const toggle = (current: readonly string[], id: string, checked: boolean): readonly string[] =>
        checked
            ? current.includes(id)
                ? current
                : [...current, id]
            : current.filter((value) => value !== id);
    return (
        <ComponentPage
            number="C-066"
            summary="Administrator plugin catalog: cards with a 40px icon slot, mono version, capability badges, an accent mono name and description for every Agent Skill the package provides, a per-installation management block (health, its own update check/Update, Retry, Logs, and Uninstall), and a controlled install dialog collecting declared variables (masked secrets) plus an optional ready container-image selection."
            title="PluginCatalogPanel"
        >
            <Specimen
                detail="card 16px padding · icon 40px radius 8 · name 14/600 · mono version 12px · accent mono skill name + description rows · per-installation blocks with health, update check, and actions"
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
                        onInstallationRetry={(id) => log(`retry ${id}`)}
                        onInstallationUpdate={(id) => log(`update ${id}`)}
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
                <ModalSpecimenFrame height={560} width={720}>
                    <PluginCatalogPanel
                        containerImageOptions={imageOptions}
                        draftContainerImageId="img-1"
                        draftValues={{ RUNNER_TOKEN: "secret-value" }}
                        installOpen="task-runner"
                        onCloseInstall={() => log("close")}
                        onSubmitInstall={() => log("submit")}
                        plugins={[runner]}
                    />
                </ModalSpecimenFrame>
            </Specimen>

            <Specimen
                detail="720×480 Electron minimum · all nine sections and 25 capabilities in one scrollable Modal body: fixed header/footer, section titles in server order, read-only before mutations, several capabilities pre-selected"
                label="Install dialog — granular permissions at the minimum window"
                number="02b"
                stage="app"
            >
                <ModalSpecimenFrame height={480} width={720}>
                    <PluginCatalogPanel
                        draftPermissions={granularInstall}
                        installOpen="orchestrator"
                        onCloseInstall={() => log("close granular install")}
                        onDraftPermissionToggle={(id, checked) =>
                            setGranularInstall((current) => toggle(current, id, checked))
                        }
                        onSubmitInstall={() => log("submit granular install")}
                        plugins={[orchestrator]}
                    />
                </ModalSpecimenFrame>
                <DimensionRule label="720×480 · every permission reachable by scrolling the Modal body" />
            </Specimen>

            <Specimen
                detail="720×480 · editing an installation's grant set: the granular checklist pre-checks the current grant, high-risk command and workspace descriptions stay readable, and Save commits the exact selected set"
                label="Permissions dialog — granular grant editing"
                number="02c"
                stage="app"
            >
                <ModalSpecimenFrame height={480} width={720}>
                    <PluginCatalogPanel
                        draftPermissions={granularEdit}
                        onClosePermissions={() => log("close granular permissions")}
                        onDraftPermissionToggle={(id, checked) =>
                            setGranularEdit((current) => toggle(current, id, checked))
                        }
                        onOpenPermissions={() => undefined}
                        onSubmitPermissions={() => log("save granular permissions")}
                        permissionsOpen="ins-orch"
                        plugins={[orchestrator]}
                    />
                </ModalSpecimenFrame>
                <DimensionRule label="720×480 · fixed header/footer, scrollable grant list" />
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
                detail="external rows: per-installation update check (available/checking/up to date/failed), Update, Check again, streaming update progress, in-flight uninstall, and the header Install plugin entry point"
                label="External plugins with per-installation update status"
                number="05"
                stage="app"
            >
                <div style={{ display: "flex", width: "880px" }}>
                    <PluginCatalogPanel
                        onInstallationCheckUpdate={(id) => log(`check ${id}`)}
                        onInstallationDiagnosticsToggle={(id, open) => log(`logs ${id} ${open}`)}
                        onInstallationRetry={(id) => log(`retry ${id}`)}
                        onInstallationUninstall={(id) => log(`uninstall ${id}`)}
                        onInstallationUpdate={(id) => log(`update ${id}`)}
                        onOpenExternalInstall={() => log("open external install")}
                        plugins={[
                            linkedTools,
                            currentTools,
                            repoTools,
                            updatingTools,
                            uploadedTools,
                        ]}
                        subtitle="Bundled packages plus plugins installed from uploads, ZIP URLs, and GitHub."
                    />
                </div>
            </Specimen>

            <Specimen
                detail="a quarantined installation stays visible and unloaded, explains its failure, exposes an inert scrollable log viewer, and offers Retry alongside a failed update check"
                label="Broken installation — diagnostics and recovery"
                number="05b"
                stage="app"
            >
                <div style={{ display: "flex", width: "880px" }}>
                    <PluginCatalogPanel
                        onInstallationCheckUpdate={(id) => log(`check ${id}`)}
                        onInstallationDiagnosticsToggle={(id, open) => log(`logs ${id} ${open}`)}
                        onInstallationRetry={(id) => log(`retry ${id}`)}
                        onInstallationUninstall={(id) => log(`uninstall ${id}`)}
                        onInstallationUpdate={(id) => log(`update ${id}`)}
                        plugins={[brokenTools]}
                        subtitle="A broken installation remains legible with a recovery path."
                    />
                </div>
            </Specimen>

            <Specimen
                detail="C-068 hosted over the panel scrim: per-installation blast radius names the exact installation version and whether it is the plugin's last installation"
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
                        onInstallationUninstall={(id) => log(`uninstall ${id}`)}
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
                            installationVersion="2.0.0"
                            lastInstallation
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
