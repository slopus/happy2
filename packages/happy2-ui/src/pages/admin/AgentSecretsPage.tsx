import { useState } from "react";
import type { AgentSecretsStore, ChatSummary, IdentityProjection } from "happy2-state";
import { AgentSecretDetail } from "../../AgentSecretDetail";
import { AgentSecretPanel, type AgentSecretDraftVariable } from "../../AgentSecretPanel";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { StoreSurface } from "../../StoreSurface";
export interface AgentSecretsPageProps {
    store: AgentSecretsStore;
    query?: string;
}
const emptyVariable = (): AgentSecretDraftVariable => ({ name: "", value: "" });
/** Complete write-only secret metadata and binding page backed by AgentSecretsStore. */
export function AgentSecretsPage(props: AgentSecretsPageProps) {
    const [dismissedError, setDismissedError] = useState<unknown>();
    const [createOpen, setCreateOpen] = useState(false);
    const [draftId, setDraftId] = useState("");
    const [draftDescription, setDraftDescription] = useState("");
    const [draftVariables, setDraftVariables] = useState<AgentSecretDraftVariable[]>([
        emptyVariable(),
    ]);
    const [detailId, setDetailId] = useState<string>();
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const secrets = (() => {
                    const state = snapshot.secrets;
                    return state.type === "ready" ? state.value : [];
                })();
                const needle = props.query?.trim().toLowerCase() ?? "";
                const items = secrets
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
                const openSecret = secrets.find((secret) => secret.id === detailId);
                const agentById = new Map(snapshot.agents.map((user) => [user.id, user]));
                const channelById = new Map(snapshot.channels.map((chat) => [chat.id, chat]));
                const agentBindings = (openSecret?.agentUserIds ?? []).map((id) => {
                    const user = agentById.get(id);
                    return {
                        id,
                        name: user ? userName(user) : id,
                        secondary: user ? `@${user.username}` : undefined,
                    };
                });
                const channelBindings = (openSecret?.channelIds ?? []).map((id) => {
                    const chat = channelById.get(id);
                    return {
                        id,
                        name: chat ? chatName(chat) : id,
                        secondary: chat?.slug ? `#${chat.slug}` : undefined,
                    };
                });
                const attachedAgents = new Set(openSecret?.agentUserIds ?? []);
                const attachedChannels = new Set(openSecret?.channelIds ?? []);
                const actionError =
                    snapshot.actionError === dismissedError
                        ? undefined
                        : snapshot.actionError?.message;
                const secretsError = (() => {
                    const state = snapshot.secrets;
                    return state.type === "error" ? state.error.message : undefined;
                })();
                return (
                    <>
                        <AgentSecretPanel
                            actionError={actionError}
                            busySecretIds={[]}
                            createError={actionError}
                            createOpen={createOpen}
                            creating={false}
                            draftDescription={draftDescription}
                            draftId={draftId}
                            draftVariables={draftVariables}
                            error={secretsError}
                            loading={
                                snapshot.secrets.type === "loading" ||
                                snapshot.secrets.type === "unloaded"
                            }
                            onAddDraftVariable={() =>
                                setDraftVariables((current) => [...current, emptyVariable()])
                            }
                            onCloseCreate={() => setCreateOpen(false)}
                            onDeleteSecret={(id) => {
                                store.secretDelete(id);
                                if (detailId === id) setDetailId(undefined);
                            }}
                            onDismissActionError={() => setDismissedError(snapshot.actionError)}
                            onDraftDescriptionChange={setDraftDescription}
                            onDraftIdChange={setDraftId}
                            onDraftVariableChange={(index, field, value) =>
                                setDraftVariables((current) =>
                                    current.map((variable, itemIndex) =>
                                        itemIndex === index
                                            ? { ...variable, [field]: value }
                                            : variable,
                                    ),
                                )
                            }
                            onOpenCreate={() => {
                                setDraftId("");
                                setDraftDescription("");
                                setDraftVariables([emptyVariable()]);
                                setCreateOpen(true);
                            }}
                            onRemoveDraftVariable={(index) =>
                                setDraftVariables((current) =>
                                    current.length <= 1
                                        ? current
                                        : current.filter((_, itemIndex) => itemIndex !== index),
                                )
                            }
                            onSelectSecret={setDetailId}
                            onSubmitCreate={() => {
                                const id = draftId.trim();
                                const description = draftDescription.trim();
                                const environment = Object.fromEntries(
                                    draftVariables
                                        .filter((variable) => variable.name.trim())
                                        .map((variable) => [variable.name.trim(), variable.value]),
                                );
                                if (!id || !description || Object.keys(environment).length === 0)
                                    return;
                                store.secretCreate(id, description, environment);
                                setCreateOpen(false);
                            }}
                            secrets={items}
                            subtitle="Bundles of environment variables the Rig injects into agents and channels."
                        />
                        {openSecret
                            ? ((secret) => (
                                  <ModalOverlay onDismiss={() => setDetailId(undefined)}>
                                      <Modal
                                          icon="shield"
                                          onClose={() => setDetailId(undefined)}
                                          size="medium"
                                          title={secret.description}
                                      >
                                          <AgentSecretDetail
                                              agents={agentBindings}
                                              attachingAgent={false}
                                              attachingChannel={false}
                                              availableAgents={snapshot.agents
                                                  .filter((user) => !attachedAgents.has(user.id))
                                                  .map((user) => ({
                                                      value: user.id,
                                                      label: `${userName(user)} (@${user.username})`,
                                                  }))}
                                              availableChannels={snapshot.channels
                                                  .filter((chat) => !attachedChannels.has(chat.id))
                                                  .map((chat) => ({
                                                      value: chat.id,
                                                      label: chat.slug
                                                          ? `${chatName(chat)} (#${chat.slug})`
                                                          : chatName(chat),
                                                  }))}
                                              busyAgentIds={[]}
                                              busyChannelIds={[]}
                                              channels={channelBindings}
                                              environmentVariables={secret.environmentVariables}
                                              error={actionError}
                                              onAttachAgent={(id) =>
                                                  store.secretAgentAttach(secret.id, id)
                                              }
                                              onAttachChannel={(id) =>
                                                  store.secretChannelAttach(secret.id, id)
                                              }
                                              onDetachAgent={(id) =>
                                                  store.secretAgentDetach(secret.id, id)
                                              }
                                              onDetachChannel={(id) =>
                                                  store.secretChannelDetach(secret.id, id)
                                              }
                                              onDismissError={() =>
                                                  setDismissedError(snapshot.actionError)
                                              }
                                          />
                                      </Modal>
                                  </ModalOverlay>
                              ))(openSecret)
                            : null}
                    </>
                );
            }}
        </StoreSurface>
    );
}
function userName(user: IdentityProjection): string {
    return user.displayName || `@${user.username}`;
}
function chatName(chat: ChatSummary): string {
    return chat.name ?? chat.slug ?? "Channel";
}
