import { adminStoreCreate } from "../modules/admin/adminState.js";
import type { AdminInput, AdminStore } from "../modules/admin/adminState.js";
import { agentImagesStoreCreate } from "../modules/agent-images/agentImagesState.js";
import type {
    AgentImagesInput,
    AgentImagesOutput,
    AgentImagesStore,
} from "../modules/agent-images/agentImagesState.js";
import { agentTraceStoreCreate } from "../modules/agent-trace/agentTraceState.js";
import type { AgentTraceInput, AgentTraceStore } from "../modules/agent-trace/agentTraceState.js";
import { setupStoreCreate } from "../modules/setup/setupState.js";
import type { SetupInput, SetupOutput, SetupStore } from "../modules/setup/setupState.js";
import { agentSecretsStoreCreate } from "../modules/agent-secrets/agentSecretsState.js";
import type {
    AgentSecretsInput,
    AgentSecretsOutput,
    AgentSecretsStore,
} from "../modules/agent-secrets/agentSecretsState.js";
import { pluginsStoreCreate } from "../modules/plugins/pluginsState.js";
import type { PluginsInput, PluginsOutput, PluginsStore } from "../modules/plugins/pluginsState.js";
import { permissionsStoreCreate } from "../modules/permissions/permissionsState.js";
import type {
    PermissionsInput,
    PermissionsStore,
} from "../modules/permissions/permissionsState.js";
import { rolesStoreCreate } from "../modules/roles/rolesState.js";
import type { RolesInput, RolesOutput, RolesStore } from "../modules/roles/rolesState.js";
import { pluginInstallStoreCreate } from "../modules/plugin-install/pluginInstallState.js";
import type {
    PluginInstallInput,
    PluginInstallOutput,
    PluginInstallStore,
} from "../modules/plugin-install/pluginInstallState.js";
import { callsStoreCreate } from "../modules/calls/callsState.js";
import type { CallsInput, CallsOutput, CallsStore } from "../modules/calls/callsState.js";
import { chatStoreCreate } from "../modules/chat/chatState.js";
import type { ChatInput, ChatOutput, ChatStore } from "../modules/chat/chatState.js";
import { directoryStoreCreate } from "../modules/directory/directoryState.js";
import type { DirectoryInput, DirectoryStore } from "../modules/directory/directoryState.js";
import { filesStoreCreate } from "../modules/files/filesState.js";
import type { FilesInput, FilesOutput, FilesStore } from "../modules/files/filesState.js";
import { notificationsStoreCreate } from "../modules/notifications/notificationsState.js";
import type {
    NotificationsInput,
    NotificationsOutput,
    NotificationsStore,
} from "../modules/notifications/notificationsState.js";
import { searchStoreCreate } from "../modules/search/searchState.js";
import type { SearchInput, SearchOutput, SearchStore } from "../modules/search/searchState.js";
import { settingsStoreCreate } from "../modules/settings/settingsState.js";
import type {
    SettingsInput,
    SettingsOutput,
    SettingsStore,
    SettingsStoreOptions,
} from "../modules/settings/settingsState.js";
import { sidebarStoreCreate } from "../modules/sidebar/sidebarState.js";
import type { SidebarInput, SidebarStore } from "../modules/sidebar/sidebarState.js";
import { threadStoreCreate } from "../modules/thread/threadState.js";
import type { ThreadInput, ThreadOutput, ThreadStore } from "../modules/thread/threadState.js";
import { threadsStoreCreate } from "../modules/threads/threadsState.js";
import type { ThreadsInput, ThreadsOutput, ThreadsStore } from "../modules/threads/threadsState.js";
import { workspaceFileStoreCreate } from "../modules/workspace-file/workspaceFileState.js";
import type {
    WorkspaceFileInput,
    WorkspaceFileStore,
} from "../modules/workspace-file/workspaceFileState.js";
import { workspaceStoreCreate } from "../modules/workspace/workspaceState.js";
import type {
    WorkspaceInput,
    WorkspaceOutput,
    WorkspaceStore,
} from "../modules/workspace/workspaceState.js";

/** Test-only owner capability for driving one concrete surface through its closed input union. */
export interface SurfaceStoreFixture<Store, Event> extends Disposable {
    readonly store: Store;
    input(event: Event): void;
}

function fixtureCreate<Store, Event>(
    store: Store,
    input: (event: Event) => void,
): SurfaceStoreFixture<Store, Event> {
    return {
        store,
        input,
        [Symbol.dispose]: () => undefined,
    };
}

export function sidebarStoreFixtureCreate(): SurfaceStoreFixture<SidebarStore, SidebarInput> {
    const store = sidebarStoreCreate();
    return fixtureCreate(store, (event) => store.getState().sidebarInput(event));
}

export function chatStoreFixtureCreate(
    chatId: string,
    output: (event: ChatOutput) => void = () => undefined,
): SurfaceStoreFixture<ChatStore, ChatInput> {
    const store = chatStoreCreate(chatId, output);
    return fixtureCreate(store, (event) => store.getState().chatInput(event));
}

