import { StoreRegistry } from "./kernel/storeRegistry.js";
import { chatLoad } from "./modules/chat/chatState.js";
import { chatMembersLoad } from "./modules/chat/chatState.js";
import { chatPinsLoad } from "./modules/chat/chatState.js";
import { chatOpen, type ChatOpenContext } from "./modules/chat/chatState.js";
import { reactionActorsLoad } from "./modules/chat/chatState.js";
import { chatStoreCreate, type ChatOutput, type ChatStore } from "./modules/chat/chatState.js";
import type { ChatHandle } from "./modules/chat/chatState.js";
import {
    composerStoreCreate,
    type ComposerStore,
    type ComposerStoreOptions,
} from "./modules/composer/composerState.js";
import type { ComposerOutput } from "./modules/composer/composerState.js";
import {
    draftUpdate,
    type DraftActionContext,
    type DraftUpdated,
} from "./modules/draft/draftState.js";
import { IdentityCatalog } from "./modules/identity/identityState.js";
import { identitiesReconcile } from "./modules/identity/identityState.js";
import { messageDelete } from "./modules/message/messageState.js";
import { messageEdit } from "./modules/message/messageState.js";
import { messageSend } from "./modules/message/messageState.js";
import { messagePin } from "./modules/message/messageState.js";
import { messageUnpin } from "./modules/message/messageState.js";
import { reactionAdd } from "./modules/reaction/reactionState.js";
import { reactionRemove } from "./modules/reaction/reactionState.js";
import type { ReactionSelector } from "./modules/reaction/reactionState.js";
import { filesLoad } from "./modules/files/filesState.js";
import { fileUpload } from "./modules/files/filesState.js";
import { filesStoreCreate, type FilesOutput, type FilesStore } from "./modules/files/filesState.js";
import { StateRuntime, type StateRuntimeOptions } from "./modules/runtime/runtimeState.js";
import { sidebarStoreCreate } from "./modules/sidebar/sidebarState.js";
import type { SidebarStore } from "./modules/sidebar/sidebarState.js";
import { SidebarChatsProjector } from "./modules/sidebar/sidebarState.js";
import { SettingsCoordinator } from "./modules/settings/settingsState.js";
import { avatarUpload } from "./modules/settings/settingsState.js";
import {
    settingsStoreCreate,
    type SettingsOutput,
    type SettingsStore,
    type SettingsStoreOptions,
} from "./modules/settings/settingsState.js";
import { SyncCoordinator } from "./modules/sync/syncState.js";
import { syncStart } from "./modules/sync/syncState.js";
import { syncStop } from "./modules/sync/syncState.js";
import type { WorkspaceActionContext } from "./modules/workspace/workspaceState.js";
import { workspaceDirectoriesUpdate } from "./modules/workspace/workspaceState.js";
import { workspaceDirectoryMore } from "./modules/workspace/workspaceState.js";
import { workspaceLoad } from "./modules/workspace/workspaceState.js";
import { workspaceOpen, type WorkspaceOpenContext } from "./modules/workspace/workspaceState.js";
import { workspaceReconcile } from "./modules/workspace/workspaceState.js";
import {
    workspaceStoreCreate,
    type WorkspaceOutput,
    type WorkspaceStore,
} from "./modules/workspace/workspaceState.js";
import type { WorkspaceHandle } from "./modules/workspace/workspaceState.js";
import type { WorkspaceFileActionContext } from "./modules/workspace-file/workspaceFileState.js";
import { workspaceFileDelete } from "./modules/workspace-file/workspaceFileState.js";
import { workspaceFileLoad } from "./modules/workspace-file/workspaceFileState.js";
import {
    workspaceFileOpen,
    type WorkspaceFileOpenContext,
} from "./modules/workspace-file/workspaceFileState.js";
import { workspaceFileSave } from "./modules/workspace-file/workspaceFileState.js";
import {
    workspaceFileStoreCreate,
    type WorkspaceFileOutput,
    type WorkspaceFileStore,
} from "./modules/workspace-file/workspaceFileState.js";
import type { WorkspaceFileHandle } from "./modules/workspace-file/workspaceFileState.js";
import type { CreateAgentInput, CreateChannelInput, SendMessageInput, UserError } from "./types.js";
import { searchQueryUpdate } from "./modules/search/searchState.js";
import {
    searchStoreCreate,
    type SearchOutput,
    type SearchStore,
} from "./modules/search/searchState.js";
import { directoryLoad } from "./modules/directory/directoryState.js";
import { directoryStoreCreate, type DirectoryStore } from "./modules/directory/directoryState.js";
import { adminLoad } from "./modules/admin/adminState.js";
import { adminStoreCreate, type AdminStore } from "./modules/admin/adminState.js";
import {
    agentImagesLoad,
    agentImagesOutputRoute,
} from "./modules/agent-images/agentImagesState.js";
import {
    agentImagesStoreCreate,
    type AgentImagesOutput,
    type AgentImagesStore,
} from "./modules/agent-images/agentImagesState.js";
import {
    setupBaseImagesLoad,
    setupOutputRoute,
    setupReconcile,
    setupSandboxProvidersLoad,
    setupStatusLoad,
} from "./modules/setup/setupState.js";
import { setupStoreCreate, type SetupOutput, type SetupStore } from "./modules/setup/setupState.js";
import {
    agentSecretsLoad,
    agentSecretsOutputRoute,
} from "./modules/agent-secrets/agentSecretsState.js";
import {
    agentSecretsStoreCreate,
    type AgentSecretsOutput,
    type AgentSecretsStore,
} from "./modules/agent-secrets/agentSecretsState.js";
import { threadLoad, type ThreadActionContext } from "./modules/thread/threadState.js";
import { threadMessageSend } from "./modules/thread/threadState.js";
import { threadOpen, type ThreadOpenContext } from "./modules/thread/threadState.js";
import {
    threadStoreCreate,
    type ThreadOutput,
    type ThreadStore,
} from "./modules/thread/threadState.js";
import type { ThreadHandle } from "./modules/thread/threadState.js";
import { threadsLoad } from "./modules/threads/threadsState.js";
import { threadsOutputRoute } from "./modules/threads/threadsState.js";
import {
    threadsStoreCreate,
    type ThreadsOutput,
    type ThreadsStore,
} from "./modules/threads/threadsState.js";
import {
    notificationsLoad,
    notificationsOutputRoute,
} from "./modules/notifications/notificationsState.js";
import {
    notificationsStoreCreate,
    type NotificationsOutput,
    type NotificationsStore,
} from "./modules/notifications/notificationsState.js";
import { callsLoad, callsOutputRoute } from "./modules/calls/callsState.js";
import { callsStoreCreate, type CallsOutput, type CallsStore } from "./modules/calls/callsState.js";
import { agentCreate } from "./modules/chat-actions/chatActionsState.js";
import { agentEffortChange } from "./modules/chat-actions/chatActionsState.js";
import { agentEffortLoad } from "./modules/chat-actions/chatActionsState.js";
import type { ChatActionContext } from "./modules/chat-actions/chatActionsState.js";
import { channelCreate } from "./modules/chat-actions/chatActionsState.js";
import { channelUpdate, type ChannelUpdateInput } from "./modules/chat-actions/chatActionsState.js";
import { chatJoin } from "./modules/chat-actions/chatActionsState.js";
import { chatLeave } from "./modules/chat-actions/chatActionsState.js";
import { chatReadMark } from "./modules/chat-actions/chatActionsState.js";
import { chatStarSet } from "./modules/chat-actions/chatActionsState.js";
import { directMessageCreate } from "./modules/chat-actions/chatActionsState.js";
import { groupDirectMessageCreate } from "./modules/chat-actions/chatActionsState.js";
import { typingSet } from "./modules/chat-actions/chatActionsState.js";
import { areaReconcile as areaReconcileAction } from "./modules/sync/syncState.js";

