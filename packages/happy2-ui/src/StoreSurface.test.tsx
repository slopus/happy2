import { useLayoutEffect, useState, type ReactNode } from "react";
import { UserError, type ComposerStore } from "happy2-state";
import {
    adminStoreFixtureCreate,
    agentImagesStoreFixtureCreate,
    agentSecretsStoreFixtureCreate,
    callsStoreFixtureCreate,
    chatStoreFixtureCreate,
    composerStoreFixtureCreate,
    directoryStoreFixtureCreate,
    filesStoreFixtureCreate,
    notificationsStoreFixtureCreate,
    searchStoreFixtureCreate,
    settingsStoreFixtureCreate,
    sidebarStoreFixtureCreate,
    workspaceFileStoreFixtureCreate,
    workspaceStoreFixtureCreate,
} from "happy2-state/testing";
import { expect, it, onTestFinished } from "vitest";
import { StoreSurface } from "./StoreSurface";
import { createRenderer } from "./testing";
function fixtureDispose<Fixture extends Disposable>(fixture: Fixture): Fixture {
    onTestFinished(() => fixture[Symbol.dispose]());
    return fixture;
}
it("renders every concrete HappyState surface from its deterministic real-store fixture", async () => {
    const sidebar = fixtureDispose(sidebarStoreFixtureCreate());
    const chat = fixtureDispose(chatStoreFixtureCreate("chat-1"));
    const composer = fixtureDispose(composerStoreFixtureCreate("chat-1"));
    const search = fixtureDispose(searchStoreFixtureCreate());
    const files = fixtureDispose(filesStoreFixtureCreate());
    const directory = fixtureDispose(directoryStoreFixtureCreate());
    const admin = fixtureDispose(adminStoreFixtureCreate());
    const images = fixtureDispose(agentImagesStoreFixtureCreate());
    const secrets = fixtureDispose(agentSecretsStoreFixtureCreate());
    const notifications = fixtureDispose(notificationsStoreFixtureCreate());
    const calls = fixtureDispose(callsStoreFixtureCreate());
    const settings = fixtureDispose(settingsStoreFixtureCreate());
    const workspace = fixtureDispose(workspaceStoreFixtureCreate("chat-1"));
    const workspaceFile = fixtureDispose(workspaceFileStoreFixtureCreate("chat-1", "src/main.ts"));
    const view = createRenderer();
    const render = (component: () => ReactNode) =>
        view.render(component, { width: 240, height: 32 });
    render(() => (
        <StoreSurface store={sidebar.store}>
            {(snapshot) => <output data-testid="sidebar">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={chat.store}>
            {(snapshot) => <output data-testid="chat">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={composer}>
            {(snapshot) => <output data-testid="composer">{snapshot.text}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={search.store}>
            {(snapshot) => <output data-testid="search">{snapshot.results.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={files.store}>
            {(snapshot) => <output data-testid="files">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={directory.store}>
            {(snapshot) => <output data-testid="directory">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={admin.store}>
            {(snapshot) => <output data-testid="admin">{snapshot.users.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={images.store}>
            {(snapshot) => <output data-testid="images">{snapshot.images.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={secrets.store}>
            {(snapshot) => <output data-testid="secrets">{snapshot.secrets.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={notifications.store}>
            {(snapshot) => (
                <output data-testid="notifications">{snapshot.notifications.type}</output>
            )}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={calls.store}>
            {(snapshot) => <output data-testid="calls">{snapshot.calls.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={settings.store}>
            {(snapshot) => <output data-testid="settings">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={workspace.store}>
            {(snapshot) => <output data-testid="workspace">{snapshot.status.type}</output>}
        </StoreSurface>
    ));
    render(() => (
        <StoreSurface store={workspaceFile.store}>
            {(snapshot) => <output data-testid="workspace-file">{snapshot.file.type}</output>}
        </StoreSurface>
    ));
    await view.ready();
    sidebar.input({ type: "sidebarLoading" });
    chat.input({ type: "chatLoading" });
    composer.getState().textUpdate("typed locally");
    search.store.getState().queryUpdate("relay");
    search.input({ type: "searchLoading", query: "relay" });
    files.input({ type: "filesLoading" });
    directory.input({ type: "directoryLoading" });
    admin.input({ type: "adminLoading" });
    images.input({ type: "imagesLoading" });
    secrets.input({ type: "secretsLoading" });
    notifications.input({ type: "notificationsLoading" });
    calls.input({ type: "callsLoading" });
    settings.input({ type: "settingsLoadFailed", error: new UserError("offline") });
    workspace.input({ type: "workspaceLoading" });
    workspaceFile.input({ type: "fileLoading" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    for (const id of [
        "sidebar",
        "chat",
        "search",
        "files",
        "directory",
        "admin",
        "images",
        "secrets",
        "notifications",
        "calls",
        "workspace",
        "workspace-file",
    ]) {
        expect(
            view.container.querySelector(`[data-testid="${id}"]`)?.textContent,
            `${id} fixture input must update its mounted surface`,
        ).toBe("loading");
    }
    expect(view.container.querySelector('[data-testid="composer"]')?.textContent).toBe(
        "typed locally",
    );
    expect(view.container.querySelector('[data-testid="settings"]')?.textContent).toBe("error");
});
function subscriptionTracked(store: ComposerStore) {
    const counts = { active: 0, total: 0 };
    const tracked: ComposerStore = {
        ...store,
        subscribe(listener) {
            counts.active += 1;
            counts.total += 1;
            const unsubscribe = store.subscribe(listener);
            return () => {
                counts.active -= 1;
                unsubscribe();
            };
        },
    };
    return { counts, store: tracked };
}
it("owns one subscription, routes safe actions, and rebinds cleanly when store identity changes", async () => {
    const firstFixture = fixtureDispose(composerStoreFixtureCreate("first"));
    const secondFixture = fixtureDispose(composerStoreFixtureCreate("second"));
    const first = subscriptionTracked(firstFixture);
    const second = subscriptionTracked(secondFixture);
    const view = createRenderer();
    let childMounts = 0;
    let setStore!: (store: ComposerStore) => void;
    function DraftButton(props: {
        actions: ReturnType<ComposerStore["getState"]>;
        scopeId: string;
        text: string;
    }) {
        useLayoutEffect(() => {
            childMounts += 1;
        }, []);
        return (
            <button
                data-testid="draft"
                onClick={() => props.actions.textUpdate(`${props.scopeId} updated`)}
            >
                {props.scopeId}:{props.text}
            </button>
        );
    }
    function SurfaceFixture() {
        const [store, updateStore] = useState<ComposerStore>(first.store);
        setStore = updateStore;
        return (
            <StoreSurface store={store}>
                {(snapshot, actions) => (
                    <DraftButton
                        actions={actions}
                        scopeId={snapshot.scopeId}
                        text={snapshot.text}
                    />
                )}
            </StoreSurface>
        );
    }
    view.render(SurfaceFixture, { width: 240, height: 40 });
    await view.ready();
    expect(first.counts).toEqual({ active: 1, total: 1 });
    expect(childMounts).toBe(1);
    view.container.querySelector<HTMLButtonElement>('[data-testid="draft"]')?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector('[data-testid="draft"]')?.textContent).toBe(
        "first:first updated",
    );
    expect(childMounts).toBe(1);
    setStore(second.store);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(first.counts.active).toBe(0);
    expect(second.counts).toEqual({ active: 1, total: 1 });
    expect(childMounts).toBe(2);
    expect(view.container.querySelector('[data-testid="draft"]')?.textContent).toBe("second:");
    view.destroy();
    expect(second.counts.active).toBe(0);
});
