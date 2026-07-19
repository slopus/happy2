import { useState } from "react";
import type {
    AgentImagesSnapshot,
    AgentImagesStore,
    PluginCatalogItem,
    PluginHostPermission,
    PluginInstallSnapshot,
    PluginInstallStore,
    PluginsSnapshot,
    PluginsStore,
    PluginUpdateCheckState,
    PreparedPluginSummary,
    SystemPluginSummary,
} from "happy2-state";
import { ModalOverlay } from "../../ModalOverlay";
import {
    PluginCatalogPanel,
    type PluginCatalogEntry,
    type PluginPermissionSection,
    type PluginUpdateBadge,
} from "../../PluginCatalogPanel";
import {
    PluginInstallDialog,
    type PluginInstallDialogCandidate,
    type PluginInstallDialogStep,
} from "../../PluginInstallDialog";
import { PluginUninstallDialog } from "../../PluginUninstallDialog";
import { StoreSurface } from "../../StoreSurface";
export interface PluginsPageProps {
    store: PluginsStore;
    /** The external plugin install flow surface, materialized when the dialog opens. */
    installStore: () => PluginInstallStore;
    /** Materialized on demand for stdio manifests that require an image selection. */
    agentImagesStore: () => AgentImagesStore;
    /** Display-only icon URL per catalog short name, resolved by the consumer. */
    iconUrl?: (shortName: string) => string | undefined;
    /** Display-only icon URL per persisted system plugin ID, resolved by the consumer. */
    systemImageUrl?: (pluginId: string) => string | undefined;
    query?: string;
}
const sourceKindLabels: Record<SystemPluginSummary["sourceKind"], string> = {
    builtin: "Built-in",
    github: "GitHub",
    upload: "Uploaded ZIP",
    zip_url: "ZIP URL",
};
/**
 * Complete plugin management page backed by PluginsStore: the built-in catalog,
 * externally installed system plugins, the external install flow, automatic
 * update checks while this page is visible, and destructive uninstall.
 */
