import { StoreRegistry } from "./kernel/storeRegistry.js";
import { chatLoad } from "./modules/chat/chatLoad.js";
import { chatMembersLoad } from "./modules/chat/chatMembersLoad.js";
import { chatPinsLoad } from "./modules/chat/chatPinsLoad.js";
import { chatOpen, type ChatOpenContext } from "./modules/chat/chatOpen.js";
import { chatOutputRoute } from "./modules/chat/chatOutputRoute.js";
import { reactionActorsLoad } from "./modules/chat/reactionActorsLoad.js";
import { chatStoreCreateBinding, type ChatStoreBinding } from "./modules/chat/chatStore.js";
import type { ChatHandle } from "./modules/chat/chatTypes.js";
import {
    composerStoreCreateBinding,
    type ComposerStoreBinding,
    type ComposerStoreOptions,
} from "./modules/composer/composerStore.js";
import {
    composerOutputRoute,
    type ComposerOutputContext,
} from "./modules/composer/composerOutputRoute.js";
import type { ComposerOutput, ComposerStore } from "./modules/composer/composerTypes.js";
import {
    draftUpdate,
    type DraftActionContext,
    type DraftUpdated,
} from "./modules/draft/draftUpdate.js";
import { IdentityCatalog } from "./modules/identity/identityCatalog.js";
import { identitiesReconcile } from "./modules/identity/identitiesReconcile.js";
import { messageDelete } from "./modules/message/messageDelete.js";
import { messageEdit } from "./modules/message/messageEdit.js";
import { messageSend } from "./modules/message/messageSend.js";
import { messagePin } from "./modules/message/messagePin.js";
import { messageUnpin } from "./modules/message/messageUnpin.js";
import { reactionAdd } from "./modules/reaction/reactionAdd.js";
import { reactionRemove } from "./modules/reaction/reactionRemove.js";
import type { ReactionSelector } from "./modules/reaction/reactionTypes.js";
import { filesLoad } from "./modules/files/filesLoad.js";
import { fileUpload } from "./modules/files/fileUpload.js";
import { filesStoreCreateBinding, type FilesStoreBinding } from "./modules/files/filesStore.js";
import type { FilesStore } from "./modules/files/filesTypes.js";
import { StateRuntime, type StateRuntimeOptions } from "./modules/runtime/stateRuntime.js";
import { sidebarStoreCreateBinding } from "./modules/sidebar/sidebarStore.js";
import type { SidebarStore } from "./modules/sidebar/sidebarTypes.js";
import { SidebarChatsProjector } from "./modules/sidebar/sidebarChatsProject.js";
import { SettingsCoordinator } from "./modules/settings/settingsCoordinator.js";
import { avatarUpload } from "./modules/settings/avatarUpload.js";
import {
    settingsStoreCreateBinding,
    type SettingsStoreBinding,
} from "./modules/settings/settingsStore.js";
import type { SettingsStore, SettingsStoreOptions } from "./modules/settings/settingsTypes.js";
import { SyncCoordinator } from "./modules/sync/syncCoordinator.js";
import { syncStart } from "./modules/sync/syncStart.js";
import { syncStop } from "./modules/sync/syncStop.js";
import type { WorkspaceActionContext } from "./modules/workspace/workspaceActionContext.js";
import { workspaceDirectoriesUpdate } from "./modules/workspace/workspaceDirectoriesUpdate.js";
import { workspaceDirectoryMore } from "./modules/workspace/workspaceDirectoryMore.js";
import { workspaceLoad } from "./modules/workspace/workspaceLoad.js";
import { workspaceOpen, type WorkspaceOpenContext } from "./modules/workspace/workspaceOpen.js";
import {
    workspaceOutputRoute,
    type WorkspaceOutputContext,
} from "./modules/workspace/workspaceOutputRoute.js";
import { workspaceReconcile } from "./modules/workspace/workspaceReconcile.js";
import {
    workspaceStoreCreateBinding,
    type WorkspaceStoreBinding,
} from "./modules/workspace/workspaceStore.js";
import type { WorkspaceHandle } from "./modules/workspace/workspaceTypes.js";
import type { WorkspaceFileActionContext } from "./modules/workspace-file/workspaceFileActionContext.js";
import { workspaceFileDelete } from "./modules/workspace-file/workspaceFileDelete.js";
import { workspaceFileLoad } from "./modules/workspace-file/workspaceFileLoad.js";
import {
    workspaceFileOpen,
    type WorkspaceFileOpenContext,
} from "./modules/workspace-file/workspaceFileOpen.js";
import {
    workspaceFileOutputRoute,
    type WorkspaceFileOutputContext,
} from "./modules/workspace-file/workspaceFileOutputRoute.js";
import { workspaceFileSave } from "./modules/workspace-file/workspaceFileSave.js";
import {
    workspaceFileStoreCreateBinding,
    type WorkspaceFileStoreBinding,
} from "./modules/workspace-file/workspaceFileStore.js";
import type { WorkspaceFileHandle } from "./modules/workspace-file/workspaceFileTypes.js";
import type { CreateAgentInput, CreateChannelInput, SendMessageInput, UserError } from "./types.js";
import { searchQueryUpdate } from "./modules/search/searchQueryUpdate.js";
import { searchStoreCreateBinding, type SearchStoreBinding } from "./modules/search/searchStore.js";
import type { SearchStore } from "./modules/search/searchTypes.js";
import { directoryLoad } from "./modules/directory/directoryLoad.js";
import {
    directoryStoreCreateBinding,
    type DirectoryStoreBinding,
} from "./modules/directory/directoryStore.js";
import type { DirectoryStore } from "./modules/directory/directoryTypes.js";
import { adminLoad } from "./modules/admin/adminLoad.js";
import { adminStoreCreateBinding, type AdminStoreBinding } from "./modules/admin/adminStore.js";
import type { AdminStore } from "./modules/admin/adminTypes.js";
import {
    agentImagesLoad,
    agentImagesOutputRoute,
} from "./modules/agent-images/agentImagesRoute.js";
import {
    agentImagesStoreCreateBinding,
    type AgentImagesStoreBinding,
} from "./modules/agent-images/agentImagesStore.js";
import type { AgentImagesStore } from "./modules/agent-images/agentImagesTypes.js";
import {
    setupBaseImagesLoad,
    setupOutputRoute,
    setupReconcile,
    setupSandboxProvidersLoad,
    setupStatusLoad,
} from "./modules/setup/setupRoute.js";
import { setupStoreCreateBinding, type SetupStoreBinding } from "./modules/setup/setupStore.js";
import type { SetupStore } from "./modules/setup/setupTypes.js";
import {
    agentSecretsLoad,
    agentSecretsOutputRoute,
} from "./modules/agent-secrets/agentSecretsRoute.js";
import {
    agentSecretsStoreCreateBinding,
    type AgentSecretsStoreBinding,
} from "./modules/agent-secrets/agentSecretsStore.js";
import type { AgentSecretsStore } from "./modules/agent-secrets/agentSecretsTypes.js";
import { threadLoad, type ThreadActionContext } from "./modules/thread/threadLoad.js";
import { threadMessageSend } from "./modules/thread/threadMessageSend.js";
import { threadOpen, type ThreadOpenContext } from "./modules/thread/threadOpen.js";
import { threadStoreCreateBinding, type ThreadStoreBinding } from "./modules/thread/threadStore.js";
import type { ThreadHandle } from "./modules/thread/threadTypes.js";
import { threadsLoad } from "./modules/threads/threadsLoad.js";
import { threadsOutputRoute } from "./modules/threads/threadsOutputRoute.js";
import {
    threadsStoreCreateBinding,
    type ThreadsStoreBinding,
} from "./modules/threads/threadsStore.js";
import type { ThreadsStore } from "./modules/threads/threadsTypes.js";
import {
    notificationsLoad,
    notificationsOutputRoute,
} from "./modules/notifications/notificationsRoute.js";
import {
    notificationsStoreCreateBinding,
    type NotificationsStoreBinding,
} from "./modules/notifications/notificationsStore.js";
import type { NotificationsStore } from "./modules/notifications/notificationsTypes.js";
import { callsLoad, callsOutputRoute } from "./modules/calls/callsRoute.js";
import { callsStoreCreateBinding, type CallsStoreBinding } from "./modules/calls/callsStore.js";
import type { CallsStore } from "./modules/calls/callsTypes.js";
import { agentCreate } from "./modules/chat-actions/agentCreate.js";
import { agentEffortChange } from "./modules/chat-actions/agentEffortChange.js";
import { agentEffortLoad } from "./modules/chat-actions/agentEffortLoad.js";
import type { ChatActionContext } from "./modules/chat-actions/chatActionContext.js";
import { channelCreate } from "./modules/chat-actions/channelCreate.js";
import { channelUpdate, type ChannelUpdateInput } from "./modules/chat-actions/channelUpdate.js";
import { chatJoin } from "./modules/chat-actions/chatJoin.js";
import { chatLeave } from "./modules/chat-actions/chatLeave.js";
import { chatReadMark } from "./modules/chat-actions/chatReadMark.js";
import { chatStarSet } from "./modules/chat-actions/chatStarSet.js";
import { directMessageCreate } from "./modules/chat-actions/directMessageCreate.js";
import { groupDirectMessageCreate } from "./modules/chat-actions/groupDirectMessageCreate.js";
import { typingSet } from "./modules/chat-actions/typingSet.js";
import { areaReconcile as areaReconcileAction } from "./modules/sync/areaReconcile.js";

