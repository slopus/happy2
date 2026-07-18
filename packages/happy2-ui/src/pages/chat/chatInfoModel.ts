import { createMemo, createSignal, type Accessor } from "solid-js";
import type {
    ChatStore,
    ChatSummary,
    DeepReadonly,
    DirectoryUserProjection,
    SidebarChatProjection,
} from "happy2-state";
import type { InfoPanelProfile, MemberItem } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import { identityInitials, toneFor, type LiveThreadMessage } from "./chatPageModels.js";

type Participant = DeepReadonly<SidebarChatProjection>["participants"][number];

export interface ChatInfoModelOptions {
    activeChat: Accessor<DeepReadonly<ChatSummary> | undefined>;
    activePeer: Accessor<Participant | undefined>;
    chatSnapshot: Accessor<ReturnType<ChatStore["get"]> | undefined>;
    chatStore: Accessor<ChatStore | undefined>;
    directoryUsers: Accessor<readonly DeepReadonly<DirectoryUserProjection>[]>;
    isServerAdmin: Accessor<boolean>;
    actions: ChatPageActions;
    avatarFor(userId?: string, fallback?: string): string | undefined;
    onOpen(): void;
    onBusyStart(): void;
    onBusyFinish(): void;
    onError(error: unknown): void;
    onSaved(): void;
}

export function chatInfoModelCreate(options: ChatInfoModelOptions) {
    const [profileOverride, setProfileOverride] = createSignal<InfoPanelProfile>();
    const [channelName, setChannelName] = createSignal("");
    const [channelTopic, setChannelTopic] = createSignal("");
    const [autoJoin, setAutoJoin] = createSignal(false);
    const peer = options.activePeer;
    const agent = () => (peer()?.kind === "agent" ? peer() : undefined);
    const presenceFor = (id: string) =>
        options.directoryUsers().find((person) => person.id === id)?.presence ?? "offline";
    const profile = (): InfoPanelProfile | undefined => {
        const value = peer();
        return value
            ? {
                  imageUrl: options.avatarFor(value.id, value.photoFileId),
                  initials: identityInitials(value),
                  name: value.displayName,
                  presence: presenceFor(value.id),
                  tone: toneFor(value.id),
                  username: value.username,
              }
            : undefined;
    };
    const members = createMemo<MemberItem[]>(() => {
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
            systemRole: member.systemRole,
            title: member.title,
            tone: toneFor(member.id),
            username: member.username,
        }));
    });
    function messageProfile(message: LiveThreadMessage): InfoPanelProfile | undefined {
        const sender = message.serverMessage?.sender;
        if (!sender) return undefined;
        return {
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
        if (target) options.chatStore()?.agentEffortChange(target.id, value);
    }
    function open(override?: InfoPanelProfile) {
        setProfileOverride(override);
        options.onOpen();
        const chat = options.activeChat();
        if (chat) {
            setChannelName(chat.name ?? "");
            setChannelTopic(chat.topic ?? "");
            setAutoJoin(chat.autoJoin);
        }
        options.chatStore()?.membersRetain();
        const target = agent();
        if (target) options.chatStore()?.agentEffortRetain(target.id);
    }
    async function save() {
        const chat = options.activeChat();
        const role = chat?.membershipRole;
        const canEdit = chat?.kind !== "dm" && (role === "owner" || role === "admin");
        if (!chat || !canEdit) return;
        options.onBusyStart();
        try {
            await options.actions.channelUpdate(chat.id, {
                name: channelName().trim(),
                topic: channelTopic().trim() || undefined,
                ...(options.isServerAdmin() && !chat.isMain ? { autoJoin: autoJoin() } : {}),
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
        profileOverride,
        profileOverrideClear: () => setProfileOverride(undefined),
        save,
        setAutoJoin,
        setChannelName,
        setChannelTopic,
    };
}
