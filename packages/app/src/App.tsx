import { createSignal, For, Match, Show, Switch } from "solid-js";
import {
    AgentDesk,
    AgentRunCard,
    AppShell,
    ApprovalCard,
    Avatar,
    Button,
    ChannelHeader,
    Composer,
    DayDivider,
    DiffSnippet,
    EventCard,
    Icon,
    Message,
    MessageList,
    Rail,
    Sidebar,
    TitleBar,
    type ApprovalResolution,
} from "rigged-ui";
import { AuthGate } from "./components/AuthGate";
import {
    chatSections,
    composerHint,
    conversations,
    deskDone,
    deskQueued,
    deskRunning,
    featureEmptyStates,
    initialEntries,
    mentionableAgents,
    railItems,
    type ThreadDivider,
    type ThreadEntry,
    type ThreadMessage,
} from "./mockData";
import type { User } from "./server";

type AppProps = {
    platform?: "desktop" | "web";
    serverUrl?: string;
};

const asDivider = (entry: ThreadEntry): ThreadDivider | undefined =>
    entry.kind === "divider" ? entry : undefined;
const asMessage = (entry: ThreadEntry): ThreadMessage | undefined =>
    entry.kind === "message" ? entry : undefined;

function Workspace(props: AppProps & { user?: User }) {
    const [activeFeatureId, setActiveFeatureId] = createSignal("chat");
    const [activeConversationId, setActiveConversationId] = createSignal("launch-week");
    const [search, setSearch] = createSignal("");
    const [draft, setDraft] = createSignal("");
    const [entries, setEntries] = createSignal<ThreadEntry[]>(initialEntries);
    const [expandedRuns, setExpandedRuns] = createSignal<Record<string, boolean>>({});
    const [expandedApprovals, setExpandedApprovals] = createSignal<Record<string, boolean>>({});
    const [approvalResolutions, setApprovalResolutions] = createSignal<
        Record<string, ApprovalResolution>
    >({});
    const [toggledReactions, setToggledReactions] = createSignal<Record<string, boolean>>({});

    const userName = () => props.user?.firstName ?? "Steve";
    const userInitials = () => props.user?.firstName.slice(0, 2).toUpperCase() ?? "ST";

    const conversation = () =>
        conversations[activeConversationId()] ?? conversations["launch-week"]!;
    const conversationEntries = () =>
        entries().filter((entry) => entry.conversationId === activeConversationId());
    const emptyState = () => featureEmptyStates[activeFeatureId()] ?? featureEmptyStates["home"]!;

    const reactionsFor = (message: ThreadMessage) =>
        message.reactions?.map((reaction) =>
            toggledReactions()[`${message.id}:${reaction.emoji}`]
                ? { ...reaction, count: reaction.count + 1, active: true }
                : reaction,
        );
    const toggleReaction = (messageId: string, emoji: string) =>
        setToggledReactions((current) => ({
            ...current,
            [`${messageId}:${emoji}`]: !current[`${messageId}:${emoji}`],
        }));

    const selectConversation = (id: string) => {
        setActiveConversationId(id);
        setDraft("");
    };

    const sendMessage = () => {
        const body = draft().trim();
        if (!body) return;
        setEntries((current) => [
            ...current,
            {
                kind: "message",
                id: `sent-${current.length}`,
                conversationId: activeConversationId(),
                author: userName(),
                initials: userInitials(),
                tone: "brand",
                time: "Now",
                body,
            },
        ]);
        setDraft("");
    };

    return (
        <AppShell
            titleBar={
                <TitleBar
                    onSearchChange={setSearch}
                    searchPlaceholder="Search Rigged…"
                    searchValue={search()}
                    showWindowControls={props.platform === "desktop"}
                    trailing={
                        <>
                            <Button
                                aria-label="History"
                                icon="clock"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label="Settings"
                                icon="settings"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        </>
                    }
                />
            }
            rail={
                <Rail
                    activeItemId={activeFeatureId()}
                    footer={
                        <Avatar
                            aria-label={`${userName()} — online`}
                            imageUrl={props.user?.avatarUrl}
                            initials={userInitials()}
                            online
                            size="md"
                            tone="brand"
                        />
                    }
                    items={railItems}
                    onItemSelect={setActiveFeatureId}
                />
            }
            sidebar={
                activeFeatureId() === "chat" ? (
                    <Sidebar
                        activeItemId={activeConversationId()}
                        footer={
                            <div class="sidebar-user">
                                <Avatar
                                    imageUrl={props.user?.avatarUrl}
                                    initials={userInitials()}
                                    online
                                    size="sm"
                                    tone="brand"
                                />
                                <span class="sidebar-user-name">{userName()}</span>
                                <span class="sidebar-user-meta">online</span>
                            </div>
                        }
                        onItemSelect={selectConversation}
                        sections={chatSections}
                        title={props.user ? `${props.user.firstName}’s Rigged` : "Rigged"}
                    />
                ) : undefined
            }
            panel={
                activeFeatureId() === "chat" ? (
                    <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                ) : undefined
            }
        >
            <Show
                when={activeFeatureId() === "chat"}
                fallback={
                    <div class="feature-empty">
                        <Icon name={emptyState().icon} size={20} />
                        <h2>{emptyState().title}</h2>
                        <p>{emptyState().description}</p>
                    </div>
                }
            >
                <ChannelHeader
                    agentCount={conversation().agentCount}
                    icon={conversation().icon}
                    memberCount={conversation().memberCount}
                    members={conversation().members}
                    title={conversation().title}
                    topic={conversation().topic}
                />
                <MessageList intro={conversation().intro}>
                    <For each={conversationEntries()}>
                        {(entry) => (
                            <Switch>
                                <Match when={asDivider(entry)}>
                                    {(divider) => <DayDivider label={divider().label} />}
                                </Match>
                                <Match when={asMessage(entry)}>
                                    {(message) => {
                                        const item = message();
                                        const attachment = item.attachment;
                                        return (
                                            <Message
                                                agent={item.agent}
                                                author={item.author}
                                                body={item.body}
                                                initials={item.initials}
                                                onReactionSelect={(emoji) =>
                                                    toggleReaction(item.id, emoji)
                                                }
                                                reactions={reactionsFor(item)}
                                                replyCount={item.replyCount}
                                                time={item.time}
                                                tone={item.tone}
                                            >
                                                {attachment?.kind === "run" && (
                                                    <AgentRunCard
                                                        actions={attachment.actions}
                                                        expanded={expandedRuns()[item.id] ?? false}
                                                        onExpandedChange={(expanded) =>
                                                            setExpandedRuns((current) => ({
                                                                ...current,
                                                                [item.id]: expanded,
                                                            }))
                                                        }
                                                        run={attachment.run}
                                                    >
                                                        {attachment.diff && (
                                                            <DiffSnippet
                                                                file={attachment.diff.file}
                                                                lines={attachment.diff.lines}
                                                                stats={attachment.diff.stats}
                                                            />
                                                        )}
                                                    </AgentRunCard>
                                                )}
                                                {attachment?.kind === "approval" && (
                                                    <ApprovalCard
                                                        expanded={
                                                            expandedApprovals()[item.id] ?? false
                                                        }
                                                        onExpandedChange={(expanded) =>
                                                            setExpandedApprovals((current) => ({
                                                                ...current,
                                                                [item.id]: expanded,
                                                            }))
                                                        }
                                                        onResolutionChange={(resolution) =>
                                                            setApprovalResolutions((current) => ({
                                                                ...current,
                                                                [item.id]: resolution,
                                                            }))
                                                        }
                                                        request={attachment.request}
                                                        resolution={
                                                            approvalResolutions()[item.id] ??
                                                            "pending"
                                                        }
                                                    />
                                                )}
                                                {attachment?.kind === "event" && (
                                                    <EventCard
                                                        badge={attachment.event.badge}
                                                        from={attachment.event.from}
                                                        icon={attachment.event.icon}
                                                        meta={attachment.event.meta}
                                                        time={attachment.event.time}
                                                        title={attachment.event.title}
                                                        to={attachment.event.to}
                                                    />
                                                )}
                                            </Message>
                                        );
                                    }}
                                </Match>
                            </Switch>
                        )}
                    </For>
                </MessageList>
                <Composer
                    agents={mentionableAgents}
                    hint={composerHint}
                    onSend={sendMessage}
                    onValueChange={setDraft}
                    placeholder={conversation().composerPlaceholder}
                    style={{ margin: "0 20px 16px" }}
                    value={draft()}
                />
            </Show>
        </AppShell>
    );
}

export function App(props: AppProps) {
    return props.serverUrl ? (
        <AuthGate serverUrl={props.serverUrl}>
            {(user) => <Workspace {...props} user={user} />}
        </AuthGate>
    ) : (
        <Workspace {...props} />
    );
}