export type HappyStateEvent =
    | ComposerOutput
    | ChatOutput
    | FilesOutput
    | SearchOutput
    | SettingsOutput
    | WorkspaceOutput
    | WorkspaceFileOutput
    | ThreadOutput
    | ThreadsOutput
    | NotificationsOutput
    | CallsOutput
    | AgentImagesOutput
    | AgentSecretsOutput
    | SetupOutput;

export interface HappyStateOptions extends StateRuntimeOptions {
    readonly event?: (event: HappyStateEvent) => void;
    readonly draftUpdated?: (event: DraftUpdated) => void;
    readonly backgroundError?: (error: UserError) => void;
    readonly unknownSyncArea?: (area: string) => void;
}

/**
 * Owns shared dependencies and keyed store lifetimes. It exposes no root render snapshot; every
 * method is a store accessor or a thin forwarder into a same-named product action.
 */
export class HappyState implements AsyncDisposable, Disposable {
    private readonly composers = new StoreRegistry<string, ComposerStore>();
    private readonly chats = new StoreRegistry<string, ChatStore>();
    private readonly workspaces = new StoreRegistry<string, WorkspaceStore>();
    private readonly workspaceFiles = new StoreRegistry<string, WorkspaceFileStore>();
    private readonly threadSurfaces = new StoreRegistry<string, ThreadStore>();
    private readonly sidebarBinding = sidebarStoreCreate();
    private filesBinding?: FilesStore;
    private searchBinding?: SearchStore;
    private directoryBinding?: DirectoryStore;
    private adminBinding?: AdminStore;
    private setupBinding?: SetupStore;
    private agentImagesBinding?: AgentImagesStore;
    private agentSecretsBinding?: AgentSecretsStore;
    private notificationsBinding?: NotificationsStore;
    private threadsBinding?: ThreadsStore;
    private callsBinding?: CallsStore;
    private settingsBinding?: SettingsStore;
    private settingsCoordinator?: SettingsCoordinator;
    private readonly identities = new IdentityCatalog();
    private readonly sidebarChats: SidebarChatsProjector;
    private readonly runtime: StateRuntime;
    private readonly sync: SyncCoordinator;
    private readonly context: DraftActionContext &
        ChatOpenContext &
        WorkspaceOpenContext &
        WorkspaceFileOpenContext &
        ThreadOpenContext;
    private disposed = false;
    private readonly unknownSyncArea: (area: string) => void;
    private readonly eventListener: (event: HappyStateEvent) => void;

