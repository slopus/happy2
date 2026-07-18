import { useState } from "react";
import type { AgentImagesStore, PluginCatalogItem, PluginsStore } from "happy2-state";
import { PluginCatalogPanel, type PluginCatalogEntry } from "../../PluginCatalogPanel";
import { StoreSurface } from "../../StoreSurface";
export interface PluginsPageProps {
    store: PluginsStore;
    /** Materialized on demand for stdio manifests that require an image selection. */
    agentImagesStore: () => AgentImagesStore;
    /** Display-only icon URL per catalog short name, resolved by the consumer. */
    iconUrl?: (shortName: string) => string | undefined;
    query?: string;
}
/** Complete plugin catalog install page backed by PluginsStore. */
export function PluginsPage(props: PluginsPageProps) {
    const [dismissedError, setDismissedError] = useState<unknown>();
    const [installOpen, setInstallOpen] = useState<string>();
    const [draftValues, setDraftValues] = useState<Readonly<Record<string, string>>>({});
    const [draftContainerImageId, setDraftContainerImageId] = useState<string>();
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const items = snapshot.catalog.type === "ready" ? snapshot.catalog.value : [];
                const needle = props.query?.trim().toLowerCase() ?? "";
                const filtered = items.filter(
                    (item) =>
                        !needle ||
                        item.displayName.toLowerCase().includes(needle) ||
                        item.shortName.toLowerCase().includes(needle) ||
                        item.description.toLowerCase().includes(needle),
                );
                const plugins = filtered.map((item) => entryProject(item, props.iconUrl));
                const selectionNeeded = filtered.some(
                    (item) => item.mcp?.container === "selection_required",
                );
                const actionError =
                    snapshot.actionError === dismissedError
                        ? undefined
                        : snapshot.actionError?.message;
                const catalogError =
                    snapshot.catalog.type === "error" ? snapshot.catalog.error.message : undefined;
                const openItem = filtered.find((item) => item.shortName === installOpen);
                const panel = (imageOptions: readonly { value: string; label: string }[]) => (
                    <PluginCatalogPanel
                        actionError={actionError}
                        busyShortNames={snapshot.installing}
                        containerImageOptions={imageOptions}
                        draftContainerImageId={draftContainerImageId}
                        draftValues={draftValues}
                        error={catalogError}
                        installOpen={installOpen}
                        loading={
                            snapshot.catalog.type === "loading" ||
                            snapshot.catalog.type === "unloaded"
                        }
                        onCloseInstall={() => setInstallOpen(undefined)}
                        onDismissActionError={() => setDismissedError(snapshot.actionError)}
                        onDraftContainerImageChange={setDraftContainerImageId}
                        onDraftValueChange={(key, value) =>
                            setDraftValues((current) => ({ ...current, [key]: value }))
                        }
                        onOpenInstall={(shortName) => {
                            setDraftValues({});
                            setDraftContainerImageId(undefined);
                            setInstallOpen(shortName);
                        }}
                        onSubmitInstall={() => {
                            if (!openItem) return;
                            store.pluginInstall(
                                openItem.shortName,
                                draftValues,
                                openItem.mcp?.container === "selection_required"
                                    ? draftContainerImageId
                                    : undefined,
                            );
                            setInstallOpen(undefined);
                        }}
                        plugins={plugins}
                        subtitle="Packages of Agent Skills and MCP servers bundled with the server."
                    />
                );
                if (!selectionNeeded) return panel([]);
                return (
                    <StoreSurface store={props.agentImagesStore()}>
                        {(images) => {
                            const ready = images.images.type === "ready" ? images.images.value : [];
                            return panel(
                                ready
                                    .filter((image) => image.status === "ready")
                                    .map((image) => ({ value: image.id, label: image.name })),
                            );
                        }}
                    </StoreSurface>
                );
            }}
        </StoreSurface>
    );
}
function entryProject(
    item: PluginCatalogItem,
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
        })),
    };
}
