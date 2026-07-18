import {
    adminStoreFixtureCreate,
    agentImagesStoreFixtureCreate,
    agentSecretsStoreFixtureCreate,
    callsStoreFixtureCreate,
    directoryStoreFixtureCreate,
    filesStoreFixtureCreate,
    notificationsStoreFixtureCreate,
    searchStoreFixtureCreate,
    threadsStoreFixtureCreate,
} from "happy2-state/testing";
import { UserError, type NotificationProjection } from "happy2-state";
import { expect, it, onTestFinished, vi } from "vitest";
import "../styles.css";
import { createRenderer } from "../testing";
import { ActivityPage } from "./activity/ActivityPage";
import { AdminPage } from "./admin/AdminPage";
import { AgentImagesPage } from "./admin/AgentImagesPage";
import { AgentSecretsPage } from "./admin/AgentSecretsPage";
import { CallsPage } from "./calls/CallsPage";
import { FilesPage } from "./files/FilesPage";
import { HomePage } from "./home/HomePage";
import { ProfilePage } from "./profile/ProfilePage";
import { SearchPage } from "./search/SearchPage";
import { ThreadsPage } from "./threads/ThreadsPage";

function owned<Fixture extends Disposable>(fixture: Fixture): Fixture {
    onTestFinished(() => fixture[Symbol.dispose]());
    return fixture;
}

