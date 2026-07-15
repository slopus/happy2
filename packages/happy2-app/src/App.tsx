import { createSignal, Match, Show, Switch, type JSX } from "solid-js";
import { AppShell, Avatar, Rail, TitleBar, type RailItem, type SearchResultType } from "happy2-ui";
import { AuthGate, type AuthSession } from "./components/AuthGate";
import { profile, profileAvailability, profileStatus, settings } from "./mockData";
import { AdminView } from "./views/AdminView";
import { ChatView } from "./views/ChatView";
import { FilesView } from "./views/FilesView";
import { SearchOverlay } from "./views/SearchOverlay";
import { SettingsView } from "./views/SettingsView";

type AppProps = {
    platform?: "desktop" | "web";
    serverUrl?: string;
};

const railItems: RailItem[] = [
    { id: "chat", icon: "chat", label: "Chat" },
    { id: "files", icon: "files", label: "Files" },
    { id: "admin", icon: "shield", label: "Admin" },
];

/**
 * The application shell: owns the active-rail-feature and the shared TitleBar
 * search, builds the App-level Rail and TitleBar, and routes each rail id to a
 * FeatureView. Chat is the live Workspace (ChatView owns the AppShell so it can
 * fill the sidebar + agent-desk panel); every other feature renders inside a
 * shared AppShell.
 */
function Shell(props: AppProps & { session?: AuthSession }) {
    const [activeFeatureId, setActiveFeatureId] = createSignal("chat");
    const [search, setSearch] = createSignal("");
    const [createRequest, setCreateRequest] = createSignal<{
        kind: "agent" | "channel";
        nonce: number;
    }>({ kind: "agent", nonce: 0 });

    const user = () => props.session?.user;
    const userName = () => user()?.firstName ?? "Steve";
    const userInitials = () => user()?.firstName?.slice(0, 2).toUpperCase() ?? "ST";

    const requestCreate = (kind: "agent" | "channel") => {
        setActiveFeatureId("chat");
        setSearch("");
        setCreateRequest((request) => ({ kind, nonce: request.nonce + 1 }));
    };

    const rail = () => (
        <Rail
            activeItemId={activeFeatureId()}
            footer={
                <Avatar
                    aria-label={`${userName()} — online`}
                    imageUrl={user()?.avatarUrl}
                    initials={userInitials()}
                    online
                    size="md"
                    tone="brand"
                />
            }
            footerLabel="Open profile"
            items={railItems}
            onFooterSelect={() => setActiveFeatureId("you")}
            onItemSelect={setActiveFeatureId}
            primaryAction={{
                icon: "plus",
                label: "Create",
                menuItems: [
                    { id: "agent", icon: "spark", kind: "item", label: "New agent" },
                    { id: "channel", icon: "hash", kind: "item", label: "New channel" },
                ],
                onMenuSelect: (id) => {
                    if (id === "agent" || id === "channel") requestCreate(id);
                },
            }}
        />
    );

    const titleBar = () => (
        <TitleBar
            onSearchChange={setSearch}
            searchPlaceholder="Search Happy (2)…"
            searchValue={search()}
            showWindowControls={props.platform === "desktop"}
        />
    );

    /* Shared shell for feature views and global search. A live TitleBar search
     * value replaces the current feature with one real, workspace-wide result
     * surface, including when the user starts searching from Chat. */
    const selectSearchResult = (type: SearchResultType) => {
        setSearch("");
        setActiveFeatureId(type === "file" ? "files" : "chat");
    };

    const FeatureShell = (shellProps: { children?: JSX.Element }) => (
        <AppShell rail={rail()} titleBar={titleBar()}>
            <Show fallback={shellProps.children ?? null} when={search().trim()}>
                <SearchOverlay
                    onSelect={selectSearchResult}
                    query={search()}
                    session={props.session}
                />
            </Show>
        </AppShell>
    );

    return (
        <Switch fallback={null}>
            <Match when={activeFeatureId() === "chat"}>
                <Show
                    fallback={
                        <ChatView
                            createRequest={createRequest}
                            platform={props.platform}
                            rail={rail()}
                            search={search}
                            session={props.session}
                            titleBar={titleBar()}
                        />
                    }
                    when={search().trim()}
                >
                    <FeatureShell />
                </Show>
            </Match>
            <Match when={activeFeatureId() === "files"}>
                <FeatureShell>
                    <FilesView session={props.session} />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "admin"}>
                <FeatureShell>
                    <AdminView session={props.session} />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "you"}>
                <FeatureShell>
                    <SettingsView
                        availability={profileAvailability}
                        profile={profile}
                        session={props.session}
                        settings={settings}
                        status={profileStatus}
                    />
                </FeatureShell>
            </Match>
        </Switch>
    );
}

export function App(props: AppProps) {
    return props.serverUrl ? (
        <AuthGate serverUrl={props.serverUrl} showWindowDragRegion={props.platform === "desktop"}>
            {(session) => <Shell {...props} session={session} />}
        </AuthGate>
    ) : (
        <Shell {...props} />
    );
}
