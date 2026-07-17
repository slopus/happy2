import type { ReadonlyStore } from "../../kernel/readonlyStore.js";
import type { AgentSecretSummary } from "../../resources.js";
import type { ChatSummary, UserError } from "../../types.js";
import type { IdentityProjection } from "../identity/identityTypes.js";
import type { Loadable } from "../chat/chatTypes.js";

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

export interface AgentSecretsStore extends ReadonlyStore<AgentSecretsSnapshot> {
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
}
