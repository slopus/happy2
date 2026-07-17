import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { AgentSecretSummary, ChatSummary, UserSummary } from "happy2-state";
import {
    AgentSecretDetail,
    AgentSecretPanel,
    Modal,
    ModalOverlay,
    type AgentSecretBinding,
    type AgentSecretDraftVariable,
    type AgentSecretItem,
} from "happy2-ui";
import type { AuthSession } from "../components/AuthGate";

export type AgentSecretsViewProps = {
    session: AuthSession;
    /** Shared TitleBar/Toolbar search value; filters secrets by description or id. */
    query?: string;
};

const emptyVariable = (): AgentSecretDraftVariable => ({ name: "", value: "" });

/**
 * Glue for the reusable happy2-ui AgentSecretPanel and AgentSecretDetail: it loads
 * Rig-owned secrets and the agents and channels they can attach to, translates
 * them into panel props, and turns the panel's callbacks into authenticated
 * mutations. All visuals live in happy2-ui. Secret values are write-only: they
 * are only ever sent when creating and never read back.
 *
 * Everything stays live without a refresh control: happy2-state refetches
 * `getAgentSecrets` whenever a realtime "agent-secrets" sync hint arrives (another
 * admin registering, deleting, or re-binding a secret). This view reconciles the
 * list from that result, and the open detail is derived from the same list so its
 * attachments update on their own.
 */
