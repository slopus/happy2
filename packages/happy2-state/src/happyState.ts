import { StoreRegistry } from "./kernel/storeRegistry.js";
import {
    agentTraceLoad,
    agentTraceOpen,
    agentTraceReconcile,
    agentTraceStoreCreate,
    type AgentTraceHandle,
    type AgentTraceOpenContext,
    type AgentTraceStore,
} from "./modules/agent-trace/agentTraceState.js";
import {
    mcpAppLoad,
    mcpAppOpen,
    mcpAppResourceRead,
    mcpAppStoreCreate,
    mcpAppToolCall,
    type McpAppHandle,
    type McpAppOpenContext,
    type McpAppStore,
} from "./modules/mcp-apps/mcpAppState.js";
import {
    documentAttach,
    documentCreate,
    documentDelete,
    documentDetach,
    documentFlushSchedule,
    documentLeaveAnnounce,
    documentLoad,
    documentOpen,
    documentPresenceSchedule,
    documentReconcile,
    documentRename,
    documentStandaloneCreate,
    documentSessionStop,
    documentStoreCreate,
    documentSynchronize,
    type DocumentActionContext,
    type DocumentHandle,
    type DocumentOpenContext,
    type DocumentOutput,
    type DocumentStore,
} from "./modules/document/documentState.js";
import {
    documentListLoad,
    documentListOpen,
    documentListStoreCreate,
    type DocumentListHandle,
    type DocumentListOpenContext,
    type DocumentListStore,
} from "./modules/document-list/documentListState.js";
import {
    documentCollectionLoad,
    documentCollectionStoreCreate,
    type DocumentCollectionStore,
} from "./modules/document-collection/documentCollectionState.js";
import {
    chatContributionsLoad,
    chatContributionsOpen,
    chatContributionsStoreCreate,
    pluginAppInstanceStoreCreate,
    pluginAppLoad,
    pluginAppOpen,
    pluginAppResourceRead,
    pluginAppToolCall,
    pluginContributionOutputRoute,
    pluginNavigationLoad,
    pluginNavigationStoreCreate,
    pluginUiAssetRead,
    type ChatContributionsHandle,
    type ChatContributionsOpenContext,
    type ChatContributionsOutput,
    type ChatContributionsStore,
    type PluginAppHandle,
    type PluginAppInstanceStore,
    type PluginAppOpenContext,
    type PluginNavigationOutput,
    type PluginNavigationStore,
} from "./modules/plugin-surfaces/pluginSurfacesState.js";
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
import { DraftCoordinator } from "./modules/draft/draftState.js";
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
import { sidebarProjectsLoad } from "./modules/sidebar/sidebarState.js";
import type { SidebarStore } from "./modules/sidebar/sidebarState.js";
import { SidebarChatsProjector } from "./modules/sidebar/sidebarState.js";
import { SettingsCoordinator } from "./modules/settings/settingsState.js";
import { avatarUpload } from "./modules/settings/settingsState.js";
import { developmentTokenCreate } from "./modules/settings/settingsState.js";
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
import type {
    ChatSummary,
    CreateAgentInput,
    CreateChannelInput,
    CreateChildChannelInput,
    CreateProjectInput,
    DocumentSummary,
    MessageAudience,
    MessageSummary,
    SendMessageInput,
} from "./types.js";
import { UserError } from "./types.js";
import { searchQueryUpdate } from "./modules/search/searchState.js";
import {
    searchStoreCreate,
    type SearchOutput,
    type SearchStore,
} from "./modules/search/searchState.js";
import { directoryLoad } from "./modules/directory/directoryState.js";
import { directoryStoreCreate, type DirectoryStore } from "./modules/directory/directoryState.js";
import { agentModelsLoad } from "./modules/agent-models/agentModelsState.js";
import {
    agentModelsStoreCreate,
    type AgentModelsStore,
} from "./modules/agent-models/agentModelsState.js";
import { adminLoad, adminOutputRoute } from "./modules/admin/adminState.js";
import {
    adminStoreCreate,
    type AdminOutput,
    type AdminSection,
    type AdminStore,
} from "./modules/admin/adminState.js";
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
    pluginsLoad,
    pluginsOutputRoute,
    pluginsUpdateChecksStop,
    pluginsUpdateStreamsStop,
} from "./modules/plugins/pluginsState.js";
import { chatPluginRequestDecide, chatPluginRequestsLoad } from "./modules/chat/chatState.js";
import {
    chatDocumentWriteRequestDecide,
    chatDocumentWriteRequestsLoad,
} from "./modules/chat/chatState.js";
import {
    chatPortShareDisable,
    chatPortShareOpen,
    chatPortSharesLoad,
    type PortShareAccess,
} from "./modules/chat/chatState.js";
import { PortShareLeaseCoordinator } from "./modules/port-share-lease/portShareLeaseState.js";
import {
    permissionsLoad,
    permissionsStoreCreate,
    type PermissionsStore,
} from "./modules/permissions/permissionsState.js";
import { rolesLoad, rolesOutputRoute } from "./modules/roles/rolesState.js";
import { rolesStoreCreate, type RolesOutput, type RolesStore } from "./modules/roles/rolesState.js";
import {
    pluginsStoreCreate,
    type PluginsOutput,
    type PluginsStore,
} from "./modules/plugins/pluginsState.js";
import {
    pluginInstallOutputRoute,
    pluginInstallPrepareStop,
    pluginInstallStoreCreate,
    type PluginInstallOutput,
    type PluginInstallStore,
} from "./modules/plugin-install/pluginInstallState.js";
import {
    agentSecretsStoreCreate,
    type AgentSecretsOutput,
    type AgentSecretsStore,
} from "./modules/agent-secrets/agentSecretsState.js";
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
import { terminalOpen, type TerminalHandle } from "./modules/terminal/terminalState.js";
import { agentConversationCreate } from "./modules/chat-actions/chatActionsState.js";
import { agentCreate } from "./modules/chat-actions/chatActionsState.js";
import { agentEffortChange } from "./modules/chat-actions/chatActionsState.js";
import { agentEffortLoad } from "./modules/chat-actions/chatActionsState.js";
import type { ChatActionContext } from "./modules/chat-actions/chatActionsState.js";
import { channelCreate } from "./modules/chat-actions/chatActionsState.js";
import { projectCreate } from "./modules/chat-actions/chatActionsState.js";
import { channelCreateChild } from "./modules/chat-actions/chatActionsState.js";
import { channelArchive } from "./modules/chat-actions/chatActionsState.js";
import { channelUnarchive } from "./modules/chat-actions/chatActionsState.js";
import { channelDefaultAgentUpdate } from "./modules/chat-actions/chatActionsState.js";
import { channelUpdate, type ChannelUpdateInput } from "./modules/chat-actions/chatActionsState.js";
import { chatJoin } from "./modules/chat-actions/chatActionsState.js";
import { chatLeave } from "./modules/chat-actions/chatActionsState.js";
import { chatReadMark } from "./modules/chat-actions/chatActionsState.js";
import { chatStarSet } from "./modules/chat-actions/chatActionsState.js";
import { directMessageCreate } from "./modules/chat-actions/chatActionsState.js";
import { groupDirectMessageCreate } from "./modules/chat-actions/chatActionsState.js";
import { typingSet } from "./modules/chat-actions/chatActionsState.js";
import { areaReconcile as areaReconcileAction } from "./modules/sync/syncState.js";
import type { EffectivePermissions } from "./resources.js";

