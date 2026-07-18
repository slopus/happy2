import { adminStoreCreateBinding } from "../modules/admin/adminStore.js";
import type { AdminInput, AdminStore } from "../modules/admin/adminTypes.js";
import { agentImagesStoreCreateBinding } from "../modules/agent-images/agentImagesStore.js";
import type {
    AgentImagesInput,
    AgentImagesOutput,
    AgentImagesStore,
} from "../modules/agent-images/agentImagesTypes.js";
import { agentSecretsStoreCreateBinding } from "../modules/agent-secrets/agentSecretsStore.js";
import type {
    AgentSecretsInput,
    AgentSecretsOutput,
    AgentSecretsStore,
} from "../modules/agent-secrets/agentSecretsTypes.js";
import { callsStoreCreateBinding } from "../modules/calls/callsStore.js";
import type { CallsInput, CallsOutput, CallsStore } from "../modules/calls/callsTypes.js";
import { chatStoreCreateBinding } from "../modules/chat/chatStore.js";
import type { ChatInput, ChatOutput, ChatStore } from "../modules/chat/chatTypes.js";
import { directoryStoreCreateBinding } from "../modules/directory/directoryStore.js";
import type { DirectoryInput, DirectoryStore } from "../modules/directory/directoryTypes.js";
import { filesStoreCreateBinding } from "../modules/files/filesStore.js";
import type { FilesInput, FilesOutput, FilesStore } from "../modules/files/filesTypes.js";
import { notificationsStoreCreateBinding } from "../modules/notifications/notificationsStore.js";
import type {
    NotificationsInput,
    NotificationsOutput,
    NotificationsStore,
} from "../modules/notifications/notificationsTypes.js";
import { searchStoreCreateBinding } from "../modules/search/searchStore.js";
import type { SearchInput, SearchOutput, SearchStore } from "../modules/search/searchTypes.js";
import { settingsStoreCreateBinding } from "../modules/settings/settingsStore.js";
import type {
    SettingsInput,
    SettingsOutput,
    SettingsStore,
    SettingsStoreOptions,
} from "../modules/settings/settingsTypes.js";
import { sidebarStoreCreateBinding } from "../modules/sidebar/sidebarStore.js";
import type { SidebarInput, SidebarStore } from "../modules/sidebar/sidebarTypes.js";
import { threadStoreCreateBinding } from "../modules/thread/threadStore.js";
import type { ThreadInput, ThreadOutput, ThreadStore } from "../modules/thread/threadTypes.js";
import { threadsStoreCreateBinding } from "../modules/threads/threadsStore.js";
import type { ThreadsInput, ThreadsOutput, ThreadsStore } from "../modules/threads/threadsTypes.js";
import { workspaceFileStoreCreateBinding } from "../modules/workspace-file/workspaceFileStore.js";
import type {
    WorkspaceFileInput,
    WorkspaceFileStore,
} from "../modules/workspace-file/workspaceFileTypes.js";
import { workspaceStoreCreateBinding } from "../modules/workspace/workspaceStore.js";
import type {
    WorkspaceInput,
    WorkspaceOutput,
    WorkspaceStore,
} from "../modules/workspace/workspaceTypes.js";

/** Test-only owner capability for driving one concrete surface through its closed input union. */
export interface SurfaceStoreFixture<Store, Event> extends Disposable {
    readonly store: Store;
    input(event: Event): void;
}

type Binding<Store> = {
    readonly store: Store;
    dispose(): void;
};

function fixtureCreate<Store, Event>(
    binding: Binding<Store>,
    input: (event: Event) => void,
): SurfaceStoreFixture<Store, Event> {
    return {
        store: binding.store,
        input,
        [Symbol.dispose]: () => binding.dispose(),
    };
}

export function sidebarStoreFixtureCreate(): SurfaceStoreFixture<SidebarStore, SidebarInput> {
    const binding = sidebarStoreCreateBinding();
    return fixtureCreate(binding, binding.sidebarInput);
}