export function AgentSecretsView(props: AgentSecretsViewProps) {
    const [secrets, setSecrets] = createSignal<readonly AgentSecretSummary[]>();
    const [contacts, setContacts] = createSignal<readonly UserSummary[]>([]);
    const [chats, setChats] = createSignal<readonly ChatSummary[]>([]);
    const [loadError, setLoadError] = createSignal<string>();
    const [actionError, setActionError] = createSignal<string>();
    const [busyIds, setBusyIds] = createSignal<readonly string[]>([]);

    const [createOpen, setCreateOpen] = createSignal(false);
    const [draftId, setDraftId] = createSignal("");
    const [draftDescription, setDraftDescription] = createSignal("");
    const [draftVariables, setDraftVariables] = createSignal<AgentSecretDraftVariable[]>([
        emptyVariable(),
    ]);
    const [creating, setCreating] = createSignal(false);
    const [createError, setCreateError] = createSignal<string>();

    const [detailId, setDetailId] = createSignal<string>();
    const [detailError, setDetailError] = createSignal<string>();
    const [busyBindingIds, setBusyBindingIds] = createSignal<readonly string[]>([]);
    const [attachingAgent, setAttachingAgent] = createSignal(false);
    const [attachingChannel, setAttachingChannel] = createSignal(false);

    let disposed = false;
    onCleanup(() => {
        disposed = true;
    });

    // Reconcile from the latest results — the same results a realtime hint
    // refreshes — so the list and its pickers stay live.
    const applySecrets = () => {
        const result = props.session.state.result("getAgentSecrets");
        if (result) setSecrets(result.secrets);
    };
    const applyContacts = () => {
        const result = props.session.state.result("getContacts");
        if (result) setContacts(result.users);
    };
    const applyChats = () => {
        const result = props.session.state.result("getChats");
        if (result) setChats(result.chats);
    };

    onMount(() => {
        const unsubscribe = props.session.state.subscribe("operation", (event) => {
            if (disposed) return;
            if (event.operation === "getAgentSecrets") applySecrets();
            else if (event.operation === "getContacts") applyContacts();
            else if (event.operation === "getChats") applyChats();
        });
        onCleanup(unsubscribe);
        applySecrets();
        applyContacts();
        applyChats();
        void load();
    });

    async function load() {
        setLoadError(undefined);
        try {
            await Promise.all([
                props.session.state.execute("getAgentSecrets"),
                props.session.state.execute("getContacts"),
                props.session.state.execute("getChats"),
            ]);
        } catch (reason) {
            if (!disposed) setLoadError(message(reason));
        }
    }

    const upsert = (secret: AgentSecretSummary) =>
        setSecrets((current) => {
            const list = current ?? [];
            const index = list.findIndex((item) => item.id === secret.id);
            if (index < 0) return [secret, ...list];
            const next = list.slice();
            next[index] = secret;
            return next;
        });

    const remove = (id: string) =>
        setSecrets((current) => (current ?? []).filter((item) => item.id !== id));

    async function withBusy(
        set: (updater: (current: readonly string[]) => readonly string[]) => void,
        current: readonly string[],
        id: string,
        action: () => Promise<void>,
    ) {
        if (current.includes(id)) return;
        setActionError(undefined);
        set((values) => [...values, id]);
        try {
            await action();
        } catch (reason) {
            if (!disposed) setActionError(message(reason));
        } finally {
            if (!disposed) set((values) => values.filter((value) => value !== id));
        }
    }

    const deleteSecret = (id: string) =>
        void withBusy(setBusyIds, busyIds(), id, async () => {
            await props.session.state.execute("deleteAgentSecret", { secretId: id });
            if (disposed) return;
            remove(id);
            if (detailId() === id) closeDetail();
        });

    // --- Create -------------------------------------------------------------

    function openCreate() {
        setDraftId("");
        setDraftDescription("");
        setDraftVariables([emptyVariable()]);
        setCreateError(undefined);
        setCreateOpen(true);
    }

    const changeVariable = (index: number, field: "name" | "value", value: string) =>
        setDraftVariables((current) =>
            current.map((variable, i) =>
                i === index ? { ...variable, [field]: value } : variable,
            ),
        );
    const addVariable = () => setDraftVariables((current) => [...current, emptyVariable()]);
    const removeVariable = (index: number) =>
        setDraftVariables((current) =>
            current.length <= 1 ? current : current.filter((_, i) => i !== index),
        );

    async function submitCreate() {
        const id = draftId().trim();
        const description = draftDescription().trim();
        const environment: Record<string, string> = {};
        for (const variable of draftVariables()) {
            const name = variable.name.trim();
            if (name !== "") environment[name] = variable.value;
        }
        if (!id || !description || Object.keys(environment).length === 0 || creating()) return;
        setCreating(true);
        setCreateError(undefined);
        try {
            const result = await props.session.state.execute("createAgentSecret", {
                id,
                description,
                environment,
            });
            if (disposed) return;
            upsert(result.secret);
            setCreateOpen(false);
        } catch (reason) {
            if (!disposed) setCreateError(message(reason));
        } finally {
            if (!disposed) setCreating(false);
        }
    }

    // --- Detail / attachments ----------------------------------------------

    function openDetail(id: string) {
        setDetailId(id);
        setDetailError(undefined);
    }
    function closeDetail() {
        setDetailId(undefined);
        setDetailError(undefined);
        setBusyBindingIds([]);
    }

    const openSecret = createMemo(() => {
        const id = detailId();
        if (!id) return undefined;
        return secrets()?.find((secret) => secret.id === id);
    });

    async function withBindingBusy(id: string, action: () => Promise<void>) {
        if (busyBindingIds().includes(id)) return;
        setDetailError(undefined);
        setBusyBindingIds((current) => [...current, id]);
        try {
            await action();
        } catch (reason) {
            if (!disposed) setDetailError(message(reason));
        } finally {
            if (!disposed) setBusyBindingIds((current) => current.filter((value) => value !== id));
        }
    }

    const attachAgent = (secretId: string, agentUserId: string) => {
        setAttachingAgent(true);
        void (async () => {
            setDetailError(undefined);
            try {
                const result = await props.session.state.execute("attachAgentSecretToAgent", {
                    secretId,
                    agentUserId,
                });
                if (!disposed) upsert(result.secret);
            } catch (reason) {
                if (!disposed) setDetailError(message(reason));
            } finally {
                if (!disposed) setAttachingAgent(false);
            }
        })();
    };
    const detachAgent = (secretId: string, agentUserId: string) =>
        void withBindingBusy(agentUserId, async () => {
            const result = await props.session.state.execute("detachAgentSecretFromAgent", {
                secretId,
                agentUserId,
            });
            if (!disposed) upsert(result.secret);
        });

    const attachChannel = (secretId: string, channelId: string) => {
        setAttachingChannel(true);
        void (async () => {
            setDetailError(undefined);
            try {
                const result = await props.session.state.execute("attachAgentSecretToChannel", {
                    secretId,
                    channelId,
                });
                if (!disposed) upsert(result.secret);
            } catch (reason) {
                if (!disposed) setDetailError(message(reason));
            } finally {
                if (!disposed) setAttachingChannel(false);
            }
        })();
    };
    const detachChannel = (secretId: string, channelId: string) =>
        void withBindingBusy(channelId, async () => {
            const result = await props.session.state.execute("detachAgentSecretFromChannel", {
                secretId,
                channelId,
            });
            if (!disposed) upsert(result.secret);
        });

    // --- Derived props ------------------------------------------------------

    const items = createMemo<AgentSecretItem[]>(() => {
        const list = secrets();
        if (!list) return [];
        const needle = props.query?.trim().toLowerCase() ?? "";
        return list
            .filter(
                (secret) =>
                    !needle ||
                    secret.description.toLowerCase().includes(needle) ||
                    secret.id.toLowerCase().includes(needle),
            )
            .map((secret) => ({
                id: secret.id,
                description: secret.description,
                environmentVariables: secret.environmentVariables,
                agentCount: secret.agentUserIds.length,
                channelCount: secret.channelIds.length,
            }));
    });

    const agentContacts = createMemo(() => contacts().filter((user) => user.kind === "agent"));
    const channelChats = createMemo(() =>
        chats().filter((chat) => chat.kind === "public_channel" || chat.kind === "private_channel"),
    );

    const agentBindings = createMemo<AgentSecretBinding[]>(() => {
        const secret = openSecret();
        if (!secret) return [];
        const byId = new Map(agentContacts().map((user) => [user.id, user]));
        return secret.agentUserIds.map((id) => {
            const user = byId.get(id);
            return {
                id,
                name: user ? userName(user) : id,
                secondary: user ? `@${user.username}` : undefined,
            };
        });
    });
    const channelBindings = createMemo<AgentSecretBinding[]>(() => {
        const secret = openSecret();
        if (!secret) return [];
        const byId = new Map(channelChats().map((chat) => [chat.id, chat]));
        return secret.channelIds.map((id) => {
            const chat = byId.get(id);
            return {
                id,
                name: chat ? chatName(chat) : id,
                secondary: chat?.slug ? `#${chat.slug}` : undefined,
            };
        });
    });
    const availableAgents = createMemo(() => {
        const secret = openSecret();
        const attached = new Set(secret?.agentUserIds ?? []);
        return agentContacts()
            .filter((user) => !attached.has(user.id))
            .map((user) => ({ value: user.id, label: `${userName(user)} (@${user.username})` }));
    });
    const availableChannels = createMemo(() => {
        const secret = openSecret();
        const attached = new Set(secret?.channelIds ?? []);
        return channelChats()
            .filter((chat) => !attached.has(chat.id))
            .map((chat) => ({
                value: chat.id,
                label: chat.slug ? `${chatName(chat)} (#${chat.slug})` : chatName(chat),
            }));
    });

    return (
        <>
            <AgentSecretPanel
                actionError={actionError()}
                createError={createError()}
                createOpen={createOpen()}
                creating={creating()}
                draftDescription={draftDescription()}
                draftId={draftId()}
                draftVariables={draftVariables()}
                error={loadError()}
                loading={secrets() === undefined && !loadError()}
                onAddDraftVariable={addVariable}
                onCloseCreate={() => setCreateOpen(false)}
                onDeleteSecret={deleteSecret}
                onDismissActionError={() => setActionError(undefined)}
                onDraftDescriptionChange={setDraftDescription}
                onDraftIdChange={setDraftId}
                onDraftVariableChange={changeVariable}
                onOpenCreate={openCreate}
                onRemoveDraftVariable={removeVariable}
                onSelectSecret={openDetail}
                onSubmitCreate={() => void submitCreate()}
                secrets={items()}
                subtitle="Bundles of environment variables the Rig injects into agents and channels."
                busySecretIds={busyIds()}
            />
            <Show when={openSecret()}>
                {(secret) => (
                    <ModalOverlay onDismiss={closeDetail}>
                        <Modal
                            icon="shield"
                            onClose={closeDetail}
                            size="medium"
                            title={secret().description}
                        >
                            <AgentSecretDetail
                                agents={agentBindings()}
                                attachingAgent={attachingAgent()}
                                attachingChannel={attachingChannel()}
                                availableAgents={availableAgents()}
                                availableChannels={availableChannels()}
                                busyAgentIds={busyBindingIds()}
                                busyChannelIds={busyBindingIds()}
                                channels={channelBindings()}
                                environmentVariables={secret().environmentVariables}
                                error={detailError()}
                                onAttachAgent={(agentUserId) =>
                                    attachAgent(secret().id, agentUserId)
                                }
                                onAttachChannel={(channelId) =>
                                    attachChannel(secret().id, channelId)
                                }
                                onDetachAgent={(agentUserId) =>
                                    detachAgent(secret().id, agentUserId)
                                }
                                onDetachChannel={(channelId) =>
                                    detachChannel(secret().id, channelId)
                                }
                                onDismissError={() => setDetailError(undefined)}
                            />
                        </Modal>
                    </ModalOverlay>
                )}
            </Show>
        </>
    );
}

function userName(user: UserSummary): string {
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || `@${user.username}`;
}

function chatName(chat: ChatSummary): string {
    return chat.name ?? chat.slug ?? "Channel";
}

function message(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
