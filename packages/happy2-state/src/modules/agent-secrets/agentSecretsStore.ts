import { storeCreate } from "../../kernel/store.js";
import type {
    AgentSecretsInput,
    AgentSecretsOutput,
    AgentSecretsSnapshot,
    AgentSecretsStore,
} from "./agentSecretsTypes.js";

export interface AgentSecretsStoreBinding {
    readonly store: AgentSecretsStore;
    agentSecretsInput(event: AgentSecretsInput): void;
    dispose(): void;
}

/** Creates the secrets surface; secret values only exist transiently in typed output events. */
export function agentSecretsStoreCreateBinding(
    output: (event: AgentSecretsOutput) => void = () => undefined,
): AgentSecretsStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<AgentSecretsSnapshot>({
        secrets: { type: "unloaded" },
        agents: [],
        channels: [],
    });
    let disposed = false;
    const submit = (event: AgentSecretsOutput): void => {
        if (disposed) return;
        writer.update((snapshot) =>
            snapshot.actionError ? { ...snapshot, actionError: undefined } : snapshot,
        );
        output(event);
    };
    const store: AgentSecretsStore = {
        ...readonlyStore,
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
    };
    return {
        store,
        agentSecretsInput(event): void {
            if (disposed) return;
            writer.update((snapshot) => {
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
                const values = snapshot.secrets.type === "ready" ? [...snapshot.secrets.value] : [];
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
        dispose(): void {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
