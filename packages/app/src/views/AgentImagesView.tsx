import { createMemo, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import type { AgentImageDetails, AgentImageSummary } from "rigged-state";
import { AgentImageDetail, AgentImagePanel, Box, Modal, type AgentImageItem } from "rigged-ui";
import type { AuthSession } from "../components/AuthGate";

export type AgentImagesViewProps = {
    session: AuthSession;
    /** Shared TitleBar/Toolbar search value; filters images by name or status. */
    query?: string;
};

const overlayStyle: JSX.CSSProperties = {
    position: "fixed",
    inset: 0,
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: "24px",
    background: "rgb(0 0 0 / 0.6)",
    "z-index": 40,
};

/**
 * Glue for the reusable rigged-ui AgentImagePanel and AgentImageDetail: it loads
 * agent images, translates them into panel props, and turns the panel's
 * callbacks into authenticated mutations. All visuals live in rigged-ui.
 *
 * Everything stays live without a refresh control: rigged-state refetches
 * `getAgentImages` whenever a realtime "agent-images" sync hint arrives (a build
 * starting, streaming a log line, finishing, or failing, or another admin's
 * change). This view reconciles the list from that result, and — while the
 * detail dialog is open — re-reads the open image so its build log streams live.
 */
export function AgentImagesView(props: AgentImagesViewProps) {
    const [images, setImages] = createSignal<readonly AgentImageSummary[]>();
    const [defaultImageId, setDefaultImageId] = createSignal<string>();
    const [loadError, setLoadError] = createSignal<string>();
    const [actionError, setActionError] = createSignal<string>();
    const [busyIds, setBusyIds] = createSignal<readonly string[]>([]);

    const [createOpen, setCreateOpen] = createSignal(false);
    const [draftName, setDraftName] = createSignal("");
    const [draftDockerfile, setDraftDockerfile] = createSignal("");
    const [creating, setCreating] = createSignal(false);
    const [createError, setCreateError] = createSignal<string>();

    const [detailId, setDetailId] = createSignal<string>();
    const [detail, setDetail] = createSignal<AgentImageDetails>();
    const [detailLoading, setDetailLoading] = createSignal(false);
    const [detailError, setDetailError] = createSignal<string>();

    let disposed = false;
    onCleanup(() => {
        disposed = true;
    });

    // Reconcile from the latest getAgentImages result — the same result a
    // realtime "agent-images" hint refreshes — so the list is always live.
    const applyResult = () => {
        const result = props.session.state.result("getAgentImages");
        if (!result) return;
        setImages(result.images);
        setDefaultImageId(result.defaultImageId);
    };

    async function load() {
        setLoadError(undefined);
        try {
            await props.session.state.execute("getAgentImages");
        } catch (reason) {
            if (!disposed) setLoadError(message(reason));
        }
    }

    onMount(() => {
        const unsubscribe = props.session.state.subscribe("operation", (event) => {
            if (disposed || event.operation !== "getAgentImages") return;
            applyResult();
            // The list refetch is our signal that agent-images changed; while the
            // detail is open, restream the open image's build log alongside it.
            const openId = detailId();
            if (openId) void refreshDetail(openId);
        });
        onCleanup(unsubscribe);
        applyResult();
        void load();
    });

    const upsert = (image: AgentImageSummary) =>
        setImages((current) => {
            const list = current ?? [];
            const index = list.findIndex((item) => item.id === image.id);
            if (index < 0) return [image, ...list];
            const next = list.slice();
            next[index] = image;
            return next;
        });

    async function withBusy(id: string, action: () => Promise<void>) {
        if (busyIds().includes(id)) return;
        setActionError(undefined);
        setBusyIds((current) => [...current, id]);
        try {
            await action();
        } catch (reason) {
            if (!disposed) setActionError(message(reason));
        } finally {
            if (!disposed) setBusyIds((current) => current.filter((value) => value !== id));
        }
    }

    const buildImage = (id: string) =>
        void withBusy(id, async () => {
            const result = await props.session.state.execute("buildAgentImage", { imageId: id });
            upsert(result.image);
        });

    const setDefaultImage = (id: string) =>
        void withBusy(id, async () => {
            const result = await props.session.state.execute("setDefaultAgentImage", {
                imageId: id,
            });
            upsert(result.image);
            setDefaultImageId(result.defaultImageId);
        });

    function openCreate() {
        setDraftName("");
        setDraftDockerfile("");
        setCreateError(undefined);
        setCreateOpen(true);
    }

    async function submitCreate() {
        const name = draftName().trim();
        const dockerfile = draftDockerfile();
        if (!name || !dockerfile.trim() || creating()) return;
        setCreating(true);
        setCreateError(undefined);
        try {
            const result = await props.session.state.execute("createAgentImage", {
                name,
                dockerfile,
            });
            if (disposed) return;
            upsert(result.image);
            setCreateOpen(false);
        } catch (reason) {
            if (!disposed) setCreateError(message(reason));
        } finally {
            if (!disposed) setCreating(false);
        }
    }

    function openDetail(id: string) {
        setDetailId(id);
        setDetail(undefined);
        setDetailError(undefined);
        setDetailLoading(true);
        void refreshDetail(id, true);
    }

    function closeDetail() {
        setDetailId(undefined);
        setDetail(undefined);
        setDetailError(undefined);
        setDetailLoading(false);
    }

    // Fetch (or silently restream) one image's Dockerfile + build log. The
    // `initial` fetch drives the loading state; live restreams update in place.
    async function refreshDetail(id: string, initial = false) {
        try {
            const result = await props.session.state.execute("getAgentImage", { imageId: id });
            if (disposed || detailId() !== id) return;
            setDetail(result.image);
            setDetailError(undefined);
        } catch (reason) {
            if (!disposed && detailId() === id && initial) setDetailError(message(reason));
        } finally {
            if (!disposed && detailId() === id && initial) setDetailLoading(false);
        }
    }

    const items = createMemo<AgentImageItem[]>(() => {
        const list = images();
        if (!list) return [];
        const needle = props.query?.trim().toLowerCase() ?? "";
        const currentDefault = defaultImageId();
        return list
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
                isDefault: image.id === currentDefault,
                progress: image.buildProgress,
                lastLogLine: image.lastBuildLogLine,
                updatedLabel: formatDate(image.updatedAt),
                error: image.lastError,
            }));
    });

    const openImage = createMemo(() => {
        const id = detailId();
        if (!id) return undefined;
        return images()?.find((image) => image.id === id);
    });

    return (
        <>
            <AgentImagePanel
                actionError={actionError()}
                createError={createError()}
                createOpen={createOpen()}
                creating={creating()}
                draftDockerfile={draftDockerfile()}
                draftName={draftName()}
                error={loadError()}
                images={items()}
                loading={images() === undefined && !loadError()}
                onBuildImage={buildImage}
                onCloseCreate={() => setCreateOpen(false)}
                onDismissActionError={() => setActionError(undefined)}
                onDraftDockerfileChange={setDraftDockerfile}
                onDraftNameChange={setDraftName}
                onOpenCreate={openCreate}
                onSelectImage={openDetail}
                onSetDefaultImage={setDefaultImage}
                onSubmitCreate={() => void submitCreate()}
                subtitle="Immutable images every server-owned agent runs inside."
            />
            <Show when={detailId()}>
                <Box onClick={closeDetail} style={overlayStyle}>
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            icon="spark"
                            onClose={closeDetail}
                            size="large"
                            title={detail()?.name ?? openImage()?.name ?? "Agent image"}
                        >
                            <AgentImageDetail
                                buildLog={detail()?.buildLog ?? ""}
                                buildLogTruncated={detail()?.buildLogTruncated}
                                builtin={
                                    (detail()?.builtinKey ?? openImage()?.builtinKey) !== undefined
                                }
                                dockerfile={detail()?.dockerfile ?? ""}
                                error={detailError()}
                                isDefault={detailId() === defaultImageId()}
                                lastError={detail()?.lastError ?? openImage()?.lastError}
                                loading={detailLoading()}
                                progress={detail()?.buildProgress ?? openImage()?.buildProgress}
                                status={detail()?.status ?? openImage()?.status ?? "pending"}
                            />
                        </Modal>
                    </Box>
                </Box>
            </Show>
        </>
    );
}

function formatDate(value?: string): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