export function chatStoreFixtureCreate(
    chatId: string,
    output: (event: ChatOutput) => void = () => undefined,
): SurfaceStoreFixture<ChatStore, ChatInput> {
    const binding = chatStoreCreateBinding(chatId, output);
    return fixtureCreate(binding, binding.chatInput);
}

export function searchStoreFixtureCreate(
    output: (event: SearchOutput) => void = () => undefined,
): SurfaceStoreFixture<SearchStore, SearchInput> {
    const binding = searchStoreCreateBinding(output);
    return fixtureCreate(binding, binding.searchInput);
}

export function filesStoreFixtureCreate(
    output: (event: FilesOutput) => void = () => undefined,
): SurfaceStoreFixture<FilesStore, FilesInput> {
    const binding = filesStoreCreateBinding(output);
    return fixtureCreate(binding, binding.filesInput);
}

export function directoryStoreFixtureCreate(): SurfaceStoreFixture<DirectoryStore, DirectoryInput> {
    const binding = directoryStoreCreateBinding();
    return fixtureCreate(binding, binding.directoryInput);
}

export function adminStoreFixtureCreate(): SurfaceStoreFixture<AdminStore, AdminInput> {
    const binding = adminStoreCreateBinding();
    return fixtureCreate(binding, binding.adminInput);
}

export function agentImagesStoreFixtureCreate(
    output: (event: AgentImagesOutput) => void = () => undefined,
): SurfaceStoreFixture<AgentImagesStore, AgentImagesInput> {
    const binding = agentImagesStoreCreateBinding(output);
    return fixtureCreate(binding, binding.agentImagesInput);
}

export function agentSecretsStoreFixtureCreate(
    output: (event: AgentSecretsOutput) => void = () => undefined,
): SurfaceStoreFixture<AgentSecretsStore, AgentSecretsInput> {
    const binding = agentSecretsStoreCreateBinding(output);
    return fixtureCreate(binding, binding.agentSecretsInput);
}

export function notificationsStoreFixtureCreate(
    output: (event: NotificationsOutput) => void = () => undefined,
): SurfaceStoreFixture<NotificationsStore, NotificationsInput> {
    const binding = notificationsStoreCreateBinding(output);
    return fixtureCreate(binding, binding.notificationsInput);
}

export function threadsStoreFixtureCreate(
    output: (event: ThreadsOutput) => void = () => undefined,
): SurfaceStoreFixture<ThreadsStore, ThreadsInput> {
    const binding = threadsStoreCreateBinding(output);
    return fixtureCreate(binding, binding.threadsInput);
}

export function threadStoreFixtureCreate(
    rootMessageId: string,
    output: (event: ThreadOutput) => void = () => undefined,
): SurfaceStoreFixture<ThreadStore, ThreadInput> {
    const binding = threadStoreCreateBinding(rootMessageId, output);
    return fixtureCreate(binding, binding.threadInput);
}

export function callsStoreFixtureCreate(
    output: (event: CallsOutput) => void = () => undefined,
): SurfaceStoreFixture<CallsStore, CallsInput> {
    const binding = callsStoreCreateBinding(output);
    return fixtureCreate(binding, binding.callsInput);
}

export function settingsStoreFixtureCreate(
    options: SettingsStoreOptions = {},
    output: (event: SettingsOutput) => void = () => undefined,
): SurfaceStoreFixture<SettingsStore, SettingsInput> {
    const binding = settingsStoreCreateBinding(options, output);
    return fixtureCreate(binding, binding.settingsInput);
}

export function workspaceStoreFixtureCreate(
    chatId: string,
    output: (event: WorkspaceOutput) => void = () => undefined,
): SurfaceStoreFixture<WorkspaceStore, WorkspaceInput> {
    const binding = workspaceStoreCreateBinding(chatId, output);
    return fixtureCreate(binding, binding.workspaceInput);
}

export function workspaceFileStoreFixtureCreate(
    chatId: string,
    path: string,
): SurfaceStoreFixture<WorkspaceFileStore, WorkspaceFileInput> {
    const binding = workspaceFileStoreCreateBinding(chatId, path);
    return fixtureCreate(binding, binding.workspaceFileInput);
}
