import { useLayoutEffect, useState, type ReactNode } from "react";
import {
    adminStoreFixtureCreate,
    agentImagesStoreFixtureCreate,
    agentSecretsStoreFixtureCreate,
    pluginsStoreFixtureCreate,
    rolesStoreFixtureCreate,
    callsStoreFixtureCreate,
    filesStoreFixtureCreate,
    notificationsStoreFixtureCreate,
    searchStoreFixtureCreate,
    threadsStoreFixtureCreate,
} from "happy2-state/testing";
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
            return (
                <NotificationsPage
                    number="P-003"
                    title="Home"
                    render={(store) => <HomePage notificationsStore={store} />}
                />
            );
        case "activity":
            return (
                <NotificationsPage
                    number="P-004"
                    title="Activity"
                    render={(store) => <ActivityPage store={store} />}
                />
            );
        case "threads":
            return <ThreadsPageSpecimen />;
        case "calls":
            return <CallsPageSpecimen />;
        case "files":
            return <FilesPageSpecimen />;
        case "search":
            return <SearchPageSpecimen />;
        case "admin":
            return <AdminPageSpecimen />;
        case "agent-images":
            return <AgentImagesPageSpecimen />;
        case "agent-secrets":
            return <AgentSecretsPageSpecimen />;
    }
}
function frame(number: string, title: string, detail: string, child: ReactNode) {
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
function NotificationsPage(props: {
    number: string;
    title: string;
    render: (store: ReturnType<typeof notificationsStoreFixtureCreate>["store"]) => ReactNode;
}) {
    const [fixture] = useState(() => {
        const value = notificationsStoreFixtureCreate();
        value.input({ type: "notificationsLoaded", notifications: [] });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        props.number,
        props.title,
        "ready empty activity projection",
        props.render(fixture.store),
    );
}
function ThreadsPageSpecimen() {
    const [fixture] = useState(() => {
        const value = threadsStoreFixtureCreate();
        value.input({ type: "threadsLoaded", threads: [] });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-005",
        "Threads",
        "ready empty followed-thread projection",
        <ThreadsPage store={fixture.store} />,
    );
}
function CallsPageSpecimen() {
    const [fixture] = useState(() => {
        const value = callsStoreFixtureCreate();
        value.input({ type: "callsLoaded", calls: [] });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-006",
        "Calls",
        "ready empty call history projection",
        <CallsPage store={fixture.store} />,
    );
}
function FilesPageSpecimen() {
    const [fixture] = useState(() => {
        const value = filesStoreFixtureCreate();
        value.input({ type: "filesLoaded", files: [], append: false });
        return value;
    });
    const [filter, setFilter] = useState<FilesPageFilter>("all");
    const [query, setQuery] = useState("");
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-007",
        "Files",
        "ready empty file catalog projection",
        <FilesPage
            filter={filter}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            query={query}
            store={fixture.store}
        />,
    );
}
function SearchPageSpecimen() {
    const [fixture] = useState(() => {
        const value = searchStoreFixtureCreate();
        value.store.getState().queryUpdate("state architecture");
        value.input({
            type: "searchLoaded",
            query: "state architecture",
            results: [],
            files: [],
        });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-008",
        "Search",
        "completed query with an empty result projection",
        <SearchPage query="state architecture" store={fixture.store} />,
    );
}
function AdminPageSpecimen() {
    const [{ fixture, images, secrets, plugins, roles }] = useState(() => {
        const fixture = adminStoreFixtureCreate();
        const images = agentImagesStoreFixtureCreate();
        const secrets = agentSecretsStoreFixtureCreate();
        const plugins = pluginsStoreFixtureCreate();
        const roles = rolesStoreFixtureCreate();
        fixture.input({ type: "usersLoaded", users: [] });
        images.input({ type: "imagesLoaded", images: [] });
        secrets.input({ type: "secretsLoaded", secrets: [], agents: [], channels: [] });
        plugins.input({ type: "pluginsLoaded", plugins: [] });
        roles.input({
            type: "catalogLoaded",
            catalog: { permissions: [], roles: [] },
        });
        roles.input({ type: "membersLoaded", members: [] });
        return { fixture, images, secrets, plugins, roles };
    });
    const [section, setSection] = useState<AdminPageSection>("users");
    useLayoutEffect(
        () => () => {
            fixture[Symbol.dispose]();
            images[Symbol.dispose]();
            secrets[Symbol.dispose]();
            plugins[Symbol.dispose]();
            roles[Symbol.dispose]();
        },
        [fixture, images, secrets, plugins, roles],
    );
    return frame(
        "P-009",
        "Admin",
        "ready user catalog with lazy image, secret, and plugin stores",
        <AdminPage
            activeSection={section}
            agentImagesStore={() => images.store}
            agentSecretsStore={() => secrets.store}
            onSectionChange={setSection}
            pluginsStore={() => plugins.store}
            rolesStore={() => roles.store}
            store={() => fixture.store}
        />,
    );
}
function AgentImagesPageSpecimen() {
    const [fixture] = useState(() => {
        const value = agentImagesStoreFixtureCreate();
        value.input({ type: "imagesLoaded", images: [] });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-010",
        "Agent images",
        "ready empty agent-image catalog projection",
        <AgentImagesPage store={fixture.store} />,
    );
}
function AgentSecretsPageSpecimen() {
    const [fixture] = useState(() => {
        const value = agentSecretsStoreFixtureCreate();
        value.input({ type: "secretsLoaded", secrets: [], agents: [], channels: [] });
        return value;
    });
    useLayoutEffect(() => () => fixture[Symbol.dispose](), [fixture]);
    return frame(
        "P-011",
        "Agent secrets",
        "ready empty write-only secret catalog projection",
        <AgentSecretsPage store={fixture.store} />,
    );
}