export function PluginsPage(props: PluginsPageProps) {
    const [dismissedError, setDismissedError] = useState<unknown>();
    const [installOpen, setInstallOpen] = useState<string>();
    const [draftValues, setDraftValues] = useState<Readonly<Record<string, string>>>({});
    const [draftContainerImageId, setDraftContainerImageId] = useState<string>();
    const [draftPermissions, setDraftPermissions] = useState<readonly string[]>([]);
    const [permissionsOpen, setPermissionsOpen] = useState<string>();
    const [externalOpen, setExternalOpen] = useState(false);
    const [externalValues, setExternalValues] = useState<Readonly<Record<string, string>>>({});
    const [externalImageId, setExternalImageId] = useState<string>();
    const [externalPermissions, setExternalPermissions] = useState<readonly string[]>([]);
    const [uninstallPluginId, setUninstallPluginId] = useState<string>();
    // Mount/unmount of this page is the visibility boundary for automatic
    // update checks: the ref cleanup stops all background check work the
    // moment the page leaves the screen.
    const watchRef = (node: HTMLDivElement | null) => {
        if (!node) return undefined;
        props.store.getState().updateChecksStart();
        return () => props.store.getState().updateChecksStop();
    };
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const items = snapshot.catalog.type === "ready" ? snapshot.catalog.value : [];
                const external = externalPlugins(snapshot, items);
                const needle = props.query?.trim().toLowerCase() ?? "";
                const filtered = items.filter((item) => catalogMatches(item, needle));
                const filteredExternal = external.filter((plugin) =>
                    externalMatches(plugin, needle),
                );
                const plugins = [
                    ...filtered.map((item) =>
                        catalogEntry(item, snapshot.updateChecks, props.iconUrl),
                    ),
                    ...filteredExternal.map((plugin) =>
                        externalEntry(plugin, snapshot.updateChecks, props.systemImageUrl),
                    ),
                ];
                const uninstallTarget = systemPlugins(snapshot).find(
                    (plugin) => plugin.id === uninstallPluginId,
                );
                const actionError =
                    snapshot.actionError === dismissedError
                        ? undefined
                        : snapshot.actionError?.message;
                const catalogError =
                    snapshot.catalog.type === "error" ? snapshot.catalog.error.message : undefined;
                const openItem = filtered.find((item) => item.shortName === installOpen);
                const permissionsItem = plugins.find((item) =>
                    item.installations.some((installation) => installation.id === permissionsOpen),
                );
                const selectionNeeded = filtered.some(
                    (item) => item.mcp?.container === "selection_required",
                );
                const closeUninstall = () => {
                    setDismissedError(snapshot.actionError);
                    setUninstallPluginId(undefined);
                };
                const panel = (imageOptions: readonly { value: string; label: string }[]) => (
                    <PluginCatalogPanel
                        actionError={uninstallTarget ? undefined : actionError}
                        busyShortNames={snapshot.installing}
                        containerImageOptions={imageOptions}
                        draftContainerImageId={draftContainerImageId}
                        draftPermissions={draftPermissions}
                        draftValues={draftValues}
                        error={catalogError}
                        installOpen={installOpen}
                        loading={
                            snapshot.catalog.type === "loading" ||
                            snapshot.catalog.type === "unloaded"
                        }
                        onCloseInstall={() => setInstallOpen(undefined)}
                        onClosePermissions={() => setPermissionsOpen(undefined)}
                        onDismissActionError={() => setDismissedError(snapshot.actionError)}
                        onDraftContainerImageChange={setDraftContainerImageId}
                        onDraftPermissionToggle={(permissionId, checked) =>
                            setDraftPermissions((current) =>
                                permissionToggle(current, permissionId, checked),
                            )
                        }
                        onDraftValueChange={(key, value) =>
                            setDraftValues((current) => ({ ...current, [key]: value }))
                        }
                        onOpenExternalInstall={() => {
                            props.installStore().getState().flowReset();
                            setExternalValues({});
                            setExternalImageId(undefined);
                            setExternalPermissions([]);
                            setExternalOpen(true);
                        }}
                        onOpenInstall={(shortName) => {
                            setDraftValues({});
                            setDraftContainerImageId(undefined);
                            setDraftPermissions([]);
                            setPermissionsOpen(undefined);
                            setInstallOpen(shortName);
                        }}
                        onOpenPermissions={(installationId) => {
                            const installation = plugins
                                .flatMap((item) => item.installations)
                                .find((candidate) => candidate.id === installationId);
                            setDraftPermissions(installation?.grantedPermissions ?? []);
                            setInstallOpen(undefined);
                            setPermissionsOpen(installationId);
                        }}
                        onSubmitInstall={() => {
                            if (!openItem) return;
                            store.pluginInstall(
                                openItem.shortName,
                                draftValues,
                                grantedFrom(openItem.apiPermissions ?? [], draftPermissions),
                                openItem.mcp?.container === "selection_required"
                                    ? draftContainerImageId
                                    : undefined,
                            );
                            setInstallOpen(undefined);
                        }}
                        onSubmitPermissions={() => {
                            if (!permissionsOpen || !permissionsItem) return;
                            store.pluginPermissionsUpdate(
                                permissionsOpen,
                                grantedFrom(permissionsItem.apiPermissions ?? [], draftPermissions),
                            );
                            setPermissionsOpen(undefined);
                        }}
                        onUninstall={(pluginId) => {
                            setDismissedError(snapshot.actionError);
                            setUninstallPluginId(pluginId);
                        }}
                        plugins={plugins}
                        permissionsBusyInstallationIds={snapshot.updatingPermissions}
                        permissionsOpen={permissionsOpen}
                        subtitle="Bundled packages plus plugins installed from uploads, ZIP URLs, and GitHub."
                        uninstallingPluginIds={snapshot.uninstalling}
                    />
                );
                return (
                    <div
                        ref={watchRef}
                        style={{ display: "flex", flex: "1 1 0%", flexDirection: "column" }}
                    >
                        {selectionNeeded ? (
                            <StoreSurface store={props.agentImagesStore()}>
                                {(images) => panel(readyImageOptions(images.images))}
                            </StoreSurface>
                        ) : (
                            panel([])
                        )}
                        {externalOpen ? (
                            <StoreSurface store={props.installStore()}>
                                {(flow, flowStore) => {
                                    if (flow.step.step === "installed") return null;
                                    const close = () => {
                                        flowStore.flowReset();
                                        setExternalPermissions([]);
                                        setExternalOpen(false);
                                    };
                                    const installing = flow.step.step === "installing";
                                    const dialog = (
                                        imageOptions: readonly {
                                            value: string;
                                            label: string;
                                        }[],
                                    ) => (
                                        <ModalOverlay onDismiss={installing ? undefined : close}>
                                            <PluginInstallDialog
                                                archive={
                                                    flow.archive
                                                        ? {
                                                              name: flow.archive.name,
                                                              size: flow.archive.size,
                                                          }
                                                        : undefined
                                                }
                                                containerImageOptions={imageOptions}
                                                draftContainerImageId={externalImageId}
                                                draftPermissions={externalPermissions}
                                                draftValues={externalValues}
                                                installError={flow.installError?.message}
                                                notice={flow.notice}
                                                onArchiveClear={() => flowStore.archiveClear()}
                                                onArchiveSelect={(file) =>
                                                    flowStore.archiveSelect(file)
                                                }
                                                onCancelPrepare={() => flowStore.prepareCancel()}
                                                onCandidateChoose={(id) => {
                                                    setExternalValues({});
                                                    setExternalImageId(undefined);
                                                    setExternalPermissions([]);
                                                    flowStore.candidateChoose(id);
                                                }}
                                                onCandidateListReturn={() => {
                                                    setExternalValues({});
                                                    setExternalImageId(undefined);
                                                    setExternalPermissions([]);
                                                    flowStore.candidateListReturn();
                                                }}
                                                onClose={close}
                                                onDraftContainerImageChange={setExternalImageId}
                                                onDraftPermissionToggle={(permissionId, checked) =>
                                                    setExternalPermissions((current) =>
                                                        permissionToggle(
                                                            current,
                                                            permissionId,
                                                            checked,
                                                        ),
                                                    )
                                                }
                                                onDraftValueChange={(key, value) =>
                                                    setExternalValues((current) => ({
                                                        ...current,
                                                        [key]: value,
                                                    }))
                                                }
                                                onInstall={() =>
                                                    flowStore.installSubmit(
                                                        externalValues,
                                                        grantedFrom(
                                                            flow.step.step === "configure"
                                                                ? flow.step.candidate.apiPermissions
                                                                : [],
                                                            externalPermissions,
                                                        ),
                                                        externalImageId,
                                                    )
                                                }
                                                onPrepare={() => flowStore.prepareSubmit()}
                                                onRetry={() => flowStore.prepareRetry()}
                                                onSourceKindChange={(kind) =>
                                                    flowStore.sourceKindUpdate(kind)
                                                }
                                                onUrlChange={(value) =>
                                                    flowStore.sourceUrlUpdate(value)
                                                }
                                                sourceKind={flow.sourceKind}
                                                step={dialogStep(flow)}
                                                url={flow.urlDraft}
                                                urlError={flow.urlError}
                                            />
                                        </ModalOverlay>
                                    );
                                    return (
                                        <StoreSurface store={props.agentImagesStore()}>
                                            {(images) => dialog(readyImageOptions(images.images))}
                                        </StoreSurface>
                                    );
                                }}
                            </StoreSurface>
                        ) : null}
                        {uninstallTarget ? (
                            <ModalOverlay
                                onDismiss={
                                    snapshot.uninstalling.includes(uninstallTarget.id)
                                        ? undefined
                                        : closeUninstall
                                }
                            >
                                <PluginUninstallDialog
                                    error={actionError}
                                    installationCount={uninstallTarget.installations.length}
                                    onCancel={closeUninstall}
                                    onConfirm={() => {
                                        setDismissedError(snapshot.actionError);
                                        store.pluginUninstall(uninstallTarget.id);
                                    }}
                                    pending={snapshot.uninstalling.includes(uninstallTarget.id)}
                                    pluginName={uninstallTarget.displayName}
                                    sourceLabel={sourceKindLabels[uninstallTarget.sourceKind]}
                                />
                            </ModalOverlay>
                        ) : null}
                    </div>
                );
            }}
        </StoreSurface>
    );
}
function dialogStep(flow: PluginInstallSnapshot): PluginInstallDialogStep {
    const step = flow.step;
    if (step.step === "preparing") return { step: "preparing", progress: step.progress };
    if (step.step === "choose")
        return {
            step: "choose",
            candidates: step.candidates.map((candidate) => candidateProject(candidate, flow)),
        };
    if (step.step === "configure")
        return {
            step: "configure",
            candidate: candidateProject(step.candidate, flow),
            candidateCount: step.candidates.length,
        };
    if (step.step === "installing")
        return { step: "installing", candidate: candidateProject(step.candidate, flow) };
    if (step.step === "failed")
        return {
            step: "failed",
            error: step.error.message,
            canRetry: flow.source !== undefined,
        };
    return { step: "source" };
}
function candidateProject(
    candidate: PreparedPluginSummary,
    flow: PluginInstallSnapshot,
): PluginInstallDialogCandidate {
    return {
        id: candidate.preparedToken,
        displayName: candidate.displayName,
        shortName: candidate.shortName,
        version: candidate.version,
        description: candidate.description,
        sourceKind: candidate.sourceKind,
        sourceReference: sourceReferenceLabel(candidate, flow),
        skills: candidate.skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
        })),
        variables: candidate.variables.map((variable) => ({
            key: variable.key,
            displayName: variable.displayName,
            description: variable.description,
            kind: variable.kind,
        })),
        apiPermissions: candidate.apiPermissions,
        mcp: candidate.mcp,
        thumbhash: candidate.image.thumbhash,
    };
}
function sourceReferenceLabel(
    candidate: PreparedPluginSummary,
    flow: PluginInstallSnapshot,
): string {
    // The submitted source reads better than the server's normalized reference
    // (GitHub references are encoded); fall back to the wire value.
    if (flow.source?.kind === "github" || flow.source?.kind === "zip_url") return flow.source.url;
    if (flow.source?.kind === "upload") return flow.source.fileName;
    return candidate.sourceReference;
}
function externalPlugins(
    snapshot: PluginsSnapshot,
    catalog: readonly PluginCatalogItem[],
): readonly SystemPluginSummary[] {
    if (snapshot.systemPlugins.type !== "ready") return [];
    const represented = new Set(
        catalog.flatMap((item) => (item.systemPlugin ? [item.systemPlugin.id] : [])),
    );
    return snapshot.systemPlugins.value.filter(
        (plugin) => plugin.sourceKind !== "builtin" && !represented.has(plugin.id),
    );
}
function systemPlugins(snapshot: PluginsSnapshot): readonly SystemPluginSummary[] {
    if (snapshot.systemPlugins.type !== "ready") return [];
    return snapshot.systemPlugins.value;
}
function catalogMatches(item: PluginCatalogItem, needle: string): boolean {
    return (
        !needle ||
        item.displayName.toLowerCase().includes(needle) ||
        item.shortName.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.skills.some(
            (skill) =>
                skill.name.toLowerCase().includes(needle) ||
                skill.description.toLowerCase().includes(needle),
        )
    );
}
function externalMatches(plugin: SystemPluginSummary, needle: string): boolean {
    return (
        !needle ||
        plugin.displayName.toLowerCase().includes(needle) ||
        plugin.shortName.toLowerCase().includes(needle) ||
        plugin.description.toLowerCase().includes(needle)
    );
}
function readyImageOptions(
    images: AgentImagesSnapshot["images"],
): readonly { value: string; label: string }[] {
    const ready = images.type === "ready" ? images.value : [];
    return ready
        .filter((image) => image.status === "ready")
        .map((image) => ({ value: image.id, label: image.name }));
}
function updateBadge(
    pluginId: string | undefined,
    updateChecks: ReadonlyMap<string, PluginUpdateCheckState>,
): PluginUpdateBadge | undefined {
    if (!pluginId) return undefined;
    const check = updateChecks.get(pluginId);
    if (!check) return undefined;
    if (check.status === "checking") return { status: "checking", detail: check.progress?.detail };
    if (check.status === "failed") return { status: "failed", detail: check.error.message };
    return {
        status: "checked",
        updateAvailable: check.update.updateAvailable,
        remoteVersion: check.update.remote.version,
    };
}
function catalogEntry(
    item: PluginCatalogItem,
    updateChecks: ReadonlyMap<string, PluginUpdateCheckState>,
    iconUrl?: (shortName: string) => string | undefined,
): PluginCatalogEntry {
    return {
        shortName: item.shortName,
        displayName: item.displayName,
        description: item.description,
        version: item.version,
        iconUrl: iconUrl?.(item.shortName),
        skills: item.skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
        })),
        mcp: item.mcp,
        variables: item.variables.map((variable) => ({
            key: variable.key,
            displayName: variable.displayName,
            description: variable.description,
            kind: variable.kind,
        })),
        apiPermissions: item.apiPermissions,
        installed: Boolean(item.systemPlugin),
        installedVersion:
            item.systemPlugin && item.systemPlugin.sourceVersion !== item.version
                ? item.systemPlugin.sourceVersion
                : undefined,
        updateAvailable: item.systemPlugin?.updateAvailable ?? false,
        installations: (item.systemPlugin?.installations ?? []).map((installation) => ({
            id: installation.id,
            version: installation.sourceVersion,
            status: installation.status,
            detail: installation.lastError ?? installation.statusDetail,
            grantedPermissions: installation.grantedPermissions,
        })),
        pluginId: item.systemPlugin?.id,
        sourceLabel:
            item.systemPlugin && item.systemPlugin.sourceKind !== "builtin"
                ? sourceKindLabels[item.systemPlugin.sourceKind]
                : undefined,
        updateCheck: updateBadge(item.systemPlugin?.id, updateChecks),
    };
}
function externalEntry(
    plugin: SystemPluginSummary,
    updateChecks: ReadonlyMap<string, PluginUpdateCheckState>,
    systemImageUrl?: (pluginId: string) => string | undefined,
): PluginCatalogEntry {
    return {
        id: `system:${plugin.id}`,
        shortName: plugin.shortName,
        displayName: plugin.displayName,
        description: plugin.description,
        version: plugin.sourceVersion,
        iconUrl: systemImageUrl?.(plugin.id),
        skills: [],
        mcp: plugin.mcp,
        variables: plugin.variables.map((variable) => ({
            key: variable.key,
            displayName: variable.displayName,
            description: variable.description,
            kind: variable.kind,
        })),
        apiPermissions: plugin.apiPermissions,
        installed: true,
        installations: plugin.installations.map((installation) => ({
            id: installation.id,
            version: installation.sourceVersion,
            status: installation.status,
            detail: installation.lastError ?? installation.statusDetail,
            grantedPermissions: installation.grantedPermissions,
        })),
        pluginId: plugin.id,
        sourceLabel: sourceKindLabels[plugin.sourceKind],
        installable: false,
        updateCheck: updateBadge(plugin.id, updateChecks),
    };
}

function permissionToggle(
    current: readonly string[],
    permissionId: string,
    checked: boolean,
): readonly string[] {
    if (checked) return current.includes(permissionId) ? current : [...current, permissionId];
    return current.filter((id) => id !== permissionId);
}

function grantedFrom(
    sections: readonly PluginPermissionSection[],
    selected: readonly string[],
): readonly PluginHostPermission[] {
    const declared = new Set(
        sections.flatMap((section) =>
            [...section.readOnly, ...section.mutations].map((permission) => permission.id),
        ),
    );
    return selected.filter((permission): permission is PluginHostPermission =>
        declared.has(permission as PluginHostPermission),
    );
}
