import { useState } from "react";
import type { AgentImagesStore } from "happy2-state";
import { AgentImageDetail } from "../../AgentImageDetail";
import { AgentImagePanel } from "../../AgentImagePanel";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { StoreSurface } from "../../StoreSurface";
export interface AgentImagesPageProps {
    store: AgentImagesStore;
    query?: string;
    /** Allows image creation, builds, and default-image changes. */
    canManage?: boolean;
}
/** Complete agent-image administration page backed by one AgentImagesStore. */
export function AgentImagesPage(props: AgentImagesPageProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [draftName, setDraftName] = useState("");
    const [draftDockerfile, setDraftDockerfile] = useState("");
    const [detailOpen, setDetailOpen] = useState(false);
    const [dismissedError, setDismissedError] = useState<unknown>();
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const images = (() => {
                    const state = snapshot.images;
                    return state.type === "ready" ? state.value : [];
                })();
                const needle = props.query?.trim().toLowerCase() ?? "";
                const items = images
                    .filter(
                        (image) =>
                            !needle ||
                            image.name.toLowerCase().includes(needle) ||
                            image.status.includes(needle),
                    )
                    .map((image) => ({
                        id: image.id,
                        name: image.name,
                        status: image.status,
                        builtin: image.builtinKey !== undefined,
                        isDefault: image.id === snapshot.defaultImageId,
                        progress: image.buildProgress,
                        lastLogLine: image.lastBuildLogLine,
                        updatedLabel: formatDate(image.updatedAt),
                        error: image.lastError,
                    }));
                const selected = images.find((image) => image.id === snapshot.selectedImageId);
                const detailState = (() => {
                    const selectedImageId = snapshot.selectedImageId;
                    return selectedImageId ? snapshot.details[selectedImageId] : undefined;
                })();
                const detail = (() => {
                    const state = detailState;
                    return state?.type === "ready" ? state.value : undefined;
                })();
                const detailError = (() => {
                    const state = detailState;
                    return state?.type === "error" ? state.error.message : undefined;
                })();
                const actionError =
                    snapshot.actionError === dismissedError
                        ? undefined
                        : snapshot.actionError?.message;
                const busyImageIds = (() => {
                    const pending = snapshot.pending;
                    return [
                        ...pending.buildImageIds,
                        ...(pending.defaultImageId ? [pending.defaultImageId] : []),
                    ];
                })();
                const imagesError = (() => {
                    const state = snapshot.images;
                    return state.type === "error" ? state.error.message : undefined;
                })();
                return (
                    <>
                        <AgentImagePanel
                            actionError={actionError}
                            busyImageIds={busyImageIds}
                            createError={actionError}
                            createOpen={createOpen}
                            creating={snapshot.pending.creating}
                            draftDockerfile={draftDockerfile}
                            draftName={draftName}
                            error={imagesError}
                            images={items}
                            loading={
                                snapshot.images.type === "loading" ||
                                snapshot.images.type === "unloaded"
                            }
                            onBuildImage={props.canManage === false ? undefined : store.imageBuild}
                            onCloseCreate={() => setCreateOpen(false)}
                            onDismissActionError={() => setDismissedError(snapshot.actionError)}
                            onDraftDockerfileChange={setDraftDockerfile}
                            onDraftNameChange={setDraftName}
                            onOpenCreate={
                                props.canManage === false
                                    ? undefined
                                    : () => {
                                          setDraftName("");
                                          setDraftDockerfile("");
                                          setCreateOpen(true);
                                      }
                            }
                            onSelectImage={(id) => {
                                setDetailOpen(true);
                                store.imageSelect(id);
                            }}
                            onSetDefaultImage={
                                props.canManage === false ? undefined : store.defaultImageSet
                            }
                            onSubmitCreate={() => {
                                const name = draftName.trim();
                                const dockerfile = draftDockerfile;
                                if (!name || !dockerfile.trim()) return;
                                store.imageCreate(name, dockerfile);
                                setCreateOpen(false);
                            }}
                            subtitle="Immutable images every server-owned agent runs inside."
                        />
                        {detailOpen && snapshot.selectedImageId ? (
                            <ModalOverlay onDismiss={() => setDetailOpen(false)}>
                                <Modal
                                    icon="spark"
                                    onClose={() => setDetailOpen(false)}
                                    size="large"
                                    title={detail?.name ?? selected?.name ?? "Agent image"}
                                >
                                    <AgentImageDetail
                                        buildLog={detail?.buildLog ?? ""}
                                        buildLogTruncated={detail?.buildLogTruncated}
                                        builtin={
                                            (detail?.builtinKey ?? selected?.builtinKey) !==
                                            undefined
                                        }
                                        dockerfile={detail?.dockerfile ?? ""}
                                        error={detailError}
                                        isDefault={
                                            snapshot.selectedImageId === snapshot.defaultImageId
                                        }
                                        lastError={detail?.lastError ?? selected?.lastError}
                                        loading={detailState?.type === "loading"}
                                        progress={detail?.buildProgress ?? selected?.buildProgress}
                                        status={detail?.status ?? selected?.status ?? "pending"}
                                    />
                                </Modal>
                            </ModalOverlay>
                        ) : null}
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
