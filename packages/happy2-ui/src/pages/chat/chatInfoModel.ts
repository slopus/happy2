import { useState } from "react";
import type {
    ChatSnapshot,
    ChatStore,
    ChatSummary,
    DeepReadonly,
    DirectoryUserProjection,
    SidebarChatProjection,
} from "happy2-state";
import type { InfoPanelProfile } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import { identityInitials, toneFor, type LiveChatMessage } from "./chatPageModels.js";
type Participant = DeepReadonly<SidebarChatProjection>["participants"][number];
export interface ChatInfoModelOptions {
    activeChat: () => DeepReadonly<ChatSummary> | undefined;
    activePeer: () => Participant | undefined;
    chatSnapshot: () => ChatSnapshot | undefined;
    chatStore: () => ChatStore | undefined;
    directoryUsers: () => readonly DeepReadonly<DirectoryUserProjection>[];
    isServerAdmin: () => boolean;
    actions: ChatPageActions;
    avatarFor(userId?: string, fallback?: string): string | undefined;
    onInfoOpen(): void;
    onProfileOpen(userId: string): void;
    onBusyStart(): void;
    onBusyFinish(): void;
    onError(error: unknown): void;
    onSaved(): void;
}
export function useChatInfoModel(options: ChatInfoModelOptions) {
    const [channelName, setChannelName] = useState("");
    const [channelTopic, setChannelTopic] = useState("");
    const [autoJoin, setAutoJoin] = useState(false);
    const peer = options.activePeer;
    const agent = () => (peer()?.kind === "agent" ? peer() : undefined);
    const presenceFor = (id: string) =>
        options.directoryUsers().find((person) => person.id === id)?.presence ?? "offline";
    const profile = (): InfoPanelProfile | undefined => {
        const value = peer();
        return value ? profileProject(value) : undefined;
    };
    const profileFor = (userId: string): InfoPanelProfile | undefined => {
        const value = options.directoryUsers().find((person) => person.id === userId);
        return value ? profileProject(value) : undefined;
    };
    const members = (() => {
        const value = options.chatSnapshot()?.members;
        if (value?.type !== "ready") return [];
        return value.value.map((member) => ({
            id: member.id,
            agent: member.kind === "agent",
            initials: identityInitials(member),
            imageUrl: options.avatarFor(member.id, member.photoFileId),
            name: member.displayName,
            presence: member.presence,
            role: member.role,
            title: member.title,
            tone: toneFor(member.id),
            username: member.username,
        }));
    })();
    function messageProfile(message: LiveChatMessage): InfoPanelProfile | undefined {
        const sender = message.serverMessage?.sender;
        if (!sender) return undefined;
        return {
            id: sender.id,
            imageUrl: options.avatarFor(sender.id, sender.photoFileId),
            initials: identityInitials(sender),
            name: sender.displayName,
            presence: presenceFor(sender.id),
            tone: toneFor(sender.id),
            username: sender.username,
        };
    }
    const effort = () => {
        const value = agent();
        return value ? options.chatSnapshot()?.agentEffort[value.id] : undefined;
    };
    const effortOptions = () => {
        const value = effort();
        return value?.type === "ready" ? value.value.options : undefined;
    };
    const effortValue = () => {
        const value = effort();
        return value?.type === "ready" ? value.value.effort : undefined;
    };
    const effortError = () => {
        const value = effort();
        return value?.type === "error" ? value.error.message : undefined;
    };
    function effortChange(value: string) {
        const target = agent();
        if (target) options.chatStore()?.getState().agentEffortChange(target.id, value);
    }
    function open(override?: InfoPanelProfile) {
        if (override?.id) options.onProfileOpen(override.id);
        else options.onInfoOpen();
        const chat = options.activeChat();
        if (chat) {
            setChannelName(chat.name ?? "");
            setChannelTopic(chat.topic ?? "");
            setAutoJoin(chat.autoJoin);
        }
        options.chatStore()?.getState().membersRetain();
        const target = agent();
        if (target) options.chatStore()?.getState().agentEffortRetain(target.id);
    }
    async function save() {
        const chat = options.activeChat();
        const role = chat?.membershipRole;
        const canEdit = chat?.kind !== "dm" && (role === "owner" || role === "admin");
        if (!chat || !canEdit) return;
        options.onBusyStart();
        try {
            await options.actions.channelUpdate(chat.id, {
                name: channelName.trim(),
                topic: channelTopic.trim() || undefined,
                ...(options.isServerAdmin() && !chat.isMain ? { autoJoin: autoJoin } : {}),
            });
            options.onSaved();
        } catch (error) {
            options.onError(error);
        } finally {
            options.onBusyFinish();
        }
    }
    return {
        agent,
        autoJoin,
        canChangeEffort: () => Boolean(agent()),
        channelName,
        channelTopic,
        effortBusy: () => effort()?.type === "loading",
        effortChange,
        effortError,
        effortOptions,
        effortValue,
        members,
        messageProfile,
        open,
        peer,
        profile,
        profileFor,
        save,
        setAutoJoin,
        setChannelName,
        setChannelTopic,
    };
    function profileProject(value: Participant | DeepReadonly<DirectoryUserProjection>) {
        return {
            id: value.id,
            imageUrl: options.avatarFor(value.id, value.photoFileId),
            initials: identityInitials(value),
            name: value.displayName,
            presence: presenceFor(value.id),
            tone: toneFor(value.id),
            username: value.username,
        } satisfies InfoPanelProfile;
    }
}
