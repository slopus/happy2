import {
    adminStoreFixtureCreate,
    agentImagesStoreFixtureCreate,
    agentSecretsStoreFixtureCreate,
    callsStoreFixtureCreate,
    filesStoreFixtureCreate,
    notificationsStoreFixtureCreate,
    searchStoreFixtureCreate,
    threadsStoreFixtureCreate,
} from "happy2-state/testing";
import { expect, it, onTestFinished } from "vitest";
import { createRenderer } from "../testing";
import { ActivityPage } from "./activity/ActivityPage";
import { AdminPage } from "./admin/AdminPage";
import { AgentImagesPage } from "./admin/AgentImagesPage";
import { AgentSecretsPage } from "./admin/AgentSecretsPage";
import { CallsPage } from "./calls/CallsPage";
import { FilesPage } from "./files/FilesPage";
import { HomePage } from "./home/HomePage";
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