export interface HappyStateOptions extends StateRuntimeOptions {
    readonly composerOutput?: (event: ComposerOutput) => void;
    readonly draftUpdated?: (event: DraftUpdated) => void;
    readonly backgroundError?: (error: UserError) => void;
    readonly unknownSyncArea?: (area: string) => void;
}

/**
 * Owns shared dependencies and keyed store lifetimes. It exposes no root render snapshot; every
 * method is a store accessor or a thin forwarder into a same-named product action.
 */
export class HappyState implements AsyncDisposable, Disposable {
    private readonly composers = new StoreRegistry<string, ComposerStoreBinding>();
    private readonly chats = new StoreRegistry<string, ChatStoreBinding>();
    private readonly workspaces = new StoreRegistry<string, WorkspaceStoreBinding>();
    private readonly workspaceFiles = new StoreRegistry<string, WorkspaceFileStoreBinding>();
    private readonly threadSurfaces = new StoreRegistry<string, ThreadStoreBinding>();
    private readonly sidebarBinding = sidebarStoreCreateBinding();
    private filesBinding?: FilesStoreBinding;
    private searchBinding?: SearchStoreBinding;
    private directoryBinding?: DirectoryStoreBinding;
    private adminBinding?: AdminStoreBinding;
    private setupBinding?: SetupStoreBinding;
    private agentImagesBinding?: AgentImagesStoreBinding;
    private agentSecretsBinding?: AgentSecretsStoreBinding;
    private notificationsBinding?: NotificationsStoreBinding;
    private threadsBinding?: ThreadsStoreBinding;
    private callsBinding?: CallsStoreBinding;
    private settingsBinding?: SettingsStoreBinding;
    private settingsCoordinator?: SettingsCoordinator;
    private readonly identities = new IdentityCatalog();
    private readonly sidebarChats: SidebarChatsProjector;
    private readonly runtime: StateRuntime;
    private readonly sync: SyncCoordinator;
    private readonly context: ComposerOutputContext &
        ChatOpenContext &
        WorkspaceOpenContext &
        WorkspaceOutputContext &
        WorkspaceFileOpenContext &
        WorkspaceFileOutputContext &
        ThreadOpenContext;
    private disposed = false;
    private readonly unknownSyncArea: (area: string) => void;

