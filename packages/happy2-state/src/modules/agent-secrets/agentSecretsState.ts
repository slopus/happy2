import { createStore, type StoreApi } from "zustand/vanilla";
import { type AgentSecretSummary } from "../../resources.js";
import { type ChatSummary, type UserError } from "../../types.js";
import { type Loadable } from "../chat/chatState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

export interface AgentSecretsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly secrets: AgentSecretsStore;
}

const generations = new WeakMap<AgentSecretsStore, number>();

/** Loads secret metadata plus binding targets without ever retaining secret values in a snapshot. */
export async function agentSecretsLoad(context: AgentSecretsActionContext): Promise<void> {
    const generation = (generations.get(context.secrets) ?? 0) + 1;
    generations.set(context.secrets, generation);
    context.secrets.getState().agentSecretsInput({ type: "secretsLoading" });
    try {
        const [secrets, contacts, chats] = await Promise.all([
            context.runtime.operation("getAgentSecrets"),
            context.runtime.operation("getContacts"),
            context.runtime.operation("getChats"),
        ]);
        if (generations.get(context.secrets) !== generation) return;
        context.secrets.getState().agentSecretsInput({
            type: "secretsLoaded",
            secrets: secrets.secrets,
            agents: contacts.users
                .filter((user) => user.kind === "agent")
                .map((user) => context.identities.project(user)),
            channels: chats.chats.filter((chat) => chat.kind !== "dm"),
        });
    } catch (error) {
        if (generations.get(context.secrets) === generation)
            context.secrets
                .getState()
                .agentSecretsInput({ type: "secretsFailed", error: userError(error) });
    }
}

/** Executes one closed secret mutation and projects only returned metadata into the retained surface. */
export async function agentSecretsOutputRoute(
    context: AgentSecretsActionContext,
    event: AgentSecretsOutput,
): Promise<void> {
    generations.set(context.secrets, (generations.get(context.secrets) ?? 0) + 1);
    try {
        if (event.type === "secretCreateSubmitted") {
            const result = await context.runtime.operation("createAgentSecret", {
                id: event.id,
                description: event.description,
                environment: event.environment,
            });
            context.secrets
                .getState()
                .agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        } else if (event.type === "secretDeleteSubmitted") {
            await context.runtime.operation("deleteAgentSecret", { secretId: event.secretId });
            context.secrets
                .getState()
                .agentSecretsInput({ type: "secretRemoved", secretId: event.secretId });
        } else if (event.type === "secretAgentAttached" || event.type === "secretAgentDetached") {
            const result = await context.runtime.operation(
                event.type === "secretAgentAttached"
                    ? "attachAgentSecretToAgent"
                    : "detachAgentSecretFromAgent",
                { secretId: event.secretId, agentUserId: event.agentUserId },
            );
            context.secrets
                .getState()
                .agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        } else {
            const result = await context.runtime.operation(
                event.type === "secretChannelAttached"
                    ? "attachAgentSecretToChannel"
                    : "detachAgentSecretFromChannel",
                { secretId: event.secretId, channelId: event.channelId },
            );
            context.secrets
                .getState()
                .agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        }
    } catch (error) {
        context.secrets
            .getState()
            .agentSecretsInput({ type: "secretActionFailed", error: userError(error) });
    }
}