    constructor(options: HappyStateOptions = {}) {
        const backgroundError =
            options.backgroundError ?? options.onBackgroundError ?? (() => undefined);
        this.eventListener = options.event ?? (() => undefined);
        this.unknownSyncArea = options.unknownSyncArea ?? (() => undefined);
        this.runtime = new StateRuntime({
            ...options,
            onBackgroundError: options.onBackgroundError ?? backgroundError,
        });
        this.sidebarChats = new SidebarChatsProjector(this.runtime, this.identities);
        this.context = {
            composerGet: (scopeId) => this.composers.get(scopeId),
            draftUpdated: options.draftUpdated ?? (() => undefined),
            chatAcquire: (chatId) =>
                this.chats.getOrCreate(chatId, () =>
                    chatStoreCreate(chatId, (event) => this.eventRoute(event)),
                ),
            chatRelease: (chatId) => this.chats.release(chatId),
            chatLoad: (chatId) => this.chatLoad(chatId),
            workspaceAcquire: (chatId) =>
                this.workspaces.getOrCreate(chatId, () =>
                    workspaceStoreCreate(chatId, (event) => this.eventRoute(event)),
                ),
            workspaceRelease: (chatId) => this.workspaces.release(chatId),
            workspaceLoad: (chatId) => this.workspaceLoad(chatId),
            workspaceFileAcquire: (chatId, path) =>
                this.workspaceFiles.getOrCreate(workspaceFileKey(chatId, path), () =>
                    workspaceFileStoreCreate(chatId, path, (event) => this.eventRoute(event)),
                ),
            workspaceFileRelease: (chatId, path) =>
                this.workspaceFiles.release(workspaceFileKey(chatId, path)),
            workspaceFileLoad: (chatId, path) => this.workspaceFileLoad(chatId, path),
            threadAcquire: (rootMessageId) =>
                this.threadSurfaces.getOrCreate(rootMessageId, () =>
                    threadStoreCreate(rootMessageId, (event) => this.eventRoute(event)),
                ),
            threadRelease: (rootMessageId) => this.threadSurfaces.release(rootMessageId),
            threadLoad: (rootMessageId) => this.threadLoad(rootMessageId),
        };
        this.sync = new SyncCoordinator({
            runtime: this.runtime,
            identities: this.identities,
            sidebar: this.sidebarBinding,
            sidebarChats: this.sidebarChats,
            directoryGet: () => this.directoryBinding,
            callsGet: () => this.callsBinding,
            chatGet: (chatId) => this.chats.get(chatId),
            chatsGet: () => this.chatEntries(),
            areaReconcile: (area) => this.areaReconcile(area),
            resetReconcile: () => this.resetReconcile(),
            backgroundError,
        });
    }

    sidebar(): SidebarStore {
        return this.sidebarBinding;
    }

    files(): FilesStore {
        if (!this.filesBinding) {
            let binding: FilesStore;
            binding = filesStoreCreate((event) => this.eventRoute(event));
            this.filesBinding = binding;
            if (this.runtime.connected)
                this.runtime.background(filesLoad({ runtime: this.runtime, files: binding }));
        }
        return this.filesBinding;
    }

    search(): SearchStore {
        if (!this.searchBinding) {
            let binding: SearchStore;
            binding = searchStoreCreate((event) => this.eventRoute(event));
            this.searchBinding = binding;
        }
        return this.searchBinding;
    }