export function searchStoreFixtureCreate(
    output: (event: SearchOutput) => void = () => undefined,
): SurfaceStoreFixture<SearchStore, SearchInput> {
    const store = searchStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().searchInput(event));
}

export function filesStoreFixtureCreate(
    output: (event: FilesOutput) => void = () => undefined,
): SurfaceStoreFixture<FilesStore, FilesInput> {
    const store = filesStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().filesInput(event));
}

export function directoryStoreFixtureCreate(): SurfaceStoreFixture<DirectoryStore, DirectoryInput> {
    const store = directoryStoreCreate();
    return fixtureCreate(store, (event) => store.getState().directoryInput(event));
}

export function adminStoreFixtureCreate(
    output: (event: import("../modules/admin/adminState.js").AdminOutput) => void = () => undefined,
): SurfaceStoreFixture<AdminStore, AdminInput> {
    const store = adminStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().adminInput(event));
}

export function permissionsStoreFixtureCreate(): SurfaceStoreFixture<
    PermissionsStore,
    PermissionsInput
> {
    const store = permissionsStoreCreate();
    return fixtureCreate(store, (event) => store.getState().permissionsInput(event));
}

export function rolesStoreFixtureCreate(
    output: (event: RolesOutput) => void = () => undefined,
): SurfaceStoreFixture<RolesStore, RolesInput> {
    const store = rolesStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().rolesInput(event));
}

export function setupStoreFixtureCreate(
    output: (event: SetupOutput) => void = () => undefined,
): SurfaceStoreFixture<SetupStore, SetupInput> {
    const store = setupStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().setupInput(event));
}

export function agentImagesStoreFixtureCreate(
    output: (event: AgentImagesOutput) => void = () => undefined,
): SurfaceStoreFixture<AgentImagesStore, AgentImagesInput> {
    const store = agentImagesStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().agentImagesInput(event));
}

export function pluginsStoreFixtureCreate(
    output: (event: PluginsOutput) => void = () => undefined,
): SurfaceStoreFixture<PluginsStore, PluginsInput> {
    const store = pluginsStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().pluginsInput(event));
}

export function pluginInstallStoreFixtureCreate(
    output: (event: PluginInstallOutput) => void = () => undefined,
): SurfaceStoreFixture<PluginInstallStore, PluginInstallInput> {
    const store = pluginInstallStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().pluginInstallInput(event));
}

export function agentSecretsStoreFixtureCreate(
    output: (event: AgentSecretsOutput) => void = () => undefined,
): SurfaceStoreFixture<AgentSecretsStore, AgentSecretsInput> {
    const store = agentSecretsStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().agentSecretsInput(event));
}

export function notificationsStoreFixtureCreate(
    output: (event: NotificationsOutput) => void = () => undefined,
): SurfaceStoreFixture<NotificationsStore, NotificationsInput> {
    const store = notificationsStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().notificationsInput(event));
}

export function threadsStoreFixtureCreate(
    output: (event: ThreadsOutput) => void = () => undefined,
): SurfaceStoreFixture<ThreadsStore, ThreadsInput> {
    const store = threadsStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().threadsInput(event));
}

export function agentTraceStoreFixtureCreate(
    messageId: string,
): SurfaceStoreFixture<AgentTraceStore, AgentTraceInput> {
    const store = agentTraceStoreCreate(messageId);
    return fixtureCreate(store, (event) => store.getState().agentTraceInput(event));
}

export function threadStoreFixtureCreate(
    parentChatId: string,
    rootMessageId: string,
    output: (event: ThreadOutput) => void = () => undefined,
    createId?: () => string,
): SurfaceStoreFixture<ThreadStore, ThreadInput> {
    const store = threadStoreCreate(parentChatId, rootMessageId, { output, createId });
    return fixtureCreate(store, (event) => store.getState().threadInput(event));
}

export function callsStoreFixtureCreate(
    output: (event: CallsOutput) => void = () => undefined,
): SurfaceStoreFixture<CallsStore, CallsInput> {
    const store = callsStoreCreate(output);
    return fixtureCreate(store, (event) => store.getState().callsInput(event));
}

export function settingsStoreFixtureCreate(
    options: SettingsStoreOptions = {},
    output: (event: SettingsOutput) => void = () => undefined,
): SurfaceStoreFixture<SettingsStore, SettingsInput> {
    const store = settingsStoreCreate(options, output);
    return fixtureCreate(store, (event) => store.getState().settingsInput(event));
}

export function workspaceStoreFixtureCreate(
    chatId: string,
    output: (event: WorkspaceOutput) => void = () => undefined,
): SurfaceStoreFixture<WorkspaceStore, WorkspaceInput> {
    const store = workspaceStoreCreate(chatId, output);
    return fixtureCreate(store, (event) => store.getState().workspaceInput(event));
}

export function workspaceFileStoreFixtureCreate(
    chatId: string,
    path: string,
): SurfaceStoreFixture<WorkspaceFileStore, WorkspaceFileInput> {
    const store = workspaceFileStoreCreate(chatId, path);
    return fixtureCreate(store, (event) => store.getState().workspaceFileInput(event));
}
