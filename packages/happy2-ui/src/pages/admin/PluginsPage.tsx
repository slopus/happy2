import { useState } from "react";
import type {
    AgentImagesSnapshot,
    AgentImagesStore,
    PluginCatalogItem,
    PluginDiagnosticsState,
    PluginHostPermission,
    PluginInstallationSummary,
    PluginInstallationUpdateState,
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
    type PluginDiagnosticsView,
    type PluginInstallationItem,
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
    archive: "Uploaded ZIP",
    link: "ZIP URL",
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
    const [uninstallInstallationId, setUninstallInstallationId] = useState<string>();
    const [diagnosticsOpen, setDiagnosticsOpen] = useState<ReadonlySet<string>>(
        () => new Set<string>(),
    );
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
                const context: InstallationContext = {
                    updateChecks: snapshot.updateChecks,
                    updating: snapshot.updating,
                    retrying: snapshot.retrying,
                    uninstalling: snapshot.uninstalling,
                    diagnostics: snapshot.diagnostics,
                    diagnosticsOpen,
                };
                const plugins = [
                    ...filtered.map((item) => catalogEntry(item, context, props.iconUrl)),
                    ...filteredExternal.map((plugin) =>
                        externalEntry(plugin, context, props.systemImageUrl),
                    ),
                ];
                const uninstallTarget = uninstallInstallationId
                    ? uninstallLookup(systemPlugins(snapshot), uninstallInstallationId)
                    : undefined;
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
                const uninstallPending = Boolean(
                    uninstallTarget &&
                    snapshot.uninstalling.includes(uninstallTarget.installation.id),
                );
                const closeUninstall = () => {
                    setDismissedError(snapshot.actionError);
                    setUninstallInstallationId(undefined);
                };
                const diagnosticsToggle = (installationId: string, open: boolean) => {
                    if (open) store.installationDiagnosticsLoad(installationId);
                    setDiagnosticsOpen((current) => {
                        const next = new Set(current);
                        if (open) next.add(installationId);
                        else next.delete(installationId);
                        return next;
                    });
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
                        onInstallationCheckUpdate={(installationId) =>
                            store.installationUpdateCheck(installationId)
                        }
                        onInstallationDiagnosticsToggle={diagnosticsToggle}
                        onInstallationRetry={(installationId) =>
                            store.installationRetry(installationId)
                        }
                        onInstallationUninstall={(installationId) => {
                            setDismissedError(snapshot.actionError);
                            setUninstallInstallationId(installationId);
                        }}
                        onInstallationUpdate={(installationId) =>
                            store.installationUpdate(installationId)
                        }
                        plugins={plugins}
                        permissionsBusyInstallationIds={snapshot.updatingPermissions}
                        permissionsOpen={permissionsOpen}
                        subtitle="Bundled packages plus plugins installed from uploads, ZIP URLs, and GitHub."
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
                            <ModalOverlay onDismiss={uninstallPending ? undefined : closeUninstall}>
                                <PluginUninstallDialog
                                    error={actionError}
                                    installationVersion={uninstallTarget.installation.sourceVersion}
                                    lastInstallation={
                                        uninstallTarget.plugin.installations.length <= 1
                                    }
                                    onCancel={closeUninstall}
                                    onConfirm={() => {
                                        setDismissedError(snapshot.actionError);
                                        store.installationUninstall(
                                            uninstallTarget.installation.id,
                                        );
                                    }}
                                    pending={uninstallPending}
                                    pluginName={uninstallTarget.plugin.displayName}
                                    sourceLabel={
                                        sourceKindLabels[uninstallTarget.plugin.sourceKind]
                                    }
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
        sourceKind:
            candidate.sourceKind === "archive"
                ? "upload"
                : candidate.sourceKind === "link"
                  ? "zip_url"
                  : candidate.sourceKind,
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
/** Finds the plugin and installation targeted by a per-installation uninstall confirmation. */
function uninstallLookup(
    plugins: readonly SystemPluginSummary[],
    installationId: string,
): { plugin: SystemPluginSummary; installation: PluginInstallationSummary } | undefined {
    for (const plugin of plugins)
        for (const installation of plugin.installations)
            if (installation.id === installationId) return { plugin, installation };
    return undefined;
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
function updateBadge(check: PluginUpdateCheckState | undefined): PluginUpdateBadge | undefined {
    if (!check) return undefined;
    if (check.status === "checking") return { status: "checking", detail: check.progress?.detail };
    if (check.status === "failed") return { status: "failed", detail: check.error.message };
    return {
        status: "checked",
        updateAvailable: check.update.updateAvailable,
        remoteVersion: check.update.remote.version,
    };
}
/** The per-installation UI context threaded from the snapshot and local view state. */
interface InstallationContext {
    readonly updateChecks: ReadonlyMap<string, PluginUpdateCheckState>;
    readonly updating: ReadonlyMap<string, PluginInstallationUpdateState>;
    readonly retrying: readonly string[];
    readonly uninstalling: readonly string[];
    readonly diagnostics: ReadonlyMap<string, PluginDiagnosticsState>;
    readonly diagnosticsOpen: ReadonlySet<string>;
}
function diagnosticsView(state: PluginDiagnosticsState | undefined): PluginDiagnosticsView {
    if (!state) return { loading: true };
    if (state.status === "loading") return { loading: true };
    if (state.status === "failed") return { error: state.error.message };
    const diagnostics = state.diagnostics;
    return {
        status: diagnostics.status,
        detail: diagnostics.detail,
        failure: diagnostics.error,
        output: diagnostics.output,
        updatedLabel: diagnosticsUpdatedLabel(diagnostics.updatedAt),
    };
}
/**
 * A concise, timezone-independent "updated" stamp for the diagnostics header,
 * formatted from the durable ISO timestamp in UTC so it is deterministic across
 * machines and test runs. Returns undefined for a missing or unparseable value.
 */
export function diagnosticsUpdatedLabel(updatedAt: string | undefined): string | undefined {
    if (!updatedAt) return undefined;
    const instant = new Date(updatedAt);
    if (Number.isNaN(instant.getTime())) return undefined;
    const iso = instant.toISOString();
    return `Updated ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
function installationItem(
    installation: PluginInstallationSummary,
    context: InstallationContext,
): PluginInstallationItem {
    const update = context.updating.get(installation.id);
    const open = context.diagnosticsOpen.has(installation.id);
    return {
        id: installation.id,
        version: installation.sourceVersion,
        status: installation.status,
        detail: installation.lastError ?? installation.statusDetail,
        grantedPermissions: installation.grantedPermissions,
        updateCheck: updateBadge(context.updateChecks.get(installation.id)),
        updating: update?.status === "updating",
        updateProgress: update?.status === "updating" ? update.progress?.detail : undefined,
        updateError: update?.status === "failed" ? update.error.message : undefined,
        retrying: context.retrying.includes(installation.id),
        uninstalling: context.uninstalling.includes(installation.id),
        diagnosticsOpen: open,
        diagnostics: open ? diagnosticsView(context.diagnostics.get(installation.id)) : undefined,
    };
}
function catalogEntry(
    item: PluginCatalogItem,
    context: InstallationContext,
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
        installations: (item.systemPlugin?.installations ?? []).map((installation) =>
            installationItem(installation, context),
        ),
        pluginId: item.systemPlugin?.id,
        sourceLabel:
            item.systemPlugin && item.systemPlugin.sourceKind !== "builtin"
                ? sourceKindLabels[item.systemPlugin.sourceKind]
                : undefined,
    };
}
function externalEntry(
    plugin: SystemPluginSummary,
    context: InstallationContext,
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
        installations: plugin.installations.map((installation) =>
            installationItem(installation, context),
        ),
        pluginId: plugin.id,
        sourceLabel: sourceKindLabels[plugin.sourceKind],
        installable: false,
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