    directory(): DirectoryStore {
        if (!this.directoryBinding) {
            this.directoryBinding = directoryStoreCreate();
            if (this.runtime.connected)
                this.runtime.background(
                    directoryLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        directory: this.directoryBinding,
                    }),
                );
        }
        return this.directoryBinding;
    }

    admin(): AdminStore {
        if (!this.adminBinding) {
            this.adminBinding = adminStoreCreate();
            if (this.runtime.connected)
                this.runtime.background(
                    adminLoad({ runtime: this.runtime, admin: this.adminBinding }),
                );
        }
        return this.adminBinding;
    }

    agentImages(): AgentImagesStore {
        if (!this.agentImagesBinding) {
            this.agentImagesBinding = agentImagesStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    agentImagesLoad({ runtime: this.runtime, images: this.agentImagesBinding }),
                );
        }
        return this.agentImagesBinding;
    }

    /**
     * The onboarding surface store. Creating it kicks the initial durable status
     * load, which authoritatively determines the current setup route. Sub-resource
     * screens (sandbox providers, base images) are loaded on demand through the
     * dedicated reload methods so a background subscriber never fetches a screen
     * the administrator has not opened.
     */
    setup(): SetupStore {
        if (!this.setupBinding) {
            this.setupBinding = setupStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    setupStatusLoad({ runtime: this.runtime, setup: this.setupBinding }),
                );
        }
        return this.setupBinding;
    }

    /** Reloads the durable combined onboarding status without a user-initiated refresh. */
    setupStatusReload(): void {
        if (this.setupBinding && this.runtime.connected)
            this.runtime.background(
                setupStatusLoad({ runtime: this.runtime, setup: this.setupBinding }),
            );
    }

    /** Loads or freshly re-probes the sandbox providers for the provider-selection screen. */
    setupProvidersReload(): void {
        if (this.setupBinding && this.runtime.connected)
            this.runtime.background(
                setupSandboxProvidersLoad({ runtime: this.runtime, setup: this.setupBinding }),
            );
    }

    /** Loads the base-image catalog and selected image build output for the image screens. */
    setupBaseImagesReload(): void {
        if (this.setupBinding && this.runtime.connected)
            this.runtime.background(
                setupBaseImagesLoad({ runtime: this.runtime, setup: this.setupBinding }),
            );
    }

    agentSecrets(): AgentSecretsStore {
        if (!this.agentSecretsBinding) {
            this.agentSecretsBinding = agentSecretsStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    agentSecretsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        secrets: this.agentSecretsBinding,
                    }),
                );
        }
        return this.agentSecretsBinding;
    }

    threadOpen(rootMessageId: string): ThreadHandle {
        return threadOpen(this.context, rootMessageId);
    }

    threads(): ThreadsStore {
        if (!this.threadsBinding) {
            this.threadsBinding = threadsStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    threadsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        threads: this.threadsBinding,
                    }),
                );
        }
        return this.threadsBinding;
    }

    notifications(): NotificationsStore {
        if (!this.notificationsBinding) {
            this.notificationsBinding = notificationsStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    notificationsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        notifications: this.notificationsBinding,
                    }),
                );
        }
        return this.notificationsBinding;
    }

    calls(): CallsStore {
        if (!this.callsBinding) {
            this.callsBinding = callsStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    callsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        calls: this.callsBinding,
                    }),
                );
        }
        return this.callsBinding;
    }

    async fileDownload(fileId: string): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadFile", { fileId });
    }

    async fileUpload(body: FormData): Promise<import("./resources.js").UploadedFile> {
        return fileUpload({ runtime: this.runtime }, body);
    }

    async fileThumbnailDownload(fileId: string): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadFileThumbnail", { fileId });
    }

    async filePreviewDownload(fileId: string): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadFilePreview", { fileId });
    }

    async avatarSet(fileId: string): Promise<void> {
        const result = await this.runtime.operation("updateAvatar", { fileId });
        if (result.user.photoFileId)
            this.settingsBinding?.getState().settingsInput({
                type: "avatarSaved",
                fileId: result.user.photoFileId,
            });
    }

    async avatarUpload(body: FormData): Promise<import("./resources.js").UploadedFile> {
        return avatarUpload({ runtime: this.runtime }, body);
    }

    settings(options: SettingsStoreOptions = {}): SettingsStore {
        if (!this.settingsBinding) {
            let coordinator: SettingsCoordinator;
            this.settingsBinding = settingsStoreCreate(options, (event) => this.eventRoute(event));
            coordinator = new SettingsCoordinator(this.runtime, this.settingsBinding);
            this.settingsCoordinator = coordinator;
            this.runtime.background(coordinator.load());
        }
        return this.settingsBinding;
    }

    chatOpen(chatId: string): ChatHandle {
        return chatOpen(this.context, chatId);
    }

    composer(scopeId: string, options: ComposerStoreOptions = {}): ComposerStore {
        return this.composers.getOrCreate(scopeId, () =>
            composerStoreCreate(scopeId, {
                ...options,
                output: (event) => {
                    options.output?.(event);
                    this.eventRoute(event);
                },
            }),
        );
    }

    composerRelease(scopeId: string): void {
        this.composers.release(scopeId);
    }

    workspaceOpen(chatId: string): WorkspaceHandle {
        return workspaceOpen(this.context, chatId);
    }

    workspaceFileOpen(chatId: string, path: string): WorkspaceFileHandle {
        return workspaceFileOpen(this.context, chatId, path);
    }

    async syncStart(): Promise<void> {
        await syncStart(this.sync);
    }

    syncStop(): void {
        syncStop(this.sync);
    }

    draftUpdate(scopeId: string, text: string): void {
        draftUpdate(this.context satisfies DraftActionContext, scopeId, text);
    }

    messageSend(chatId: string, input: SendMessageInput): void {
        messageSend(this.messageContext(), chatId, input);
    }

    async messageEdit(
        chatId: string,
        messageId: string,
        text: string,
        expectedRevision: number,
    ): Promise<void> {
        await messageEdit(this.messageContext(), chatId, messageId, text, expectedRevision);
    }

    async messageDelete(chatId: string, messageId: string): Promise<void> {
        await messageDelete(this.messageContext(), chatId, messageId);
    }

    async messagePin(chatId: string, messageId: string): Promise<void> {
        await messagePin(this.messageContext(), chatId, messageId);
    }

    async messageUnpin(chatId: string, messageId: string): Promise<void> {
        await messageUnpin(this.messageContext(), chatId, messageId);
    }

    async reactionAdd(chatId: string, messageId: string, input: ReactionSelector): Promise<void> {
        await reactionAdd(this.messageContext(), chatId, messageId, input);
    }

    async reactionRemove(
        chatId: string,
        messageId: string,
        input: ReactionSelector,
    ): Promise<void> {
        await reactionRemove(this.messageContext(), chatId, messageId, input);
    }

    async chatReadMark(chatId: string, messageId?: string): Promise<void> {
        await chatReadMark(this.chatActionContext(), chatId, messageId);
    }

    async chatStarSet(chatId: string, starred: boolean): Promise<void> {
        await chatStarSet(this.chatActionContext(), chatId, starred);
    }

    async chatLeave(chatId: string): Promise<void> {
        await chatLeave(this.chatActionContext(), chatId);
    }

    async chatJoin(chatId: string): Promise<void> {
        await chatJoin(this.chatActionContext(), chatId);
    }

    async channelCreate(input: CreateChannelInput): Promise<void> {
        await channelCreate(this.chatActionContext(), input);
    }

    async agentCreate(input: CreateAgentInput): Promise<void> {
        await agentCreate(this.chatActionContext(), input);
    }

    async directMessageCreate(userId: string): Promise<void> {
        await directMessageCreate(this.chatActionContext(), userId);
    }

    async groupDirectMessageCreate(userIds: readonly string[], name?: string): Promise<void> {
        await groupDirectMessageCreate(this.chatActionContext(), userIds, name);
    }

    async channelUpdate(chatId: string, input: ChannelUpdateInput): Promise<void> {
        await channelUpdate(this.chatActionContext(), chatId, input);
    }

    typingSet(chatId: string, active: boolean): void {
        typingSet(this.chatActionContext(), chatId, active);
    }

    async whenIdle(): Promise<void> {
        await this.settingsCoordinator?.whenIdle();
        await this.runtime.whenIdle();
        await this.settingsCoordinator?.whenIdle();
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        syncStop(this.sync);
        this.runtime.stop();
        this.chats.dispose();
        this.workspaceFiles.dispose();
        this.workspaces.dispose();
        this.composers.dispose();
        this.threadSurfaces.dispose();
        this.settingsCoordinator?.[Symbol.dispose]();
        this.identities.clear();
        this.sidebarChats.clear();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this[Symbol.dispose]();
        await this.runtime.whenIdle();
    }

    /** The only cross-store boundary: route one globally discriminated store event. */
    private eventRoute(event: HappyStateEvent): void {
        this.eventHandle(event);
        this.eventListener(event);
    }

    /** Exhaustive central dispatch; stores never route or import one another. */
    private eventHandle(event: HappyStateEvent): void {
        switch (event.type) {
            case "textUpdated":
                draftUpdate(this.context, event.scopeId, event.text);
                return;
            case "attachmentAdded":
            case "attachmentRemoved":
                return;
            case "textSubmitted":
                messageSend(
                    this.messageContext(),
                    event.scopeId,
                    {
                        text: event.text,
                        attachmentFileIds: event.attachments.map((attachment) => attachment.id),
                    },
                    event.revision,
                );
                return;
            case "membersRetained":
                this.chatMembersLoad(event.chatId);
                return;
            case "pinsRetained":
                this.chatPinsLoad(event.chatId);
                return;
            case "reactionActorsRetained":
                this.reactionActorsLoad(event.chatId, event.messageId, event.reactionKey);
                return;
            case "agentEffortRetained":
                this.agentEffortLoad(event.chatId, event.agentUserId);
                return;
            case "agentEffortSubmitted":
                this.agentEffortChange(event.chatId, event.agentUserId, event.effort);
                return;
            case "directoriesUpdated":
                this.workspaceDirectoriesUpdate(event.chatId, event.directories);
                return;
            case "directoryMoreRequested":
                this.workspaceDirectoryMore(event.chatId, event.directory);
                return;
            case "contentSaveRequested":
                this.workspaceFileSave(event.chatId, event.path);
                return;
            case "fileDeleteRequested":
                this.workspaceFileDelete(event.chatId, event.path);
                return;
            case "threadReplySubmitted":
                this.backgroundIfConnected(() =>
                    threadMessageSend(this.threadContext(), event.rootMessageId, event.input),
                );
                return;
            case "filesMoreRequested":
                if (this.filesBinding)
                    this.backgroundIfConnected(() =>
                        filesLoad({ runtime: this.runtime, files: this.filesBinding! }, true),
                    );
                return;
            case "queryUpdated":
                if (this.searchBinding)
                    this.backgroundIfConnected(() =>
                        searchQueryUpdate(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                search: this.searchBinding!,
                            },
                            event.query,
                        ),
                    );
                return;
            case "displayNameUpdated":
            case "usernameUpdated":
            case "emailUpdated":
            case "phoneUpdated":
            case "availabilityUpdated":
            case "statusTextUpdated":
            case "statusEmojiUpdated":
            case "statusExpiryUpdated":
            case "dndUntilUpdated":
            case "directMessagesUpdated":
            case "mentionsUpdated":
            case "threadRepliesUpdated":
            case "reactionsUpdated":
            case "callsUpdated":
            case "emailNotificationsUpdated":
            case "desktopNotificationsUpdated":
            case "dndScheduleUpdated":
            case "timezoneUpdated":
                this.settingsCoordinator?.output(event);
                return;
            case "imageSelected":
            case "imageBuildSubmitted":
            case "defaultImageSubmitted":
            case "imageCreateSubmitted":
                if (this.agentImagesBinding)
                    this.backgroundIfConnected(() =>
                        agentImagesOutputRoute(
                            { runtime: this.runtime, images: this.agentImagesBinding! },
                            event,
                        ),
                    );
                return;
            case "sandboxProviderSelectSubmitted":
            case "baseImageSelectSubmitted":
            case "baseImageBuildRetrySubmitted":
            case "defaultAgentCreateSubmitted":
            case "registrationPolicyChooseSubmitted":
                if (this.setupBinding)
                    this.backgroundIfConnected(() =>
                        setupOutputRoute(
                            { runtime: this.runtime, setup: this.setupBinding! },
                            event,
                        ),
                    );
                return;
            case "secretCreateSubmitted":
            case "secretDeleteSubmitted":
            case "secretAgentAttached":
            case "secretAgentDetached":
            case "secretChannelAttached":
            case "secretChannelDetached":
                if (this.agentSecretsBinding)
                    this.backgroundIfConnected(() =>
                        agentSecretsOutputRoute(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                secrets: this.agentSecretsBinding!,
                            },
                            event,
                        ),
                    );
                return;
            case "threadsMoreRequested":
            case "threadReadSubmitted":
            case "threadSubscriptionSubmitted":
                if (this.threadsBinding)
                    this.backgroundIfConnected(() =>
                        threadsOutputRoute(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                threads: this.threadsBinding!,
                            },
                            event,
                        ),
                    );
                return;
            case "notificationsReadSubmitted":
            case "notificationsMoreRequested":
                if (this.notificationsBinding)
                    this.backgroundIfConnected(() =>
                        notificationsOutputRoute(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                notifications: this.notificationsBinding!,
                            },
                            event,
                        ),
                    );
                return;
            case "callCreateSubmitted":
            case "callJoinSubmitted":
            case "callDeclineSubmitted":
            case "callLeaveSubmitted":
            case "callEndSubmitted":
            case "callSignalSubmitted":
                if (this.callsBinding)
                    this.backgroundIfConnected(() =>
                        callsOutputRoute(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                calls: this.callsBinding!,
                            },
                            event,
                        ),
                    );
                return;
            default: {
                const exhaustive: never = event;
                throw new Error(`Unhandled HappyState event: ${JSON.stringify(exhaustive)}`);
            }
        }
    }

    private chatLoad(chatId: string): void {
        this.runtime.background(
            chatLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                },
                chatId,
            ),
        );
    }

    private chatMembersLoad(chatId: string): void {
        this.runtime.background(
            chatMembersLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                    presenceGet: (userId) => this.sync.presenceGet(userId),
                },
                chatId,
            ),
        );
    }

    private chatPinsLoad(chatId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(
            chatPinsLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                },
                chatId,
            ),
        );
    }

    private reactionActorsLoad(chatId: string, messageId: string, reactionKey: string): void {
        this.runtime.background(
            reactionActorsLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                },
                chatId,
                messageId,
                reactionKey,
            ),
        );
    }

    private agentEffortLoad(chatId: string, agentUserId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(agentEffortLoad(this.chatActionContext(), chatId, agentUserId));
    }

    private agentEffortChange(chatId: string, agentUserId: string, effort: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(
            agentEffortChange(this.chatActionContext(), chatId, agentUserId, effort),
        );
    }

    private areaReconcile(area: string): void {
        areaReconcileAction(
            {
                chatReconcile: (chatId) => this.chatLoad(chatId),
                workspaceReconcile: (chatId) => this.workspaceReconcile(chatId),
                callsReconcile: () => {
                    if (this.callsBinding)
                        this.runtime.background(
                            callsLoad({
                                runtime: this.runtime,
                                identities: this.identities,
                                calls: this.callsBinding,
                            }),
                        );
                },
                threadsReconcile: () => {
                    if (this.threadsBinding)
                        this.runtime.background(
                            threadsLoad({
                                runtime: this.runtime,
                                identities: this.identities,
                                threads: this.threadsBinding,
                            }),
                        );
                },
                notificationsReconcile: () => {
                    if (this.notificationsBinding)
                        this.runtime.background(
                            notificationsLoad({
                                runtime: this.runtime,
                                identities: this.identities,
                                notifications: this.notificationsBinding,
                            }),
                        );
                },
                agentImagesReconcile: () => {
                    if (this.agentImagesBinding)
                        this.runtime.background(
                            agentImagesLoad({
                                runtime: this.runtime,
                                images: this.agentImagesBinding,
                            }),
                        );
                },
                setupReconcile: () => {
                    if (this.setupBinding)
                        this.runtime.background(
                            setupReconcile({ runtime: this.runtime, setup: this.setupBinding }),
                        );
                },
                agentSecretsReconcile: () => {
                    if (this.agentSecretsBinding)
                        this.runtime.background(
                            agentSecretsLoad({
                                runtime: this.runtime,
                                identities: this.identities,
                                secrets: this.agentSecretsBinding,
                            }),
                        );
                },
                identitiesReconcile: () =>
                    this.runtime.background(
                        identitiesReconcile({
                            runtime: this.runtime,
                            identities: this.identities,
                            chatsGet: () => this.chatEntries(),
                            directoryReconcile: () => {
                                if (this.directoryBinding)
                                    this.runtime.background(
                                        directoryLoad({
                                            runtime: this.runtime,
                                            identities: this.identities,
                                            directory: this.directoryBinding,
                                        }),
                                    );
                            },
                            agentSecretsReconcile: () => {
                                if (this.agentSecretsBinding)
                                    this.runtime.background(
                                        agentSecretsLoad({
                                            runtime: this.runtime,
                                            identities: this.identities,
                                            secrets: this.agentSecretsBinding,
                                        }),
                                    );
                            },
                            sidebarIdentityReconcile: (identity) => {
                                for (const chat of this.sidebarChats.reconcileIdentity(identity))
                                    this.sidebarBinding.getState().sidebarInput({
                                        type: "chatSummaryUpserted",
                                        chat,
                                    });
                            },
                        }),
                    ),
                unknownArea: this.unknownSyncArea,
            },
            area,
        );
    }

    private resetReconcile(): void {
        for (const [chatId] of this.chats.values()) this.chatLoad(chatId);
        for (const [chatId] of this.workspaces.values()) this.workspaceReconcile(chatId);
        for (const [, binding] of this.workspaceFiles.values()) {
            const { chatId, path } = binding.getState();
            this.workspaceFileLoad(chatId, path);
        }
        for (const [rootMessageId] of this.threadSurfaces.values()) this.threadLoad(rootMessageId);
        const files = this.filesBinding;
        if (files && files.getState().status.type !== "unloaded")
            this.runtime.background(filesLoad({ runtime: this.runtime, files }));
        const search = this.searchBinding;
        const query = search?.getState().query;
        if (search && query)
            this.runtime.background(
                searchQueryUpdate(
                    {
                        runtime: this.runtime,
                        identities: this.identities,
                        search,
                    },
                    query,
                ),
            );
        if (this.directoryBinding)
            this.runtime.background(
                directoryLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    directory: this.directoryBinding,
                }),
            );
        if (this.adminBinding)
            this.runtime.background(adminLoad({ runtime: this.runtime, admin: this.adminBinding }));
        if (this.agentImagesBinding)
            this.runtime.background(
                agentImagesLoad({ runtime: this.runtime, images: this.agentImagesBinding }),
            );
        if (this.setupBinding)
            this.runtime.background(
                setupReconcile({ runtime: this.runtime, setup: this.setupBinding }),
            );
        if (this.agentSecretsBinding)
            this.runtime.background(
                agentSecretsLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    secrets: this.agentSecretsBinding,
                }),
            );
        if (this.threadsBinding)
            this.runtime.background(
                threadsLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    threads: this.threadsBinding,
                }),
            );
        if (this.notificationsBinding)
            this.runtime.background(
                notificationsLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    notifications: this.notificationsBinding,
                }),
            );
        if (this.callsBinding)
            this.runtime.background(
                callsLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    calls: this.callsBinding,
                }),
            );
        if (this.settingsCoordinator) this.runtime.background(this.settingsCoordinator.reload());
    }

    private messageContext() {
        return {
            runtime: this.runtime,
            identities: this.identities,
            chatGet: (chatId: string) => this.chats.get(chatId),
            chatPinsReconcile: (chatId: string) => {
                const pins = this.chats.get(chatId)?.getState().pins;
                if (pins?.type === "loading" || pins?.type === "ready") this.chatPinsLoad(chatId);
            },
            composerGet: (scopeId: string) => this.composers.get(scopeId),
        };
    }

    private chatActionContext(): ChatActionContext {
        return {
            runtime: this.runtime,
            sidebar: this.sidebarBinding,
            chatGet: (chatId) => this.chats.get(chatId),
            sidebarChatProject: (chat) => this.sidebarChats.projectOne(chat),
        };
    }

    private *chatEntries(): IterableIterator<readonly [string, ChatStore]> {
        yield* this.chats.values();
    }

    private workspaceContext(): WorkspaceActionContext {
        return {
            runtime: this.runtime,
            identities: this.identities,
            workspaceGet: (chatId) => this.workspaces.get(chatId),
        };
    }

    private workspaceFileContext(): WorkspaceFileActionContext {
        return {
            runtime: this.runtime,
            workspaceFileGet: (chatId, path) =>
                this.workspaceFiles.get(workspaceFileKey(chatId, path)),
            workspaceReconcile: (chatId) => this.workspaceReconcile(chatId),
        };
    }

    private workspaceLoad(chatId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceLoad(this.workspaceContext(), chatId));
    }

    private workspaceDirectoriesUpdate(chatId: string, directories: readonly string[]): void {
        if (!this.runtime.connected) return;
        this.runtime.background(
            workspaceDirectoriesUpdate(this.workspaceContext(), chatId, directories),
        );
    }

    private workspaceDirectoryMore(chatId: string, directory: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceDirectoryMore(this.workspaceContext(), chatId, directory));
    }

    private workspaceReconcile(chatId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceReconcile(this.workspaceContext(), chatId));
    }

    private workspaceFileLoad(chatId: string, path: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceFileLoad(this.workspaceFileContext(), chatId, path));
    }

    private workspaceFileSave(chatId: string, path: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceFileSave(this.workspaceFileContext(), chatId, path));
    }

    private workspaceFileDelete(chatId: string, path: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(workspaceFileDelete(this.workspaceFileContext(), chatId, path));
    }

    private threadContext(): ThreadActionContext {
        return {
            runtime: this.runtime,
            identities: this.identities,
            threadGet: (rootMessageId) => this.threadSurfaces.get(rootMessageId),
        };
    }

    private threadLoad(rootMessageId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(threadLoad(this.threadContext(), rootMessageId));
    }

    private backgroundIfConnected(task: () => Promise<void>): void {
        if (this.runtime.connected && this.runtime.active) this.runtime.background(task());
    }
}

export function happyStateCreate(options: HappyStateOptions = {}): HappyState {
    return new HappyState(options);
}

function workspaceFileKey(chatId: string, path: string): string {
    return `${chatId}\u0000${path}`;
}
