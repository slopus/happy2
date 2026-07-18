import type { AgentImagesStore } from "happy2-state";
import { createMemo, createSignal, Show } from "solid-js";
import { AgentImageDetail } from "../../AgentImageDetail";
import { AgentImagePanel, type AgentImageItem } from "../../AgentImagePanel";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { StoreSurface } from "../../StoreSurface";

export interface AgentImagesPageProps {
    store: AgentImagesStore;
    query?: string;
}

/** Complete agent-image administration page backed by one AgentImagesStore. */
export function AgentImagesPage(props: AgentImagesPageProps) {
    const [createOpen, setCreateOpen] = createSignal(false);
    const [draftName, setDraftName] = createSignal("");
    const [draftDockerfile, setDraftDockerfile] = createSignal("");
    const [detailOpen, setDetailOpen] = createSignal(false);
    const [dismissedError, setDismissedError] = createSignal<unknown>();
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const images = createMemo(() => {
                    const state = snapshot().images;
                    return state.type === "ready" ? state.value : [];
                });
                const needle = createMemo(() => props.query?.trim().toLowerCase() ?? "");
                const items = createMemo<AgentImageItem[]>(() =>
                    images()
                        .filter(
                            (image) =>
                                !needle() ||
                                image.name.toLowerCase().includes(needle()) ||
                                image.status.includes(needle()),
                        )
                        .map((image) => ({
                            id: image.id,
                            name: image.name,
                            status: image.status,
                            builtin: image.builtinKey !== undefined,
                            isDefault: image.id === snapshot().defaultImageId,
                            progress: image.buildProgress,
                            lastLogLine: image.lastBuildLogLine,
                            updatedLabel: formatDate(image.updatedAt),
                            error: image.lastError,
                        })),
                );
                const selected = createMemo(() =>
                    images().find((image) => image.id === snapshot().selectedImageId),
                );
                const detailState = createMemo(() => {
                    const selectedImageId = snapshot().selectedImageId;
                    return selectedImageId ? snapshot().details[selectedImageId] : undefined;
                });
                const detail = createMemo(() => {
                    const state = detailState();
                    return state?.type === "ready" ? state.value : undefined;
                });
                const detailError = createMemo(() => {
                    const state = detailState();
                    return state?.type === "error" ? state.error.message : undefined;
                });
                const actionError = createMemo(() =>
                    snapshot().actionError === dismissedError()
                        ? undefined
                        : snapshot().actionError?.message,
                );
                const busyImageIds = createMemo(() => {
                    const pending = snapshot().pending;
                    return [
                        ...pending.buildImageIds,
                        ...(pending.defaultImageId ? [pending.defaultImageId] : []),
                    ];
                });
                const imagesError = createMemo(() => {
                    const state = snapshot().images;
                    return state.type === "error" ? state.error.message : undefined;
                });
                return (
                    <>
                        <AgentImagePanel
                            actionError={actionError()}
                            busyImageIds={busyImageIds()}
                            createError={actionError()}
                            createOpen={createOpen()}
                            creating={snapshot().pending.creating}
                            draftDockerfile={draftDockerfile()}
                            draftName={draftName()}
                            error={imagesError()}
                            images={items()}
                            loading={
                                snapshot().images.type === "loading" ||
                                snapshot().images.type === "unloaded"
                            }
                            onBuildImage={store.imageBuild}
                            onCloseCreate={() => setCreateOpen(false)}
                            onDismissActionError={() => setDismissedError(snapshot().actionError)}
                            onDraftDockerfileChange={setDraftDockerfile}
                            onDraftNameChange={setDraftName}
                            onOpenCreate={() => {
                                setDraftName("");
                                setDraftDockerfile("");
                                setCreateOpen(true);
                            }}
                            onSelectImage={(id) => {
                                setDetailOpen(true);
                                store.imageSelect(id);
                            }}
                            onSetDefaultImage={store.defaultImageSet}
                            onSubmitCreate={() => {
                                const name = draftName().trim();
                                const dockerfile = draftDockerfile();
                                if (!name || !dockerfile.trim()) return;
                                store.imageCreate(name, dockerfile);
                                setCreateOpen(false);
                            }}
                            subtitle="Immutable images every server-owned agent runs inside."
                        />
                        <Show when={detailOpen() && snapshot().selectedImageId}>
                            <ModalOverlay onDismiss={() => setDetailOpen(false)}>
                                <Modal
                                    icon="spark"
                                    onClose={() => setDetailOpen(false)}
                                    size="large"
                                    title={detail()?.name ?? selected()?.name ?? "Agent image"}
                                >
                                    <AgentImageDetail
                                        buildLog={detail()?.buildLog ?? ""}
                                        buildLogTruncated={detail()?.buildLogTruncated}
                                        builtin={
                                            (detail()?.builtinKey ?? selected()?.builtinKey) !==
                                            undefined
                                        }
                                        dockerfile={detail()?.dockerfile ?? ""}
                                        error={detailError()}
                                        isDefault={
                                            snapshot().selectedImageId === snapshot().defaultImageId
                                        }
                                        lastError={detail()?.lastError ?? selected()?.lastError}
                                        loading={detailState()?.type === "loading"}
                                        progress={
                                            detail()?.buildProgress ?? selected()?.buildProgress
                                        }
                                        status={detail()?.status ?? selected()?.status ?? "pending"}
                                    />
                                </Modal>
                            </ModalOverlay>
                        </Show>
                    </>
                );
            }}
        </StoreSurface>
    );
}

function formatDate(value?: string): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
    );
}
