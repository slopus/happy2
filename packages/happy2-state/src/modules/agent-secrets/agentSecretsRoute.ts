import type { IdentityCatalog } from "../identity/identityCatalog.js";
import { userError, type StateRuntime } from "../runtime/stateRuntime.js";
import type { AgentSecretsStoreBinding } from "./agentSecretsStore.js";
import type { AgentSecretsOutput } from "./agentSecretsTypes.js";

export interface AgentSecretsActionContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly secrets: AgentSecretsStoreBinding;
}

const generations = new WeakMap<AgentSecretsStoreBinding, number>();

/** Loads secret metadata plus binding targets without ever retaining secret values in a snapshot. */
export async function agentSecretsLoad(context: AgentSecretsActionContext): Promise<void> {
    const generation = (generations.get(context.secrets) ?? 0) + 1;
    generations.set(context.secrets, generation);
    context.secrets.agentSecretsInput({ type: "secretsLoading" });
    try {
        const [secrets, contacts, chats] = await Promise.all([
            context.runtime.operation("getAgentSecrets"),
            context.runtime.operation("getContacts"),
            context.runtime.operation("getChats"),
        ]);
        if (generations.get(context.secrets) !== generation) return;
        context.secrets.agentSecretsInput({
            type: "secretsLoaded",
            secrets: secrets.secrets,
            agents: contacts.users
                .filter((user) => user.kind === "agent")
                .map((user) => context.identities.project(user)),
            channels: chats.chats.filter((chat) => chat.kind !== "dm"),
        });
    } catch (error) {
        if (generations.get(context.secrets) === generation)
            context.secrets.agentSecretsInput({ type: "secretsFailed", error: userError(error) });
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
            context.secrets.agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        } else if (event.type === "secretDeleteSubmitted") {
            await context.runtime.operation("deleteAgentSecret", { secretId: event.secretId });
            context.secrets.agentSecretsInput({ type: "secretRemoved", secretId: event.secretId });
        } else if (event.type === "secretAgentAttached" || event.type === "secretAgentDetached") {
            const result = await context.runtime.operation(
                event.type === "secretAgentAttached"
                    ? "attachAgentSecretToAgent"
                    : "detachAgentSecretFromAgent",
                { secretId: event.secretId, agentUserId: event.agentUserId },
            );
            context.secrets.agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        } else {
            const result = await context.runtime.operation(
                event.type === "secretChannelAttached"
                    ? "attachAgentSecretToChannel"
                    : "detachAgentSecretFromChannel",
                { secretId: event.secretId, channelId: event.channelId },
            );
            context.secrets.agentSecretsInput({ type: "secretUpserted", secret: result.secret });
        }
    } catch (error) {
        context.secrets.agentSecretsInput({ type: "secretActionFailed", error: userError(error) });
    }
}