export type HappyStateEvent =
    | ComposerOutput
    | ChatOutput
    | FilesOutput
    | SearchOutput
    | SettingsOutput
    | WorkspaceOutput
    | WorkspaceFileOutput
    | NotificationsOutput
    | CallsOutput
    | AgentImagesOutput
    | AgentSecretsOutput
    | PluginsOutput
    | RolesOutput
    | AdminOutput
    | PluginInstallOutput
    | SetupOutput
    | DocumentOutput
    | PluginNavigationOutput
    | ChatContributionsOutput;

export interface HappyStateOptions extends StateRuntimeOptions {
    readonly event?: (event: HappyStateEvent) => void;
    readonly backgroundError?: (error: UserError) => void;
    readonly unknownSyncArea?: (area: string) => void;
    /** Authoritative permissions already returned by the session's `/v0/me` request. */
    readonly initialPermissions?: EffectivePermissions;
    /**
     * Opens a port share in an external browser window. Supplied by application
     * code because reserving the window and performing the cross-origin cookie
     * exchange are platform concerns; a client without it reports opens as a
     * displayable failure instead.
     */
    readonly portShareAccess?: PortShareAccess;
}

/**
 * Owns shared dependencies and keyed store lifetimes. It exposes no root render snapshot; every
 * method is a store accessor or a thin forwarder into a same-named product action.
 */
export class HappyState implements AsyncDisposable, Disposable {
    private readonly composers = new StoreRegistry<string, ComposerStore>();
    /** Session-only memory of each chat's last composer audience mode and agent selection. */
    private readonly composerAudiences = new Map<
        string,
        { audience: MessageAudience; agentUserIds: readonly string[] }
    >();
    private readonly chats = new StoreRegistry<string, ChatStore>();
    private readonly workspaces = new StoreRegistry<string, WorkspaceStore>();
    private readonly workspaceFiles = new StoreRegistry<string, WorkspaceFileStore>();
    private readonly agentTraces = new StoreRegistry<string, AgentTraceStore>();
    private readonly mcpApps = new StoreRegistry<string, McpAppStore>();
    private readonly documents = new StoreRegistry<string, DocumentStore>();
    private readonly documentLists = new StoreRegistry<string, DocumentListStore>();
    private documentCollectionBinding?: DocumentCollectionStore;
    private readonly pluginApps = new StoreRegistry<string, PluginAppInstanceStore>();
    private readonly chatContributions = new StoreRegistry<string, ChatContributionsStore>();
    private pluginNavigationBinding?: PluginNavigationStore;
    private readonly sidebarBinding = sidebarStoreCreate();
    private filesBinding?: FilesStore;
    private searchBinding?: SearchStore;
    private directoryBinding?: DirectoryStore;
    private agentModelsBinding?: AgentModelsStore;
    private adminBinding?: AdminStore;
    private readonly adminSections = new Set<AdminSection>();
    private setupBinding?: SetupStore;
    private agentImagesBinding?: AgentImagesStore;
    private agentSecretsBinding?: AgentSecretsStore;
    private pluginsBinding?: PluginsStore;
    private permissionsBinding?: PermissionsStore;
    private initialPermissions?: EffectivePermissions;
    private rolesBinding?: RolesStore;
    private pluginInstallBinding?: PluginInstallStore;
    private notificationsBinding?: NotificationsStore;
    private callsBinding?: CallsStore;
    private settingsBinding?: SettingsStore;
    private settingsCoordinator?: SettingsCoordinator;
    private readonly identities = new IdentityCatalog();
    private readonly sidebarChats: SidebarChatsProjector;
    private readonly runtime: StateRuntime;
    private readonly drafts: DraftCoordinator;
    private readonly sync: SyncCoordinator;
    private readonly context: ChatOpenContext &
        WorkspaceOpenContext &
        WorkspaceFileOpenContext &
        AgentTraceOpenContext &
        McpAppOpenContext &
        DocumentOpenContext &
        DocumentListOpenContext &
        PluginAppOpenContext &
        ChatContributionsOpenContext;
    private disposed = false;
    private readonly unknownSyncArea: (area: string) => void;
    private readonly eventListener: (event: HappyStateEvent) => void;
    private readonly portShareAccess?: PortShareAccess;
    private readonly portShareLease: PortShareLeaseCoordinator;

