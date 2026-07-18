import { createEffect, type Accessor } from "solid-js";
import type { DeepReadonly, DirectoryUserProjection } from "happy2-state";
import type { ChatPageActions } from "./ChatPage.js";

export interface ChatCreationModelOptions {
    actions: ChatPageActions;
    directoryUsers: Accessor<readonly DeepReadonly<DirectoryUserProjection>[]>;
    userId: Accessor<string>;
    isServerAdmin: Accessor<boolean>;
    onBusyStart(): void;
    onBusyFinish(): void;
    onError(error: unknown): void;
    onStatus(message: string): void;
    onChannelCreated(name: string): void;
    onAgentCreated(username: string): void;
    onDirectMessageStarted(userId: string): void;
}

export function chatCreationModelCreate(options: ChatCreationModelOptions) {
    async function channelCreate(input: {
        name: string;
        slug: string;
        kind: "public_channel" | "private_channel";
        autoJoin: boolean;
    }) {
        if (!input.name || !input.slug) return;
        options.onBusyStart();
        try {
            await options.actions.channelCreate({
                kind: input.kind,
                name: input.name,
                slug: input.slug,
                ...(options.isServerAdmin() && input.autoJoin ? { autoJoin: true } : {}),
            });
            options.onChannelCreated(input.name);
        } catch (error) {
            options.onError(error);
        } finally {
            options.onBusyFinish();
        }
    }
    async function agentCreate(name: string, username: string) {
        options.onBusyStart();
        try {
            await options.actions.agentCreate({ name, username });
            options.onAgentCreated(username);
        } catch (error) {
            options.onError(error);
        } finally {
            options.onBusyFinish();
        }
    }
    async function directMessageStart() {
        const teammates = options
            .directoryUsers()
            .filter((person) => person.id !== options.userId());
        const query = window.prompt("Message teammate by name or username")?.trim().toLowerCase();
        if (!query) return;
        const teammate = teammates.find(
            (person) =>
                person.displayName.toLowerCase() === query ||
                person.username.toLowerCase() === query,
        );
        if (!teammate) return options.onStatus("No teammate matched that name or username.");
        options.onDirectMessageStarted(teammate.id);
        await options.actions.directMessageCreate(teammate.id).catch(options.onError);
    }
    return { agentCreate, channelCreate, directMessageStart };
}

export function chatCreateRequestFollow(options: {
    request?: Accessor<{ kind: "agent" | "channel"; nonce: number }>;
    onAgent(): void;
    onChannel(): void;
}) {
    let seen: number | undefined;
    createEffect(() => {
        const request = options.request?.() ?? { kind: "agent" as const, nonce: 0 };
        if (seen === undefined) seen = request.nonce;
        else if (request.nonce !== seen) {
            seen = request.nonce;
            if (request.kind === "agent") options.onAgent();
            else options.onChannel();
        }
    });
}