it("renders FilesPage from FilesStore input", async () => {
    const fixture = owned(filesStoreFixtureCreate());
    fixture.input({ type: "filesLoading" });
    const view = createRenderer();
    view.render(
        () => (
            <FilesPage
                filter="all"
                onFilterChange={() => undefined}
                onQueryChange={() => undefined}
                query=""
                store={fixture.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Loading files");
});

it("routes SearchPage query through the typed SearchStore action", async () => {
    const outputs: string[] = [];
    const fixture = owned(searchStoreFixtureCreate((event) => outputs.push(event.query)));
    const view = createRenderer();
    view.render(() => <SearchPage query="relay" store={fixture.store} />, {
        width: 1024,
        height: 704,
    });
    await view.ready();
    expect(outputs).toEqual(["relay"]);
    expect(view.container.textContent).toContain("No results");
});

it("renders AdminPage without materializing optional admin subpages", async () => {
    const admin = owned(adminStoreFixtureCreate());
    const images = owned(agentImagesStoreFixtureCreate());
    const secrets = owned(agentSecretsStoreFixtureCreate());
    admin.input({ type: "adminLoading" });
    let imageAccesses = 0;
    let secretAccesses = 0;
    const view = createRenderer();
    view.render(
        () => (
            <AdminPage
                activeSection="users"
                agentImagesStore={() => {
                    imageAccesses += 1;
                    return images.store;
                }}
                agentSecretsStore={() => {
                    secretAccesses += 1;
                    return secrets.store;
                }}
                onSectionChange={() => undefined}
                store={admin.store}
            />
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Admin");
    expect([imageAccesses, secretAccesses]).toEqual([0, 0]);
});

it("renders AgentImagesPage from its independent store", async () => {
    const fixture = owned(agentImagesStoreFixtureCreate());
    fixture.input({ type: "imagesLoading" });
    const view = createRenderer();
    view.render(() => <AgentImagesPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading");
});

it("renders AgentSecretsPage from its independent store", async () => {
    const fixture = owned(agentSecretsStoreFixtureCreate());
    fixture.input({ type: "secretsLoading" });
    const view = createRenderer();
    view.render(() => <AgentSecretsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading");
});

it("renders ActivityPage from NotificationsStore input", async () => {
    const fixture = owned(notificationsStoreFixtureCreate());
    fixture.input({ type: "notificationsLoading" });
    const view = createRenderer();
    view.render(() => <ActivityPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading activity");
});

it("keeps ActivityPage row identity and focus while reconciling authoritative activity", async () => {
    const outputs: string[] = [];
    const selected: string[] = [];
    const fixture = owned(notificationsStoreFixtureCreate((event) => outputs.push(event.type)));
    const notifications = Array.from({ length: 120 }, (_, index) => notification(index));
    fixture.input({
        type: "notificationsLoaded",
        notifications,
        nextCursor: "next-page",
    });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <ActivityPage
                    contextLabel={() => "Launch room"}
                    onSelect={(item) => selected.push(item.id)}
                    store={fixture.store}
                />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const before = view.container.querySelector<HTMLButtonElement>('[data-item-id="notice-0"]')!;
    before.focus();
    expect(document.activeElement).toBe(before);

    fixture.input({
        type: "notificationsLoaded",
        notifications: [{ ...notifications[0]!, kind: "reaction" }, ...notifications.slice(1)],
        nextCursor: "next-page",
    });
    await vi.waitFor(() =>
        expect(before.getAttribute("aria-label")).toContain("reacted to your message"),
    );
    expect(view.container.querySelector('[data-item-id="notice-0"]')).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.getAttribute("aria-label")).toContain("Launch room");

    before.click();
    expect(outputs).toContain("notificationsReadSubmitted");
    expect(selected).toEqual(["notice-0"]);
});

it("paginates ActivityPage once at the virtual-list end and surfaces terminal errors", async () => {
    const outputs: string[] = [];
    const fixture = owned(notificationsStoreFixtureCreate((event) => outputs.push(event.type)));
    fixture.input({
        type: "notificationsLoaded",
        notifications: Array.from({ length: 120 }, (_, index) => notification(index)),
        nextCursor: "next-page",
    });
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "100%" }}>
                <ActivityPage store={fixture.store} />
            </div>
        ),
        { width: 1024, height: 704 },
    );
    await view.ready();
    const list = view.container.querySelector<HTMLDivElement>(
        '[data-happy2-ui="notification-list"]',
    )!;
    expect(list.hasAttribute("data-virtualized")).toBe(true);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    for (let index = 0; index < 3; index += 1) {
        list.scrollTop = 1_000_000;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    expect(list.scrollHeight - list.scrollTop - list.clientHeight).toBeLessThanOrEqual(128);
    await vi.waitFor(() => expect(outputs).toEqual(["notificationsMoreRequested"]));
    expect(fixture.store.getState().pageLoading).toBe(true);
    expect(view.container.textContent).toContain("Loading more activity");

    fixture.input({
        type: "notificationsPageFailed",
        error: new UserError("The next activity page failed."),
    });
    await vi.waitFor(() =>
        expect(view.container.textContent).toContain("The next activity page failed."),
    );
    fixture.input({
        type: "notificationsReadFailed",
        error: new UserError("Read state failed."),
    });
    await vi.waitFor(() => expect(view.container.textContent).toContain("Read state failed."));
});

it("renders ThreadsPage from ThreadsStore input", async () => {
    const fixture = owned(threadsStoreFixtureCreate());
    fixture.input({ type: "threadsLoading" });
    const view = createRenderer();
    view.render(() => <ThreadsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading threads");
});

it("renders CallsPage from CallsStore input", async () => {
    const fixture = owned(callsStoreFixtureCreate());
    fixture.input({ type: "callsLoading" });
    const view = createRenderer();
    view.render(() => <CallsPage store={fixture.store} />, { width: 1024, height: 704 });
    await view.ready();
    expect(view.container.textContent).toContain("Loading calls");
});

it("renders HomePage from the shared NotificationsStore", async () => {
    const fixture = owned(notificationsStoreFixtureCreate());
    fixture.input({ type: "notificationsLoaded", notifications: [] });
    const view = createRenderer();
    view.render(() => <HomePage notificationsStore={fixture.store} />, {
        width: 1024,
        height: 704,
    });
    await view.ready();
    expect(view.container.textContent).toContain("Your day at a glance");
});

it("renders the route-addressable public profile from the live directory", async () => {
    const fixture = owned(directoryStoreFixtureCreate());
    fixture.input({
        type: "directoryLoaded",
        users: [
            {
                id: "user-2",
                displayName: "Grace Hopper",
                username: "grace",
                kind: "human",
                role: "admin",
                presence: "online",
                availability: "dnd",
                customStatusEmoji: "🚢",
                customStatusText: "Shipping compilers",
            },
        ],
        channels: [],
    });
    const view = createRenderer();
    view.render(() => <ProfilePage store={fixture.store} userId="user-2" />, {
        width: 720,
        height: 420,
        padding: 24,
    });
    await view.ready();
    expect(view.container.textContent).toContain("Grace Hopper");
    expect(view.container.textContent).toContain("Shipping compilers");
    expect(view.container.textContent).toContain("Administrator");
    expect(view.container.textContent).toContain("Do not disturb");
});

function notification(index: number): NotificationProjection {
    return {
        id: `notice-${index}`,
        kind: "mention",
        chatId: "chat-1",
        messageId: `message-${index}`,
        createdAt: "2026-07-17T12:00:00.000Z",
    };
}