    constructor(options: HappyStateOptions = {}) {
        const backgroundError =
            options.backgroundError ?? options.onBackgroundError ?? (() => undefined);
        this.eventListener = options.event ?? (() => undefined);
        this.unknownSyncArea = options.unknownSyncArea ?? (() => undefined);
        this.initialPermissions = options.initialPermissions;
        this.portShareAccess = options.portShareAccess;
        this.runtime = new StateRuntime({
            ...options,
            onBackgroundError: options.onBackgroundError ?? backgroundError,
        });
        // Constructing the coordinator opens no timers or transport; a lease
        // begins only after a port share is successfully opened.
        this.portShareLease = new PortShareLeaseCoordinator({
            runtime: this.runtime,
            chatGet: (id) => this.chats.get(id),
        });
        this.drafts = new DraftCoordinator({
            runtime: this.runtime,
            composerGet: (scopeId) => this.composers.get(scopeId),
        });
        this.sidebarChats = new SidebarChatsProjector(this.runtime, this.identities);
        this.context = {
            runtime: this.runtime,
            chatAcquire: (chatId) =>
                this.chats.getOrCreate(chatId, () =>
                    chatStoreCreate(chatId, (event) => this.eventRoute(event)),
                ),
            chatRelease: (chatId) => {
                const released = this.chats.release(chatId);
                // A fully released chat surface can no longer host or reconcile a
                // refresh lease, so its leases stop with it.
                if (released) this.portShareLease.stopForChat(chatId);
                return released;
            },
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
            agentTraceAcquire: (messageId) =>
                this.agentTraces.getOrCreate(messageId, () => agentTraceStoreCreate(messageId)),
            agentTraceRelease: (messageId) => this.agentTraces.release(messageId),
            agentTraceLoad: (messageId) => this.agentTraceLoad(messageId),
            mcpAppAcquire: (messageId, callId) =>
                this.mcpApps.getOrCreate(mcpAppKey(messageId, callId), () =>
                    mcpAppStoreCreate(messageId, callId),
                ),
            mcpAppRelease: (messageId, callId) =>
                this.mcpApps.release(mcpAppKey(messageId, callId)),
            mcpAppLoad: (messageId, callId) => this.mcpAppLoad(messageId, callId),
            mcpAppToolCall: (messageId, callId, name, args) =>
                mcpAppToolCall(this.runtime, messageId, callId, name, args),
            mcpAppResourceRead: (messageId, callId, uri) =>
                mcpAppResourceRead(this.runtime, messageId, callId, uri),
            documentAcquire: (documentId) =>
                this.documents.getOrCreate(documentId, () =>
                    documentStoreCreate(documentId, (event) => this.eventRoute(event), {
                        clientId: this.runtime.createId(),
                    }),
                ),
            documentRelease: (documentId) => {
                const binding = this.documents.get(documentId);
                if (this.documents.release(documentId) && binding) documentSessionStop(binding);
            },
            documentLoad: (documentId) => this.documentLoad(documentId),
            documentLeave: (documentId, clientId, revision) => {
                if (this.runtime.connected && this.runtime.active)
                    this.runtime.background(
                        documentLeaveAnnounce(this.runtime, documentId, clientId, revision),
                    );
            },
            documentListAcquire: (chatId) =>
                this.documentLists.getOrCreate(chatId, () => documentListStoreCreate(chatId)),
            documentListRelease: (chatId) => this.documentLists.release(chatId),
            documentListLoad: (chatId) => this.documentListLoad(chatId),
            pluginAppAcquire: (instanceId) =>
                this.pluginApps.getOrCreate(instanceId, () =>
                    pluginAppInstanceStoreCreate(instanceId),
                ),
            pluginAppRelease: (instanceId) => this.pluginApps.release(instanceId),
            pluginAppGet: (instanceId) => this.pluginApps.get(instanceId),
            pluginAppLoad: (instanceId) => this.pluginAppLoad(instanceId),
            pluginAppToolCall: (instanceId, name, args) =>
                pluginAppToolCall(this.runtime, instanceId, name, args),
            pluginAppResourceRead: (instanceId, uri) =>
                pluginAppResourceRead(this.runtime, instanceId, uri),
            pluginNavigationGet: () => this.pluginNavigationBinding,
            chatContributionsAcquire: (chatId) =>
                this.chatContributions.getOrCreate(chatId, () =>
                    chatContributionsStoreCreate(chatId, (event) => this.eventRoute(event)),
                ),
            chatContributionsRelease: (chatId) => this.chatContributions.release(chatId),
            chatContributionsGet: (chatId) => this.chatContributions.get(chatId),
            chatContributionsLoad: (chatId) => this.chatContributionsLoad(chatId),
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
            agentTraceReconcile: (message) => this.agentTraceReconcile(message),
            agentTracesInvalidate: () => this.agentTracesReload(),
            mcpAppReconcile: (message) => this.mcpAppReconcile(message),
            mcpAppsInvalidate: () => this.mcpAppsReload(),
            chatPluginRequestsReconcile: (chatId) => this.chatPluginRequestsReconcile(chatId),
            chatDocumentWriteRequestsReconcile: (chatId) =>
                this.chatDocumentWriteRequestsReconcile(chatId),
            chatPortSharesReconcile: (chatId) => this.chatPortSharesReconcile(chatId),
            documentReconcile: (documentId, sequence) =>
                documentReconcile(this.documentContext(), documentId, sequence),
            documentPresenceApply: (documentId, presence) =>
                this.documents
                    .get(documentId)
                    ?.getState()
                    .documentInput({ type: "documentPresenceReconciled", presence }),
            areaReconcile: (area) => this.areaReconcile(area),
            resetReconcile: () => this.resetReconcile(),
            backgroundError,
        });
    }

    /** Opens one ephemeral interactive terminal bound to an authorized chat agent session. */
    terminalOpen(chatId: string, agentUserId: string): TerminalHandle {
        return terminalOpen(this.runtime, chatId, agentUserId);
    }

    /** Opens one collaborative document session lease with a live Y.Doc. */
    documentOpen(documentId: string): DocumentHandle {
        return documentOpen(this.context, documentId);
    }

    /** Opens one channel's document list lease. */
    documentListOpen(chatId: string): DocumentListHandle {
        return documentListOpen(this.context, chatId);
    }

    /** Creates a document in a channel and resolves with its summary. */
    documentCreate(
        chatId: string,
        input: { readonly title: string; readonly initialUpdate?: string },
    ): Promise<DocumentSummary> {
        return documentCreate({ runtime: this.runtime }, chatId, input);
    }

    /** Renames a document; open surfaces reconcile from the response and sync hints. */
    documentRename(documentId: string, title: string): Promise<void> {
        return documentRename(this.documentContext(), documentId, title);
    }

    /** Deletes a document and reconciles every materialized document surface. */
    documentDelete(documentId: string): Promise<void> {
        return documentDelete({ runtime: this.runtime }, documentId).then(() =>
            this.documentsReconcile(),
        );
    }

    /** Creates a standalone document attached to no channel. */
    documentStandaloneCreate(input: {
        readonly title: string;
        readonly initialUpdate?: string;
    }): Promise<DocumentSummary> {
        return documentStandaloneCreate({ runtime: this.runtime }, input).then((document) => {
            this.documentsReconcile();
            return document;
        });
    }

    /** Attaches a document to a channel; an existing attachment is treated as success. */
    documentAttach(documentId: string, chatId: string): Promise<void> {
        // The response confirms durable state changed; reconcile immediately
        // rather than waiting for this client's own sync-hint echo.
        return documentAttach({ runtime: this.runtime }, documentId, chatId).then(() =>
            this.documentsReconcile(),
        );
    }

    /** Detaches a document from a channel without deleting the document. */
    documentDetach(documentId: string, chatId: string): Promise<void> {
        return documentDetach({ runtime: this.runtime }, documentId, chatId).then(() =>
            this.documentsReconcile(),
        );
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

    /** The whole visible document collection, independent of any one channel. */
    documentCollection(): DocumentCollectionStore {
        if (!this.documentCollectionBinding) {
            const binding = documentCollectionStoreCreate();
            this.documentCollectionBinding = binding;
            if (this.runtime.connected)
                this.runtime.background(
                    documentCollectionLoad({ runtime: this.runtime, documents: binding }),
                );
        }
        return this.documentCollectionBinding;
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

    agentModels(): AgentModelsStore {
        if (!this.agentModelsBinding) this.agentModelsBinding = agentModelsStoreCreate();
        return this.agentModelsBinding;
    }

    /** Fetches the agent-model catalog into the on-demand surface for a model picker. */
    async agentModelsLoad(): Promise<void> {
        await agentModelsLoad({ runtime: this.runtime, agentModels: this.agentModels() });
    }

    admin(section?: AdminSection): AdminStore {
        const requested = section
            ? [section]
            : (["users", "reports", "automations", "integrations"] as const);
        const missing = requested.filter((value) => !this.adminSections.has(value));
        for (const value of missing) this.adminSections.add(value);
        if (!this.adminBinding) {
            this.adminBinding = adminStoreCreate((event) => this.eventRoute(event));
        }
        if (this.runtime.connected && missing.length)
            this.runtime.background(
                adminLoad({ runtime: this.runtime, admin: this.adminBinding }, missing),
            );
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

    plugins(): PluginsStore {
        if (!this.pluginsBinding) {
            this.pluginsBinding = pluginsStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    pluginsLoad({ runtime: this.runtime, plugins: this.pluginsBinding }),
                );
        }
        return this.pluginsBinding;
    }

    /** Downloads one catalog package icon PNG through the authenticated transport. */
    async pluginIconDownload(shortName: string): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadPluginIcon", { shortName });
    }

    permissions(): PermissionsStore {
        if (!this.permissionsBinding) {
            const initial = this.initialPermissions;
            this.initialPermissions = undefined;
            this.permissionsBinding = permissionsStoreCreate(initial);
            // Even a seeded `/v0/me` projection is re-read after sync startup:
            // without a sync-sequence on that response, a permission mutation
            // between authentication and realtime subscription could otherwise
            // leave the seed stale until the next unrelated change.
            if (this.runtime.connected)
                this.runtime.background(
                    permissionsLoad({
                        runtime: this.runtime,
                        permissions: this.permissionsBinding,
                    }),
                );
        }
        return this.permissionsBinding;
    }

    roles(): RolesStore {
        if (!this.rolesBinding) {
            this.rolesBinding = rolesStoreCreate((event) => this.eventRoute(event));
            if (this.runtime.connected)
                this.runtime.background(
                    rolesLoad({
                        runtime: this.runtime,
                        identities: this.identities,
                        roles: this.rolesBinding,
                    }),
                );
        }
        return this.rolesBinding;
    }

    /** Downloads one persisted system plugin icon PNG through the authenticated transport. */
    async systemPluginImageDownload(pluginId: string): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadSystemPluginImage", { pluginId });
    }

    /** The external plugin install flow surface: preparation, candidate choice, and prepared install. */
    pluginInstall(): PluginInstallStore {
        if (!this.pluginInstallBinding)
            this.pluginInstallBinding = pluginInstallStoreCreate((event) => this.eventRoute(event));
        return this.pluginInstallBinding;
    }

    /**
     * Downloads one staged plugin management request image PNG through the
     * authenticated transport. The image exists only while the request package
     * remains staged (pending or processing).
     */
    async pluginManagementRequestImageDownload(
        chatId: string,
        requestId: string,
    ): Promise<ArrayBuffer> {
        return this.runtime.operation("downloadPluginManagementRequestImage", {
            chatId,
            requestId,
        });
    }

    agentTraceOpen(messageId: string): AgentTraceHandle {
        return agentTraceOpen(this.context, messageId);
    }

    /** Opens one deduplicated MCP App surface for an assistant message's tool call. */
    mcpAppOpen(messageId: string, callId: string): McpAppHandle {
        return mcpAppOpen(this.context, messageId, callId);
    }

    /** Materializes the global sidebar, profile, and plugin-settings contribution surface. */
    pluginNavigation(): PluginNavigationStore {
        if (!this.pluginNavigationBinding) {
            this.pluginNavigationBinding = pluginNavigationStoreCreate((event) =>
                this.eventRoute(event),
            );
            if (this.runtime.connected)
                this.runtime.background(pluginNavigationLoad(this.pluginSurfacesContext()));
        }
        return this.pluginNavigationBinding;
    }

    /** Opens one durable MCP App instance whose handle survives context and data revisions. */
    pluginAppOpen(instanceId: string): PluginAppHandle {
        return pluginAppOpen(this.context, instanceId);
    }

    /** Loads one authenticated plugin icon as PNG bytes for a UI-owned blob URL, scoped to the installation. */
    async pluginUiAssetRead(installationId: string, assetId: string): Promise<ArrayBuffer> {
        return pluginUiAssetRead(this.runtime, installationId, assetId);
    }

    /** Opens native contributions visible in one chat, including global contributions. */
    chatContributionsOpen(chatId: string): ChatContributionsHandle {
        return chatContributionsOpen(this.context, chatId);
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

    async developmentTokenCreate(): Promise<import("./resources.js").DevelopmentTokenCredential> {
        return developmentTokenCreate({ runtime: this.runtime });
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
        return this.composers.getOrCreate(scopeId, () => {
            const remembered = this.composerAudiences.get(scopeId);
            return composerStoreCreate(scopeId, {
                ...options,
                text: options.text ?? this.drafts.textGet(scopeId),
                now: options.now ?? this.runtime.now,
                audience: remembered?.audience ?? options.audience,
                agentUserIds: remembered?.agentUserIds ?? options.agentUserIds,
                output: (event) => {
                    options.output?.(event);
                    this.eventRoute(event);
                },
            });
        });
    }

    composerRelease(scopeId: string): void {
        this.composerAudienceRemember(scopeId);
        this.composers.release(scopeId);
    }

    workspaceOpen(chatId: string): WorkspaceHandle {
        return workspaceOpen(this.context, chatId);
    }

    workspaceFileOpen(chatId: string, path: string): WorkspaceFileHandle {
        return workspaceFileOpen(this.context, chatId, path);
    }

    async syncStart(): Promise<void> {
        await Promise.all([syncStart(this.sync), this.drafts.load()]);
    }

    syncStop(): void {
        syncStop(this.sync);
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

    async projectCreate(input: CreateProjectInput): Promise<void> {
        await projectCreate(this.chatActionContext(), input);
    }

    async channelCreateChild(input: CreateChildChannelInput): Promise<void> {
        await channelCreateChild(this.chatActionContext(), input);
    }

    async channelArchive(chatId: string): Promise<void> {
        await channelArchive(this.chatActionContext(), chatId);
    }

    async channelUnarchive(chatId: string): Promise<void> {
        await channelUnarchive(this.chatActionContext(), chatId);
    }

    async agentCreate(input: CreateAgentInput): Promise<void> {
        await agentCreate(this.chatActionContext(), input);
    }

    async agentConversationCreate(agentUserId: string): Promise<ChatSummary> {
        return agentConversationCreate(this.chatActionContext(), agentUserId);
    }

    async agentEffortChange(chatId: string, agentUserId: string, effort: string): Promise<void> {
        await agentEffortChange(this.chatActionContext(), chatId, agentUserId, effort);
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

    async channelDefaultAgentUpdate(chatId: string, agentUserId: string): Promise<void> {
        await channelDefaultAgentUpdate(this.chatActionContext(), chatId, agentUserId);
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
        if (this.pluginsBinding) {
            pluginsUpdateChecksStop(this.pluginsBinding);
            pluginsUpdateStreamsStop(this.pluginsBinding);
        }
        if (this.pluginInstallBinding) pluginInstallPrepareStop(this.pluginInstallBinding);
        this.portShareLease.dispose();
        this.runtime.stop();
        this.chats.dispose();
        this.workspaceFiles.dispose();
        this.workspaces.dispose();
        this.composers.dispose();
        this.composerAudiences.clear();
        this.agentTraces.dispose();
        this.mcpApps.dispose();
        for (const [, binding] of this.documents.values()) documentSessionStop(binding);
        this.documents.dispose();
        this.documentLists.dispose();
        this.pluginApps.dispose();
        this.chatContributions.dispose();
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
                this.drafts.textUpdate(event.scopeId, event.text);
                return;
            case "focusUpdated": {
                const text = this.composers.get(event.scopeId)?.getState().text;
                if (text !== undefined) this.drafts.textTouch(event.scopeId, text);
                return;
            }
            case "attachmentAdded":
            case "attachmentRemoved":
                return;
            case "audienceUpdated":
            case "agentUserAdded":
            case "agentUserRemoved": {
                this.composerAudienceRemember(event.scopeId);
                return;
            }
            case "textSubmitted":
                messageSend(
                    this.messageContext(),
                    event.scopeId,
                    {
                        text: event.text,
                        attachmentFileIds: event.attachments.map((attachment) => attachment.id),
                        ...(event.audience
                            ? {
                                  audience: event.audience,
                                  ...(event.audience === "agents" && event.agentUserIds.length
                                      ? { agentUserIds: event.agentUserIds }
                                      : {}),
                              }
                            : {}),
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
                void this.agentEffortChange(event.chatId, event.agentUserId, event.effort);
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
            case "documentUpdatesQueued":
                documentFlushSchedule(this.documentContext(), event.documentId);
                return;
            case "documentPresenceQueued":
                documentPresenceSchedule(this.documentContext(), event.documentId);
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
            case "userPasswordResetSubmitted":
                if (this.adminBinding)
                    this.backgroundIfConnected(() =>
                        adminOutputRoute(
                            { runtime: this.runtime, admin: this.adminBinding! },
                            event,
                        ),
                    );
                return;
            case "roleCreateSubmitted":
            case "roleUpdateSubmitted":
            case "roleDeleteSubmitted":
            case "memberSelected":
            case "memberPermissionsSubmitted":
            case "memberRoleAssignSubmitted":
            case "memberRoleUnassignSubmitted":
                if (this.rolesBinding)
                    this.backgroundIfConnected(() =>
                        rolesOutputRoute(
                            {
                                runtime: this.runtime,
                                identities: this.identities,
                                roles: this.rolesBinding!,
                            },
                            event,
                        ),
                    );
                return;
            case "pluginInstallSubmitted":
            case "installationUninstallSubmitted":
            case "installationRetrySubmitted":
            case "installationUpdateSubmitted":
            case "installationUpdateCheckSubmitted":
            case "installationDiagnosticsRequested":
            case "pluginUpdateChecksStarted":
            case "pluginPermissionsUpdateSubmitted":
                if (this.pluginsBinding)
                    this.backgroundIfConnected(() =>
                        pluginsOutputRoute(
                            { runtime: this.runtime, plugins: this.pluginsBinding! },
                            event,
                        ),
                    );
                return;
            case "pluginUpdateChecksStopped":
                // Cancels streams synchronously even while offline or stopping.
                if (this.pluginsBinding) pluginsUpdateChecksStop(this.pluginsBinding);
                return;
            case "pluginPrepareCancelled":
                if (this.pluginInstallBinding) pluginInstallPrepareStop(this.pluginInstallBinding);
                return;
            case "pluginPrepareSubmitted":
                if (this.pluginInstallBinding)
                    this.backgroundIfConnected(() =>
                        pluginInstallOutputRoute(
                            { runtime: this.runtime, install: this.pluginInstallBinding! },
                            event,
                        ),
                    );
                return;
            case "pluginInstallPreparedSubmitted":
                if (this.pluginInstallBinding)
                    this.backgroundIfConnected(async () => {
                        await pluginInstallOutputRoute(
                            { runtime: this.runtime, install: this.pluginInstallBinding! },
                            event,
                        );
                        // The durable install reconciles the plugin surface eagerly;
                        // realtime hints keep it authoritative afterwards.
                        if (this.pluginsBinding)
                            await pluginsLoad({
                                runtime: this.runtime,
                                plugins: this.pluginsBinding,
                            });
                    });
                return;
            case "pluginRequestsRetained":
                this.chatPluginRequestsLoad(event.chatId);
                return;
            case "documentWriteRequestsRetained":
                this.chatDocumentWriteRequestsLoad(event.chatId);
                return;
            case "documentWriteRequestDecisionSubmitted":
                // A silently dropped decision would leave the card busy forever,
                // so a disconnected surface fails the intent immediately instead.
                if (this.runtime.connected && this.runtime.active)
                    this.runtime.background(
                        chatDocumentWriteRequestDecide(
                            {
                                runtime: this.runtime,
                                chatGet: (chatId) => this.chats.get(chatId),
                            },
                            event,
                        ),
                    );
                else
                    this.chats
                        .get(event.chatId)
                        ?.getState()
                        .chatInput({
                            type: "documentWriteRequestDecisionFailed",
                            requestId: event.requestId,
                            error: new UserError("You're offline. Try again once reconnected."),
                        });
                return;
            case "portSharesRetained":
                this.chatPortSharesLoad(event.chatId);
                return;
            case "portShareOpenSubmitted":
                this.chatPortShareOpen(event.chatId, event.portShareId);
                return;
            case "portShareDisableSubmitted":
                // Always run so a disconnected click settles the busy marker with a
                // displayable error instead of hanging; the action itself performs
                // no transport work while offline. On confirmed success it stops the
                // exact share's refresh lease immediately via portShareDisabled,
                // independent of the follow-up list read.
                this.runtime.background(
                    chatPortShareDisable(
                        {
                            ...this.chatLoadContext(),
                            portShareDisabled: (chatId, portShareId) =>
                                this.portShareLease.stopForShare(chatId, portShareId),
                        },
                        event.chatId,
                        event.portShareId,
                    ).then(() => this.portShareLeaseReconcile(event.chatId)),
                );
                return;
            case "pluginRequestDecisionSubmitted":
                this.backgroundIfConnected(() =>
                    chatPluginRequestDecide(
                        {
                            runtime: this.runtime,
                            chatGet: (chatId) => this.chats.get(chatId),
                            pluginsReconcile: () => {
                                if (this.pluginsBinding)
                                    this.runtime.background(
                                        pluginsLoad({
                                            runtime: this.runtime,
                                            plugins: this.pluginsBinding,
                                        }),
                                    );
                            },
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
            case "appPresentationUpdateSubmitted":
            case "pluginContributionInvokeSubmitted":
            case "pluginContributionMenuResolveSubmitted":
                this.backgroundIfConnected(() =>
                    pluginContributionOutputRoute(this.pluginSurfacesContext(), event),
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
        // A full chat reload also covers reset paths where individual chat
        // updates were unavailable; a retained request list must not stale.
        this.chatPluginRequestsReconcile(chatId);
        this.chatDocumentWriteRequestsReconcile(chatId);
        this.chatPortSharesReconcile(chatId);
    }

    private chatLoadContext() {
        return {
            runtime: this.runtime,
            identities: this.identities,
            chatGet: (id: string) => this.chats.get(id),
        };
    }

    private chatPortSharesLoad(chatId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(
            chatPortSharesLoad(this.chatLoadContext(), chatId).then(() =>
                this.portShareLeaseReconcile(chatId),
            ),
        );
    }

    /**
     * Reserves the external window synchronously within the originating click, then completes the
     * token issuance and cross-origin cookie exchange in the background. Reserving here (before any
     * await) keeps the pop-up attributed to the user gesture.
     */
    private chatPortShareOpen(chatId: string, portShareId: string): void {
        const target = this.portShareAccess?.reserve() ?? null;
        this.runtime.background(
            chatPortShareOpen(
                {
                    ...this.chatLoadContext(),
                    portShareAccess: this.portShareAccess,
                    portShareLeaseStart: (input) => this.portShareLease.start(input),
                },
                chatId,
                portShareId,
                target,
            ),
        );
    }

    /** Reloads active port shares only for a chat surface that has retained them. */
    private chatPortSharesReconcile(chatId: string): void {
        const shares = this.chats.get(chatId)?.getState().portShares;
        if (shares?.type === "loading" || shares?.type === "ready") this.chatPortSharesLoad(chatId);
    }

    /** Stops refresh leases whose share left the durable active list of a retained chat surface. */
    private portShareLeaseReconcile(chatId: string): void {
        const shares = this.chats.get(chatId)?.getState().portShares;
        if (shares?.type !== "ready") return;
        this.portShareLease.reconcile(chatId, new Set(shares.value.map((share) => share.id)));
    }

    private chatPluginRequestsLoad(chatId: string): void {
        if (!this.runtime.connected) return;
        this.runtime.background(
            chatPluginRequestsLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                },
                chatId,
            ),
        );
    }

    private chatDocumentWriteRequestsLoad(chatId: string): void {
        this.backgroundIfConnected(() =>
            chatDocumentWriteRequestsLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                },
                chatId,
            ),
        );
    }

    /** Reloads document-write approvals only for a chat surface that has retained them. */
    private chatDocumentWriteRequestsReconcile(chatId: string): void {
        const requests = this.chats.get(chatId)?.getState().documentWriteRequests;
        if (requests?.type === "loading" || requests?.type === "ready")
            this.chatDocumentWriteRequestsLoad(chatId);
    }

    /** Reloads plugin management requests only for a chat surface that has retained them. */
    private chatPluginRequestsReconcile(chatId: string): void {
        const requests = this.chats.get(chatId)?.getState().pluginRequests;
        if (requests?.type === "loading" || requests?.type === "ready")
            this.chatPluginRequestsLoad(chatId);
    }

    private agentTraceLoad(messageId: string): void {
        this.runtime.background(
            agentTraceLoad(
                {
                    runtime: this.runtime,
                    agentTraceGet: (id) => this.agentTraces.get(id),
                },
                messageId,
            ),
        );
    }

    private documentContext(): DocumentActionContext {
        return {
            runtime: this.runtime,
            documentGet: (documentId) => this.documents.get(documentId),
        };
    }

    private documentLoad(documentId: string): void {
        this.runtime.background(documentLoad(this.documentContext(), documentId));
    }

    private documentListLoad(chatId: string): void {
        this.runtime.background(
            documentListLoad(
                {
                    runtime: this.runtime,
                    documentListGet: (id) => this.documentLists.get(id),
                },
                chatId,
            ),
        );
    }

    /** Reloads every materialized document list and re-synchronizes open sessions. */
    private documentsReconcile(): void {
        if (this.documentCollectionBinding)
            this.runtime.background(
                documentCollectionLoad({
                    runtime: this.runtime,
                    documents: this.documentCollectionBinding,
                }),
            );
        for (const [chatId] of this.documentLists.values()) this.documentListLoad(chatId);
        for (const [documentId] of this.documents.values())
            this.runtime.background(documentSynchronize(this.documentContext(), documentId));
    }

    private agentTraceReconcile(message: MessageSummary): void {
        agentTraceReconcile(
            {
                runtime: this.runtime,
                agentTraceGet: (id) => this.agentTraces.get(id),
                agentTraceLoad: (id) => this.agentTraceLoad(id),
            },
            message.id,
            message.agentTrace,
        );
    }

    /**
     * Revalidates every materialized trace surface after a reconcile path that
     * bypasses per-message differences (chat reset, full resynchronization, or
     * chat removal), so an open panel cannot keep rendering stale or
     * access-revoked details from cache; a revoked or deleted trace fails its
     * refetch and surfaces the error state instead.
     */
    private agentTracesReload(): void {
        for (const [messageId] of this.agentTraces.values()) this.agentTraceLoad(messageId);
    }

    private mcpAppLoad(messageId: string, callId: string): void {
        this.runtime.background(
            mcpAppLoad(
                {
                    runtime: this.runtime,
                    mcpAppGet: (id, call) => this.mcpApps.get(mcpAppKey(id, call)),
                },
                messageId,
                callId,
            ),
        );
    }

    /**
     * Revalidates every materialized MCP App surface for one assistant message
     * when its summary hints at newer durable app state, so an open app
     * reconciles the tool status and stored result through the GET endpoint
     * rather than trusting the delivery hint. An app whose call status matches
     * the already-loaded view is left untouched so text-only stream ticks do not
     * refetch; an app dropped from the summary (deleted or revoked) is not
     * force-reloaded here because chat reset and removal already invalidate it.
     */
    private mcpAppReconcile(message: MessageSummary): void {
        for (const app of message.mcpApps ?? []) {
            const binding = this.mcpApps.get(mcpAppKey(message.id, app.callId));
            if (!binding) continue;
            const current = binding.getState().view;
            if (current.type === "ready" && current.value.app.status === app.status) continue;
            this.mcpAppLoad(message.id, app.callId);
        }
    }

    /**
     * Revalidates every materialized MCP App surface after a reconcile path that
     * bypasses per-message differences (chat reset, full resynchronization, or
     * chat removal), mirroring the agent-trace revalidation so an open app
     * cannot keep rendering stale or access-revoked content from cache.
     */
    private mcpAppsReload(): void {
        for (const [, binding] of this.mcpApps.values()) {
            const { messageId, callId } = binding.getState();
            this.mcpAppLoad(messageId, callId);
        }
    }

    private composerAudienceRemember(scopeId: string): void {
        const snapshot = this.composers.get(scopeId)?.getState();
        if (!snapshot?.audience) return;
        this.composerAudiences.set(scopeId, {
            audience: snapshot.audience,
            agentUserIds: snapshot.agentUserIds,
        });
    }

    private chatMembersLoad(chatId: string): void {
        this.runtime.background(
            chatMembersLoad(
                {
                    runtime: this.runtime,
                    identities: this.identities,
                    chatGet: (id) => this.chats.get(id),
                    composerGet: (id) => this.composers.get(id),
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

    private pluginSurfacesContext() {
        return {
            runtime: this.runtime,
            pluginNavigationGet: () => this.pluginNavigationBinding,
            chatContributionsGet: (chatId: string) => this.chatContributions.get(chatId),
        };
    }

    private pluginAppLoad(instanceId: string): void {
        this.runtime.background(
            pluginAppLoad(
                {
                    runtime: this.runtime,
                    pluginAppGet: (id) => this.pluginApps.get(id),
                },
                instanceId,
            ),
        );
    }

    private chatContributionsLoad(chatId: string): void {
        this.runtime.background(chatContributionsLoad(this.pluginSurfacesContext(), chatId));
    }

    private pluginAppsReconcile(): void {
        if (this.pluginNavigationBinding)
            this.runtime.background(pluginNavigationLoad(this.pluginSurfacesContext()));
        for (const [instanceId] of this.pluginApps.values()) this.pluginAppLoad(instanceId);
    }

    private pluginContributionsReconcile(): void {
        if (this.pluginNavigationBinding)
            this.runtime.background(pluginNavigationLoad(this.pluginSurfacesContext()));
        for (const [chatId] of this.chatContributions.values()) this.chatContributionsLoad(chatId);
    }

    private areaReconcile(area: string): void {
        areaReconcileAction(
            {
                chatReconcile: (chatId) => {
                    this.chatLoad(chatId);
                    this.agentTracesReload();
                    this.mcpAppsReload();
                },
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
                draftsReconcile: () => this.runtime.background(this.drafts.load()),
                documentsReconcile: () => this.documentsReconcile(),
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
                pluginsReconcile: () => {
                    if (this.pluginsBinding)
                        this.runtime.background(
                            pluginsLoad({ runtime: this.runtime, plugins: this.pluginsBinding }),
                        );
                },
                appsReconcile: () => this.pluginAppsReconcile(),
                contributionsReconcile: () => this.pluginContributionsReconcile(),
                permissionsReconcile: () => this.permissionsReconcile(),
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
                projectsReconcile: () =>
                    this.runtime.background(
                        sidebarProjectsLoad({
                            runtime: this.runtime,
                            sidebar: this.sidebarBinding,
                        }),
                    ),
                unknownArea: this.unknownSyncArea,
            },
            area,
        );
    }

    private resetReconcile(): void {
        this.runtime.background(this.drafts.load());
        for (const [chatId] of this.chats.values()) this.chatLoad(chatId);
        for (const [chatId] of this.workspaces.values()) this.workspaceReconcile(chatId);
        for (const [, binding] of this.workspaceFiles.values()) {
            const { chatId, path } = binding.getState();
            this.workspaceFileLoad(chatId, path);
        }
        this.agentTracesReload();
        this.mcpAppsReload();
        this.documentsReconcile();
        this.pluginAppsReconcile();
        this.pluginContributionsReconcile();
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
        if (this.adminBinding && this.adminSections.size)
            this.runtime.background(
                adminLoad({ runtime: this.runtime, admin: this.adminBinding }, [
                    ...this.adminSections,
                ]),
            );
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
        if (this.pluginsBinding)
            this.runtime.background(
                pluginsLoad({ runtime: this.runtime, plugins: this.pluginsBinding }),
            );
        // The reset above already reloads every requested admin section.
        this.permissionsReconcile(false);
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

    /**
     * Refreshes the current-user grants and any retained roles surface after a
     * permissions hint or reset. A permissions mutation may also rewrite the
     * durable admin marker projected by the administration user list, so a
     * retained users section refetches too unless the caller already reloads
     * every requested admin section itself.
     */
    private permissionsReconcile(adminUsers = true): void {
        if (this.permissionsBinding)
            this.runtime.background(
                permissionsLoad({ runtime: this.runtime, permissions: this.permissionsBinding }),
            );
        if (this.rolesBinding)
            this.runtime.background(
                rolesLoad({
                    runtime: this.runtime,
                    identities: this.identities,
                    roles: this.rolesBinding,
                }),
            );
        if (adminUsers && this.adminBinding && this.adminSections.has("users"))
            this.runtime.background(
                adminLoad({ runtime: this.runtime, admin: this.adminBinding }, ["users"]),
            );
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
            draftTextUpdate: (scopeId: string, text: string) =>
                this.drafts.textUpdate(scopeId, text),
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

function mcpAppKey(messageId: string, callId: string): string {
    return pairKey(messageId, callId);
}

function pairKey(parentChatId: string, rootMessageId: string): string {
    return `${parentChatId}\u0000${rootMessageId}`;
}