/** Creates the secrets surface; secret values only exist transiently in typed output events. */
export function agentSecretsStoreCreate(
    output: (event: AgentSecretsOutput) => void = () => undefined,
): AgentSecretsStore {
    return createStore<AgentSecretsState>()((set) => {
        const submit = (event: AgentSecretsOutput): void => {
            set((snapshot) =>
                snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
            );
            output(event);
        };
        return {
            secrets: { type: "unloaded" },
            agents: [],
            channels: [],
            secretCreate(id, description, environment): void {
                submit({ type: "secretCreateSubmitted", id, description, environment });
            },
            secretDelete(secretId): void {
                submit({ type: "secretDeleteSubmitted", secretId });
            },
            secretAgentAttach(secretId, agentUserId): void {
                submit({ type: "secretAgentAttached", secretId, agentUserId });
            },
            secretAgentDetach(secretId, agentUserId): void {
                submit({ type: "secretAgentDetached", secretId, agentUserId });
            },
            secretChannelAttach(secretId, channelId): void {
                submit({ type: "secretChannelAttached", secretId, channelId });
            },
            secretChannelDetach(secretId, channelId): void {
                submit({ type: "secretChannelDetached", secretId, channelId });
            },
            agentSecretsInput(event): void {
                set((snapshot) => {
                    if (event.type === "secretsLoading")
                        return { ...snapshot, secrets: { type: "loading" } };
                    if (event.type === "secretsFailed")
                        return { ...snapshot, secrets: { type: "error", error: event.error } };
                    if (event.type === "secretsLoaded")
                        return {
                            secrets: { type: "ready", value: event.secrets },
                            agents: event.agents,
                            channels: event.channels,
                        };
                    if (event.type === "secretActionFailed")
                        return { ...snapshot, actionError: event.error };
                    if (event.type === "secretRemoved") {
                        if (snapshot.secrets.type !== "ready") return snapshot;
                        return {
                            ...snapshot,
                            secrets: {
                                type: "ready",
                                value: snapshot.secrets.value.filter(
                                    (secret) => secret.id !== event.secretId,
                                ),
                            },
                            actionError: undefined,
                        };
                    }
                    const values =
                        snapshot.secrets.type === "ready" ? [...snapshot.secrets.value] : [];
                    const index = values.findIndex((secret) => secret.id === event.secret.id);
                    if (index < 0) values.push(event.secret);
                    else values[index] = event.secret;
                    return {
                        ...snapshot,
                        secrets: { type: "ready", value: values },
                        actionError: undefined,
                    };
                });
            },
        };
    });
}

export interface AgentSecretsSnapshot {
    readonly secrets: Loadable<readonly AgentSecretSummary[]>;
    readonly agents: readonly IdentityProjection[];
    readonly channels: readonly ChatSummary[];
    readonly actionError?: UserError;
}

export type AgentSecretsOutput =
    | {
          readonly type: "secretCreateSubmitted";
          readonly id: string;
          readonly description: string;
          readonly environment: Readonly<Record<string, string>>;
      }
    | { readonly type: "secretDeleteSubmitted"; readonly secretId: string }
    | {
          readonly type: "secretAgentAttached";
          readonly secretId: string;
          readonly agentUserId: string;
      }
    | {
          readonly type: "secretAgentDetached";
          readonly secretId: string;
          readonly agentUserId: string;
      }
    | {
          readonly type: "secretChannelAttached";
          readonly secretId: string;
          readonly channelId: string;
      }
    | {
          readonly type: "secretChannelDetached";
          readonly secretId: string;
          readonly channelId: string;
      };

export type AgentSecretsInput =
    | { readonly type: "secretsLoading" }
    | {
          readonly type: "secretsLoaded";
          readonly secrets: readonly AgentSecretSummary[];
          readonly agents: readonly IdentityProjection[];
          readonly channels: readonly ChatSummary[];
      }
    | { readonly type: "secretsFailed"; readonly error: UserError }
    | { readonly type: "secretUpserted"; readonly secret: AgentSecretSummary }
    | { readonly type: "secretRemoved"; readonly secretId: string }
    | { readonly type: "secretActionFailed"; readonly error: UserError };

export interface AgentSecretsState extends AgentSecretsSnapshot {
    secretCreate(
        id: string,
        description: string,
        environment: Readonly<Record<string, string>>,
    ): void;
    secretDelete(secretId: string): void;
    secretAgentAttach(secretId: string, agentUserId: string): void;
    secretAgentDetach(secretId: string, agentUserId: string): void;
    secretChannelAttach(secretId: string, channelId: string): void;
    secretChannelDetach(secretId: string, channelId: string): void;
    agentSecretsInput(event: AgentSecretsInput): void;
}

export type AgentSecretsStore = StoreApi<AgentSecretsState>;
