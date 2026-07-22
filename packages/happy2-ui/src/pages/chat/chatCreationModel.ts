import { useLayoutEffect, useRef } from "react";
import type { ChatPageActions } from "./ChatPage.js";
export interface ChatCreationModelOptions {
    actions: ChatPageActions;
    isServerAdmin: () => boolean;
    onBusyStart(): void;
    onBusyFinish(): void;
    onError(error: unknown): void;
}
export function chatCreationModelCreate(options: ChatCreationModelOptions) {
    async function channelCreate(input: {
        name: string;
        slug: string;
        projectId: string;
        kind: "public_channel" | "private_channel";
        autoJoin: boolean;
    }) {
        if (!input.name || !input.slug) return false;
        options.onBusyStart();
        try {
            await options.actions.channelCreate({
                kind: input.kind,
                name: input.name,
                projectId: input.projectId,
                slug: input.slug,
                ...(options.isServerAdmin() && input.autoJoin ? { autoJoin: true } : {}),
            });
            return true;
        } catch (error) {
            options.onError(error);
            return false;
        } finally {
            options.onBusyFinish();
        }
    }
    async function channelCreateChild(input: {
        parentChatId: string;
        name: string;
        slug: string;
        topic?: string;
        agentModelId?: string;
    }) {
        if (!input.parentChatId || !input.name || !input.slug) return false;
        options.onBusyStart();
        try {
            await options.actions.channelCreateChild({
                parentChatId: input.parentChatId,
                name: input.name,
                slug: input.slug,
                ...(input.topic ? { topic: input.topic } : {}),
                ...(input.agentModelId ? { agentModelId: input.agentModelId } : {}),
            });
            return true;
        } catch (error) {
            options.onError(error);
            return false;
        } finally {
            options.onBusyFinish();
        }
    }
    async function projectCreate(input: import("happy2-state").CreateProjectInput) {
        if (!input.name || !input.initialChannel.name || !input.initialChannel.slug) return false;
        options.onBusyStart();
        try {
            await options.actions.projectCreate(input);
            return true;
        } catch (error) {
            options.onError(error);
            return false;
        } finally {
            options.onBusyFinish();
        }
    }
    async function agentCreate(name: string, username: string) {
        options.onBusyStart();
        try {
            await options.actions.agentCreate({ name, username });
            return true;
        } catch (error) {
            options.onError(error);
            return false;
        } finally {
            options.onBusyFinish();
        }
    }
    async function directMessageStart(userId: string) {
        options.onBusyStart();
        try {
            await options.actions.directMessageCreate(userId);
            return true;
        } catch (error) {
            options.onError(error);
            return false;
        } finally {
            options.onBusyFinish();
        }
    }
    return { agentCreate, channelCreate, channelCreateChild, directMessageStart, projectCreate };
}
export function useChatCreateRequest(options: {
    request?: {
        kind: "agent" | "channel";
        nonce: number;
    };
    onAgent(): void;
    onChannel(): void;
}) {
    const seen = useRef<number | undefined>(undefined);
    useLayoutEffect(() => {
        const request = options.request ?? { kind: "agent" as const, nonce: 0 };
        if (seen.current === undefined) seen.current = request.nonce;
        else if (request.nonce !== seen.current) {
            seen.current = request.nonce;
            if (request.kind === "agent") options.onAgent();
            else options.onChannel();
        }
    }, [options]);
}
