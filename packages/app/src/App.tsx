import { createSignal, Match, Show, Switch, type JSX } from "solid-js";
import { AppShell, Avatar, Rail, TitleBar } from "rigged-ui";
import { AuthGate, type AuthSession } from "./components/AuthGate";
import {
    adminUsers,
    automations,
    callHistory,
    callParticipants,
    homeStats,
    incomingCallParticipants,
    integrations,
    mediaItems,
    moderationReports,
    notifications,
    profile,
    profileAvailability,
    profileStatus,
    railItems,
    searchResults,
    settings,
    threads,
} from "./mockData";
import { AdminView } from "./views/AdminView";
import { CallsView } from "./views/CallsView";
import { ChatView } from "./views/ChatView";
import { FilesView } from "./views/FilesView";
import { HomeView } from "./views/HomeView";
import { InboxView } from "./views/InboxView";
import { SearchOverlay } from "./views/SearchOverlay";
import { SettingsView } from "./views/SettingsView";
import { ThreadsView } from "./views/ThreadsView";

type AppProps = {
    platform?: "desktop" | "web";
    serverUrl?: string;
};

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

    const user = () => props.session?.user;
    const userName = () => user()?.firstName ?? "Steve";
    const userInitials = () => user()?.firstName.slice(0, 2).toUpperCase() ?? "ST";

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
            items={railItems}
            onItemSelect={setActiveFeatureId}
        />
    );

    const titleBar = () => (
        <TitleBar
            onSearchChange={setSearch}
            searchPlaceholder="Search Rigged…"
            searchValue={search()}
            showWindowControls={props.platform === "desktop"}
        />
    );

    /* Shared shell for the feature views that don't own their own layout. A live
     * TitleBar search value swaps the feature content for the search overlay so
     * every rail area (except chat, which filters its own sidebar) exposes the
     * shared SearchResults panel. */
    const FeatureShell = (shellProps: { children: JSX.Element }) => (
        <AppShell rail={rail()} titleBar={titleBar()}>
            <Show fallback={shellProps.children} when={search().trim()}>
                <SearchOverlay
                    groups={searchResults}
                    onClose={() => setSearch("")}
                    query={search()}
                />
            </Show>
        </AppShell>
    );

    return (
        <Switch
            fallback={
                <FeatureShell>
                    <HomeView
                        notifications={notifications}
                        session={props.session}
                        stats={homeStats}
                    />
                </FeatureShell>
            }
        >
            <Match when={activeFeatureId() === "chat"}>
                <ChatView
                    platform={props.platform}
                    rail={rail()}
                    search={search}
                    session={props.session}
                    titleBar={titleBar()}
                />
            </Match>
            <Match when={activeFeatureId() === "home"}>
                <FeatureShell>
                    <HomeView
                        notifications={notifications}
                        session={props.session}
                        stats={homeStats}
                    />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "activity"}>
                <FeatureShell>
                    <InboxView notifications={notifications} />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "threads"}>
                <FeatureShell>
                    <ThreadsView threads={threads} />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "files"}>
                <FeatureShell>
                    <FilesView items={mediaItems} session={props.session} />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "calls"}>
                <FeatureShell>
                    <CallsView
                        history={callHistory}
                        incoming={incomingCallParticipants}
                        participants={callParticipants}
                    />
                </FeatureShell>
            </Match>
            <Match when={activeFeatureId() === "admin"}>
                <FeatureShell>
                    <AdminView
                        automations={automations}
                        integrations={integrations}
                        reports={moderationReports}
                        users={adminUsers}
                    />
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
