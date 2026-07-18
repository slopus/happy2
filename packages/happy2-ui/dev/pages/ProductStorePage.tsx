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
import { createSignal, onCleanup, type JSX } from "solid-js";
import { ActivityPage } from "../../src/pages/activity/ActivityPage";
import { AdminPage, type AdminPageSection } from "../../src/pages/admin/AdminPage";
import { AgentImagesPage } from "../../src/pages/admin/AgentImagesPage";
import { AgentSecretsPage } from "../../src/pages/admin/AgentSecretsPage";
import { CallsPage } from "../../src/pages/calls/CallsPage";
import { FilesPage, type FilesPageFilter } from "../../src/pages/files/FilesPage";
import { HomePage } from "../../src/pages/home/HomePage";
import { SearchPage } from "../../src/pages/search/SearchPage";
import { ThreadsPage } from "../../src/pages/threads/ThreadsPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export type ProductStorePageKind =
    | "home"
    | "activity"
    | "threads"
    | "calls"
    | "files"
    | "search"
    | "admin"
    | "agent-images"
    | "agent-secrets";

/** Routes one Full screens catalog entry to its isolated deterministic surface-store fixture. */
export function ProductStorePage(props: { kind: ProductStorePageKind }) {
    switch (props.kind) {
        case "home":
            return notificationsPage("P-003", "Home", (store) => (
                <HomePage notificationsStore={store} />
            ));
        case "activity":
            return notificationsPage("P-004", "Activity", (store) => (
                <ActivityPage store={store} />
            ));
        case "threads":
            return threadsPage();
        case "calls":
            return callsPage();
        case "files":
            return filesPage();
        case "search":
            return searchPage();
        case "admin":
            return adminPage();
        case "agent-images":
            return agentImagesPage();
        case "agent-secrets":
            return agentSecretsPage();
    }
}

function frame(number: string, title: string, detail: string, child: JSX.Element) {
    return (
        <ComponentPage
            contract="Surface store"
            number={number}
            summary={`${title} is a complete product page driven by a concrete framework-neutral surface store and deterministic owner input.`}
            title={`${title} page`}
        >
            <FullScreenSpecimen
                detail={`${detail} · real in-memory store · no transport or authentication`}
                label={`${title} — deterministic`}
                number="01"
            >
                {child}
            </FullScreenSpecimen>
        </ComponentPage>
    );
}

function notificationsPage(
    number: string,
    title: string,
    render: (store: ReturnType<typeof notificationsStoreFixtureCreate>["store"]) => JSX.Element,
) {
    const fixture = notificationsStoreFixtureCreate();
    fixture.input({ type: "notificationsLoaded", notifications: [] });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(number, title, "ready empty activity projection", render(fixture.store));
}

function threadsPage() {
    const fixture = threadsStoreFixtureCreate();
    fixture.input({ type: "threadsLoaded", threads: [] });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-005",
        "Threads",
        "ready empty followed-thread projection",
        <ThreadsPage store={fixture.store} />,
    );
}

function callsPage() {
    const fixture = callsStoreFixtureCreate();
    fixture.input({ type: "callsLoaded", calls: [] });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-006",
        "Calls",
        "ready empty call history projection",
        <CallsPage store={fixture.store} />,
    );
}

function filesPage() {
    const fixture = filesStoreFixtureCreate();
    const [filter, setFilter] = createSignal<FilesPageFilter>("all");
    const [query, setQuery] = createSignal("");
    fixture.input({ type: "filesLoaded", files: [], append: false });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-007",
        "Files",
        "ready empty file catalog projection",
        <FilesPage
            filter={filter()}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            query={query()}
            store={fixture.store}
        />,
    );
}

function searchPage() {
    const fixture = searchStoreFixtureCreate();
    fixture.store.queryUpdate("state architecture");
    fixture.input({
        type: "searchLoaded",
        query: "state architecture",
        results: [],
        files: [],
    });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-008",
        "Search",
        "completed query with an empty result projection",
        <SearchPage query="state architecture" store={fixture.store} />,
    );
}

function adminPage() {
    const fixture = adminStoreFixtureCreate();
    const images = agentImagesStoreFixtureCreate();
    const secrets = agentSecretsStoreFixtureCreate();
    const [section, setSection] = createSignal<AdminPageSection>("users");
    fixture.input({ type: "usersLoaded", users: [] });
    images.input({ type: "imagesLoaded", images: [] });
    secrets.input({ type: "secretsLoaded", secrets: [], agents: [], channels: [] });
    onCleanup(() => {
        fixture[Symbol.dispose]();
        images[Symbol.dispose]();
        secrets[Symbol.dispose]();
    });
    return frame(
        "P-009",
        "Admin",
        "ready user catalog with lazy image and secret stores",
        <AdminPage
            activeSection={section()}
            agentImagesStore={() => images.store}
            agentSecretsStore={() => secrets.store}
            onSectionChange={setSection}
            store={fixture.store}
        />,
    );
}

function agentImagesPage() {
    const fixture = agentImagesStoreFixtureCreate();
    fixture.input({ type: "imagesLoaded", images: [] });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-010",
        "Agent images",
        "ready empty agent-image catalog projection",
        <AgentImagesPage store={fixture.store} />,
    );
}

function agentSecretsPage() {
    const fixture = agentSecretsStoreFixtureCreate();
    fixture.input({ type: "secretsLoaded", secrets: [], agents: [], channels: [] });
    onCleanup(() => fixture[Symbol.dispose]());
    return frame(
        "P-011",
        "Agent secrets",
        "ready empty write-only secret catalog projection",
        <AgentSecretsPage store={fixture.store} />,
    );
}