    constructor(options: HappyStateOptions = {}) {
        const backgroundError =
            options.backgroundError ?? options.onBackgroundError ?? (() => undefined);
        this.unknownSyncArea = options.unknownSyncArea ?? (() => undefined);
        this.runtime = new StateRuntime({
            ...options,
            onBackgroundError: options.onBackgroundError ?? backgroundError,
        });
        this.sidebarChats = new SidebarChatsProjector(this.runtime, this.identities);
        this.context = {
            composerGet: (scopeId) => this.composers.get(scopeId),
            composerOutput: options.composerOutput ?? (() => undefined),
            draftUpdated: options.draftUpdated ?? (() => undefined),
            messageSend: (chatId, input, revision) =>
                messageSend(this.messageContext(), chatId, input, revision),
            chatAcquire: (chatId) =>
                this.chats.getOrCreate(chatId, () =>
                    chatStoreCreateBinding(chatId, (event) =>
                        chatOutputRoute(
                            {
                                chatMembersLoad: (id) => this.chatMembersLoad(id),
                                chatPinsLoad: (id) => this.chatPinsLoad(id),
                                reactionActorsLoad: (id, messageId, reactionKey) =>
                                    this.reactionActorsLoad(id, messageId, reactionKey),
                                agentEffortLoad: (id, agentUserId) =>
                                    this.agentEffortLoad(id, agentUserId),
                                agentEffortChange: (id, agentUserId, effort) =>
                                    this.agentEffortChange(id, agentUserId, effort),
                            },
                            event,
                        ),
                    ),
                ),
            chatRelease: (chatId) => this.chats.release(chatId),
            chatLoad: (chatId) => this.chatLoad(chatId),
            workspaceAcquire: (chatId) =>
                this.workspaces.getOrCreate(chatId, () =>
                    workspaceStoreCreateBinding(chatId, (event) =>
                        workspaceOutputRoute(this.context, event),
                    ),
                ),
            workspaceRelease: (chatId) => this.workspaces.release(chatId),
            workspaceLoad: (chatId) => this.workspaceLoad(chatId),
            workspaceDirectoriesUpdate: (chatId, directories) =>
                this.workspaceDirectoriesUpdate(chatId, directories),
            workspaceDirectoryMore: (chatId, directory) =>
                this.workspaceDirectoryMore(chatId, directory),
            workspaceFileAcquire: (chatId, path) =>
                this.workspaceFiles.getOrCreate(workspaceFileKey(chatId, path), () =>
                    workspaceFileStoreCreateBinding(chatId, path, (event) =>
                        workspaceFileOutputRoute(this.context, event),
                    ),
                ),
            workspaceFileRelease: (chatId, path) =>
                this.workspaceFiles.release(workspaceFileKey(chatId, path)),
            workspaceFileLoad: (chatId, path) => this.workspaceFileLoad(chatId, path),
            workspaceFileSave: (chatId, path) => this.workspaceFileSave(chatId, path),
            workspaceFileDelete: (chatId, path) => this.workspaceFileDelete(chatId, path),
            threadAcquire: (rootMessageId) =>
                this.threadSurfaces.getOrCreate(rootMessageId, () =>
                    threadStoreCreateBinding(rootMessageId, (event) =>
                        this.backgroundIfConnected(() =>
                            threadMessageSend(
                                this.threadContext(),
                                event.rootMessageId,
                                event.input,
                            ),
                        ),
                    ),
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
        return this.sidebarBinding.store;
    }

    files(): FilesStore {
        if (!this.filesBinding) {
            let binding: FilesStoreBinding;
            binding = filesStoreCreateBinding(() => {
                if (this.runtime.connected)
                    this.runtime.background(
                        filesLoad({ runtime: this.runtime, files: binding }, true),
                    );
            });
            this.filesBinding = binding;
            if (this.runtime.connected)
                this.runtime.background(filesLoad({ runtime: this.runtime, files: binding }));
        }
        return this.filesBinding.store;
    }

    search(): SearchStore {
        if (!this.searchBinding) {
            let binding: SearchStoreBinding;
            binding = searchStoreCreateBinding((event) => {
                if (this.runtime.connected)
                    this.runtime.background(
                        searchQueryUpdate(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                search: binding,
                            },
                            event.query,
                        ),
                    );
            });
            this.searchBinding = binding;
        }
        return this.searchBinding.store;
    }

    directory(): DirectoryStore {
        if (!this.directoryBinding) {
            this.directoryBinding = directoryStoreCreateBinding();
            if (this.runtime.connected)
                this.runtime.background(
                    directoryLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        directory: this.directoryBinding,
                    }),
                );
        }
        return this.directoryBinding.store;
    }

    admin(): AdminStore {
        if (!this.adminBinding) {
            this.adminBinding = adminStoreCreateBinding();
            if (this.runtime.connected)
                this.runtime.background(
                    adminLoad({ runtime: this.runtime, admin: this.adminBinding }),
                );
        }
        return this.adminBinding.store;
    }

    agentImages(): AgentImagesStore {
        if (!this.agentImagesBinding) {
            this.agentImagesBinding = agentImagesStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    agentImagesOutputRoute(
                        { runtime: this.runtime, images: this.agentImagesBinding! },
                        event,
                    ),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    agentImagesLoad({ runtime: this.runtime, images: this.agentImagesBinding }),
                );
        }
        return this.agentImagesBinding.store;
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
            this.setupBinding = setupStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    setupOutputRoute({ runtime: this.runtime, setup: this.setupBinding! }, event),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    setupStatusLoad({ runtime: this.runtime, setup: this.setupBinding }),
                );
        }
        return this.setupBinding.store;
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
            this.agentSecretsBinding = agentSecretsStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    agentSecretsOutputRoute(
                        {
                            runtime: this.runtime,
                            identities: this.identities,
                            secrets: this.agentSecretsBinding!,
                        },
                        event,
                    ),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    agentSecretsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        secrets: this.agentSecretsBinding,
                    }),
                );
        }
        return this.agentSecretsBinding.store;
    }

    threadOpen(rootMessageId: string): ThreadHandle {
        return threadOpen(this.context, rootMessageId);
    }

    threads(): ThreadsStore {
        if (!this.threadsBinding) {
            this.threadsBinding = threadsStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    threadsOutputRoute(
                        {
                            runtime: this.runtime,
                            identities: this.identities,
                            threads: this.threadsBinding!,
                        },
                        event,
                    ),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    threadsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        threads: this.threadsBinding,
                    }),
                );
        }
        return this.threadsBinding.store;
    }

    notifications(): NotificationsStore {
        if (!this.notificationsBinding) {
            this.notificationsBinding = notificationsStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    notificationsOutputRoute(
                        {
                            runtime: this.runtime,
                            identities: this.identities,
                            notifications: this.notificationsBinding!,
                        },
                        event,
                    ),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    notificationsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        notifications: this.notificationsBinding,
                    }),
                );
        }
        return this.notificationsBinding.store;
    }

    calls(): CallsStore {
        if (!this.callsBinding) {
            this.callsBinding = callsStoreCreateBinding((event) =>
                this.backgroundIfConnected(() =>
                    callsOutputRoute(
                        {
                            runtime: this.runtime,
                            identities: this.identities,
                            calls: this.callsBinding!,
                        },
                        event,
                    ),
                ),
            );
            if (this.runtime.connected)
                this.runtime.background(
                    callsLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        calls: this.callsBinding,
                    }),
                );
        }
        return this.callsBinding.store;
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
            this.settingsBinding?.settingsInput({
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
            this.settingsBinding = settingsStoreCreateBinding(options, (event) =>
                coordinator.output(event),
            );
            coordinator = new SettingsCoordinator(this.runtime, this.settingsBinding);
            this.settingsCoordinator = coordinator;
            this.runtime.background(coordinator.load());
        }
        return this.settingsBinding.store;
    }

    chatOpen(chatId: string): ChatHandle {
        return chatOpen(this.context, chatId);
    }

    composer(scopeId: string, options: ComposerStoreOptions = {}): ComposerStore {
        return this.composers.getOrCreate(scopeId, () =>
            composerStoreCreateBinding(scopeId, {
                ...options,
                output: (event) => {
                    options.output?.(event);
                    composerOutputRoute(this.context, event);
                },
            }),
        ).store;
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
        this.sidebarBinding.dispose();
        this.searchBinding?.dispose();
        this.filesBinding?.dispose();
        this.directoryBinding?.dispose();
        this.adminBinding?.dispose();
        this.setupBinding?.dispose();
        this.agentImagesBinding?.dispose();
        this.agentSecretsBinding?.dispose();
        this.notificationsBinding?.dispose();
        this.threadsBinding?.dispose();
        this.callsBinding?.dispose();
        this.threadSurfaces.dispose();
        this.settingsCoordinator?.[Symbol.dispose]();
        this.settingsBinding?.dispose();
        this.identities.clear();
        this.sidebarChats.clear();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this[Symbol.dispose]();
        await this.runtime.whenIdle();
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
                                    this.sidebarBinding.sidebarInput({
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
            const { chatId, path } = binding.store.get();
            this.workspaceFileLoad(chatId, path);
        }
        for (const [rootMessageId] of this.threadSurfaces.values()) this.threadLoad(rootMessageId);
        const files = this.filesBinding;
        if (files && files.store.get().status.type !== "unloaded")
            this.runtime.background(filesLoad({ runtime: this.runtime, files }));
        const search = this.searchBinding;
        const query = search?.store.get().query;
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
                const pins = this.chats.get(chatId)?.store.get().pins;
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

    private *chatEntries(): IterableIterator<readonly [string, ChatStoreBinding]> {
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
