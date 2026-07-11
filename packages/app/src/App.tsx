import { createSignal } from "solid-js";
import type { MentionableAgent } from "./components/AgentMentionPicker";
import { ChatComposer } from "./components/ChatComposer";
import { ChatMessages, type ChatMessage } from "./components/ChatMessages";
import type { ContextItem } from "./components/ContextPicker";
import type { Delegation } from "./components/ExecutionScope";
import { Rail, type Feature } from "./components/Rail";
import { Sidebar, type SidebarItem, type SidebarSection } from "./components/Sidebar";

const features: Feature[] = [
  { id: "home", name: "Home", icon: "home" },
  { id: "agents", name: "Agents", icon: "agents" },
  { id: "tasks", name: "Tasks", icon: "tasks" },
  { id: "files", name: "Files", icon: "files" },
  { id: "more", name: "More", icon: "more" }
];

const mentionableAgents: MentionableAgent[] = [
  {
    id: "forge",
    name: "Forge",
    initials: "F",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    description: "Implements scoped product and engineering work",
    status: "ready"
  },
  {
    id: "scout",
    name: "Scout",
    initials: "S",
    avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
    description: "Researches context and synthesizes findings",
    status: "working"
  },
  {
    id: "patch",
    name: "Patch",
    initials: "P",
    avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    description: "Tests changes and verifies acceptance criteria",
    status: "ready"
  }
];

const availableContextItems: ContextItem[] = [
  {
    id: "composer-file",
    label: "ChatComposer.tsx",
    kind: "file",
    detail: "packages/app/src/components"
  },
  {
    id: "messages-file",
    label: "ChatMessages.tsx",
    kind: "file",
    detail: "packages/app/src/components"
  },
  {
    id: "design-decision",
    label: "#design-system decision",
    kind: "thread",
    detail: "6 messages · bottom-anchor requirements"
  },
  {
    id: "chat-agent-run",
    label: "Bottom-anchored chat run",
    kind: "run",
    detail: "Forge · reviewed · 3 changed files"
  },
  {
    id: "workspace-naming-decision",
    label: "Workspace naming decision",
    kind: "thread",
    detail: "Accepted by 4 · default naming requirements"
  }
];

const sidebarSections: SidebarSection[] = [
  {
    id: "starred",
    label: "Starred",
    icon: "star",
    emptyText: "Drag important work here",
    items: []
  },
  {
    id: "channels",
    label: "Channels",
    icon: "channels",
    items: [
      { id: "general", name: "general", kind: "channel" },
      { id: "product", name: "product", kind: "channel" },
      { id: "design-system", name: "design-system", kind: "channel" },
      { id: "add-channels", name: "Add channels", kind: "action" }
    ]
  },
  {
    id: "direct-messages",
    label: "Direct messages",
    icon: "messages",
    items: [
      {
        id: "maya-chen",
        name: "Maya Chen",
        kind: "person",
        initials: "MC",
        avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
        online: true
      },
      {
        id: "theo-grant",
        name: "Theo Grant",
        kind: "person",
        initials: "TG",
        avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]"
      },
      {
        id: "nora-kim",
        name: "Nora Kim",
        kind: "person",
        initials: "NK",
        avatarClass: "bg-[linear-gradient(145deg,#b94b68,#e47d83)]",
        online: true
      },
      {
        id: "lena-ortiz",
        name: "Lena Ortiz",
        kind: "person",
        initials: "LO",
        avatarClass: "bg-[linear-gradient(145deg,#2f8a7d,#56b684)]"
      },
      { id: "invite-people", name: "Invite people", kind: "action" }
    ]
  },
  {
    id: "agents-apps",
    label: "Agents & apps",
    icon: "apps",
    items: [
      {
        id: "forge-agent",
        name: "Forge",
        kind: "app",
        initials: "F",
        avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
        badge: 2
      },
      {
        id: "scout-agent",
        name: "Scout",
        kind: "app",
        initials: "S",
        avatarClass: "bg-[linear-gradient(145deg,#3296a4,#4d67bd)]",
        badge: 1
      },
      {
        id: "patch-agent",
        name: "Patch",
        kind: "app",
        initials: "P",
        avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]"
      },
      { id: "add-apps", name: "Add apps", kind: "action" }
    ]
  }
];

const sidebarItems: SidebarItem[] = sidebarSections.flatMap((section) => section.items);

type ThreadMessage = ChatMessage & {
  conversationId: string;
};

const initialMessages: ThreadMessage[] = [
  {
    id: "general-1",
    conversationId: "general",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "9:14 AM",
    body: "The onboarding flow asks people to name a workspace before they understand what a workspace does. We lost three testers at that step yesterday."
  },
  {
    id: "general-2",
    conversationId: "general",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "9:18 AM",
    body: "Could we defer naming until after the first agent run? At that point there’s something concrete to name."
  },
  {
    id: "general-3",
    conversationId: "general",
    author: "Lena Ortiz",
    initials: "LO",
    avatarClass: "bg-[linear-gradient(145deg,#2f8a7d,#56b684)]",
    time: "9:23 AM",
    body: "I like removing the question, but support says automatically named workspaces become hard to distinguish. We should still give people a sensible default."
  },
  {
    id: "general-4",
    conversationId: "general",
    author: "Nora Kim",
    initials: "NK",
    avatarClass: "bg-[linear-gradient(145deg,#b94b68,#e47d83)]",
    time: "9:29 AM",
    body: "What if we derive the title from the project folder, show it in the header, and make rename available inline? No setup step, but the name is still visible."
  },
  {
    id: "general-5",
    conversationId: "general",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "9:34 AM",
    body: "That resolves both concerns. Let’s use the folder name, fall back to “Untitled workspace,” and keep inline rename in the header.",
    decision: {
      id: "workspace-naming",
      title: "Default workspace names",
      summary: "Skip the naming step, derive the initial title from the project folder, and keep rename available inline.",
      rationale: "This removes an early setup decision without sacrificing the distinct names teams need once multiple workspaces exist.",
      decidedBy: "Maya Chen",
      acceptedBy: 4,
      criteria: [
        "Use the project folder name when one is available",
        "Fall back to “Untitled workspace” safely",
        "Preserve existing saved names",
        "Allow inline rename from the workspace header"
      ],
      context: availableContextItems[4]!
    }
  },
  {
    id: "general-6",
    conversationId: "general",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "9:37 AM",
    body: "Agreed. @Forge, implement that flow in the workspace creator and header. Preserve existing saved names and add coverage for the fallback case.",
    delegation: {
      agentId: "forge",
      agentName: "Forge",
      initials: "F",
      avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
      mode: "verify",
      modeLabel: "Implement & verify",
      permissions: ["Read files", "Edit files", "Run tests"]
    },
    reactions: [{ emoji: "👍", count: 3 }]
  },
  {
    id: "general-7",
    conversationId: "general",
    author: "Forge",
    initials: "F",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    avatarType: "bot",
    time: "9:41 AM",
    body: "I’ll update the creation path, migrate the header to inline editing, and add focused tests. I’ll post the diff here before changing any persisted data.",
    agentRun: {
      agent: "Forge",
      initials: "F",
      avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
      title: "Default workspace naming",
      branch: "agent/forge/workspace-naming",
      status: "review",
      progress: 100,
      steps: [
        { label: "Trace workspace creation and persistence", status: "done" },
        { label: "Derive a safe default from the project folder", status: "done" },
        { label: "Add inline rename in the header", status: "done" },
        { label: "Cover saved names and fallback behavior", status: "done" }
      ],
      files: ["WorkspaceCreator.tsx", "WorkspaceHeader.tsx", "workspace.test.ts"]
    }
  },
  {
    id: "general-8",
    conversationId: "general",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "10:06 AM",
    body: "The diff matches the decision. @Patch, run the creation, rename, and restart scenarios on the desktop build.",
    replyCount: 2
  },
  {
    id: "general-9",
    conversationId: "general",
    author: "Patch",
    initials: "P",
    avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    avatarType: "bot",
    time: "10:12 AM",
    body: "All three scenarios pass. I also checked an older saved workspace; its custom name remains unchanged.",
    reactions: [{ emoji: "✅", count: 4 }]
  },
  {
    id: "product-1",
    conversationId: "product",
    author: "Lena Ortiz",
    initials: "LO",
    avatarClass: "bg-[linear-gradient(145deg,#2f8a7d,#56b684)]",
    time: "9:51 AM",
    body: "People can see when an agent is running, but they can’t tell whether it is researching, editing, or waiting for review. That makes long tasks feel stuck."
  },
  {
    id: "product-2",
    conversationId: "product",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "10:06 AM",
    body: "A detailed activity stream might be noisy. I’d rather show a small set of meaningful phases than every tool call."
  },
  {
    id: "product-3",
    conversationId: "product",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "10:12 AM",
    body: "What about four phases: understanding, working, verifying, and needs review? They describe progress without exposing implementation details."
  },
  {
    id: "product-4",
    conversationId: "product",
    author: "Lena Ortiz",
    initials: "LO",
    avatarClass: "bg-[linear-gradient(145deg,#2f8a7d,#56b684)]",
    time: "10:17 AM",
    body: "That’s enough for the first version. The status should appear beside the agent name and remain readable when the sidebar is narrow."
  },
  {
    id: "product-5",
    conversationId: "product",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "10:21 AM",
    body: "@Forge, implement the four-state indicator behind the agent-status flag. Reuse the existing run state; don’t introduce a second state machine."
  },
  {
    id: "product-6",
    conversationId: "product",
    author: "Forge",
    initials: "F",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    avatarType: "bot",
    time: "10:25 AM",
    body: "Understood. I’ll map the current run states into those four labels, add the narrow-sidebar treatment, and keep the feature flag off by default.",
    agentRun: {
      agent: "Forge",
      initials: "F",
      avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
      title: "Agent phase indicator",
      branch: "agent/forge/run-phase-status",
      status: "working",
      progress: 58,
      steps: [
        { label: "Audit current run-state transitions", status: "done" },
        { label: "Map states to four human-readable phases", status: "done" },
        { label: "Build narrow-sidebar treatment", status: "working" },
        { label: "Add flag and interaction coverage", status: "pending" }
      ],
      files: ["AgentStatus.tsx", "runState.ts", "flags.ts"]
    }
  },
  {
    id: "design-1",
    conversationId: "design-system",
    author: "Nora Kim",
    initials: "NK",
    avatarClass: "bg-[linear-gradient(145deg,#b94b68,#e47d83)]",
    time: "10:02 AM",
    body: "The composer currently stays in document flow. In a short thread it floats halfway up the page, which makes the conversation feel unfinished."
  },
  {
    id: "design-2",
    conversationId: "design-system",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "10:18 AM",
    body: "I’d pin the composer to the bottom of the pane. New messages should appear directly above it, even when there are only one or two."
  },
  {
    id: "design-3",
    conversationId: "design-system",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "10:24 AM",
    body: "Pinned makes sense. We should be careful not to reverse message order—the timeline remains chronological, it just anchors from the bottom when sparse."
  },
  {
    id: "design-4",
    conversationId: "design-system",
    author: "Nora Kim",
    initials: "NK",
    avatarClass: "bg-[linear-gradient(145deg,#b94b68,#e47d83)]",
    time: "10:29 AM",
    body: "Right. The scroll container owns the timeline, the composer stays outside it, and sparse content uses bottom alignment. That gives us normal chronology and the Slack behavior.",
    decision: {
      id: "bottom-anchored-chat",
      title: "Bottom-anchor sparse chat history",
      summary: "Keep messages chronological while anchoring sparse histories directly above the pinned composer.",
      rationale: "Separating the scrollable timeline from the composer preserves normal message order and keeps short conversations visually connected to their input.",
      decidedBy: "Nora Kim",
      acceptedBy: 4,
      criteria: [
        "Composer remains pinned outside the message scroller",
        "Sparse histories align to the bottom",
        "Long histories retain chronological scrolling",
        "Newly sent messages scroll into view"
      ],
      context: availableContextItems[2]!
    }
  },
  {
    id: "design-5",
    conversationId: "design-system",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "10:33 AM",
    body: "Decision made. @Forge, implement that structure as separate ChatMessages and ChatComposer components. Enter sends, Shift+Enter adds a line, and a sent message must scroll into view.",
    delegation: {
      agentId: "forge",
      agentName: "Forge",
      initials: "F",
      avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
      mode: "verify",
      modeLabel: "Implement & verify",
      permissions: ["Read files", "Edit files", "Run tests"]
    },
    context: [availableContextItems[2]!, availableContextItems[0]!],
    reactions: [{ emoji: "🎨", count: 4 }]
  },
  {
    id: "design-6",
    conversationId: "design-system",
    author: "Forge",
    initials: "F",
    avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
    avatarType: "bot",
    time: "10:39 AM",
    body: "Implemented the component split and bottom anchor. The composer owns draft submission; the message log owns scrolling and renders messages in chronological order.",
    agentRun: {
      agent: "Forge",
      initials: "F",
      avatarClass: "bg-[linear-gradient(145deg,#ef566d,#8056c7)]",
      title: "Bottom-anchored chat",
      branch: "agent/forge/chat-components",
      status: "review",
      progress: 100,
      steps: [
        { label: "Split timeline and composer responsibilities", status: "done" },
        { label: "Anchor sparse histories above the composer", status: "done" },
        { label: "Submit on Enter and preserve Shift+Enter", status: "done" },
        { label: "Scroll sent messages into view", status: "done" }
      ],
      files: ["ChatMessages.tsx", "ChatComposer.tsx", "App.test.tsx"]
    }
  },
  {
    id: "design-7",
    conversationId: "design-system",
    author: "Theo Grant",
    initials: "TG",
    avatarClass: "bg-[linear-gradient(145deg,#4d74b8,#7453a8)]",
    time: "10:44 AM",
    body: "Reviewed the API. The boundaries look right, and message data no longer leaks into the composer. I left one focus-ring tweak and approved the rest.",
    replyCount: 3
  },
  {
    id: "design-8",
    conversationId: "design-system",
    author: "Nora Kim",
    initials: "NK",
    avatarClass: "bg-[linear-gradient(145deg,#b94b68,#e47d83)]",
    time: "10:48 AM",
    body: "Focus tweak is resolved. @Patch, verify Enter, Shift+Enter, automatic scrolling, and the empty-thread bottom position at the minimum desktop height."
  },
  {
    id: "design-9",
    conversationId: "design-system",
    author: "Patch",
    initials: "P",
    avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
    avatarType: "bot",
    time: "10:54 AM",
    body: "All four cases pass. The newest message stays above the composer, and long histories scroll without moving the composer.",
    agentRun: {
      agent: "Patch",
      initials: "P",
      avatarClass: "bg-[linear-gradient(145deg,#d37c3e,#cf496e)]",
      title: "Chat interaction verification",
      branch: "agent/patch/chat-verification",
      status: "complete",
      progress: 100,
      steps: [
        { label: "Verify Enter and Shift+Enter", status: "done" },
        { label: "Verify automatic scroll after send", status: "done" },
        { label: "Verify empty-thread bottom alignment", status: "done" },
        { label: "Verify long-history composer position", status: "done" }
      ],
      files: ["chat-interactions.spec.ts"]
    },
    reactions: [{ emoji: "✅", count: 3 }]
  },
  {
    id: "maya-1",
    conversationId: "maya-chen",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "11:04 AM",
    body: "The composer feels disconnected when a thread is short. Should we pin it, or let the content determine its position?"
  },
  {
    id: "maya-2",
    conversationId: "maya-chen",
    author: "Steve",
    initials: "ST",
    avatarClass: "bg-[linear-gradient(145deg,#3ca8a4,#4b5fb0_52%,#d14c78)]",
    time: "11:08 AM",
    body: "Pin it. Messages should remain chronological but grow upward from the composer when the history is sparse."
  },
  {
    id: "maya-3",
    conversationId: "maya-chen",
    author: "Maya Chen",
    initials: "MC",
    avatarClass: "bg-[linear-gradient(145deg,#cf7548,#e9a752)]",
    time: "11:11 AM",
    body: "Makes sense. I’ll write the acceptance criteria in #design-system and then mention @Forge to implement it."
  }
];

type AppProps = {
  platform?: "desktop" | "web";
};

export function App(props: AppProps) {
  const [activeFeatureId, setActiveFeatureId] = createSignal("home");
  const [activeSidebarItemId, setActiveSidebarItemId] = createSignal("general");
  const [draft, setDraft] = createSignal("");
  const [attachedContext, setAttachedContext] = createSignal<ContextItem[]>([]);
  const [messages, setMessages] = createSignal<ThreadMessage[]>(initialMessages);
  const [query, setQuery] = createSignal("");
  const activeFeature = () =>
    features.find((feature) => feature.id === activeFeatureId()) ?? features[0]!;
  const activeSidebarItem = () =>
    sidebarItems.find((item) => item.id === activeSidebarItemId()) ?? sidebarItems[0]!;
  const activeTitle = () =>
    activeSidebarItem().kind === "channel" ? `# ${activeSidebarItem().name}` : activeSidebarItem().name;
  const activeMessages = () =>
    messages().filter((message) => message.conversationId === activeSidebarItemId());
  const conversationLabel = () =>
    activeSidebarItem().kind === "channel" ? `#${activeSidebarItem().name}` : activeSidebarItem().name;
  const conversationDescription = () =>
    activeSidebarItem().kind === "channel"
      ? "Share updates, decisions, and work with everyone in this channel."
      : `This conversation is just between you and ${activeSidebarItem().name}.`;
  const conversationIntroTitle = () =>
    activeSidebarItem().kind === "channel"
      ? `Everyone’s all here in #${activeSidebarItem().name}`
      : activeSidebarItem().name;
  const sendMessage = (delegation?: Delegation) => {
    const body = draft().trim();
    if (!body) return;

    setMessages((current) => [
      ...current,
      {
        id: `message-${Date.now()}`,
        conversationId: activeSidebarItemId(),
        author: "Steve",
        initials: "ST",
        avatarClass: "bg-[linear-gradient(145deg,#3ca8a4,#4b5fb0_52%,#d14c78)]",
        time: "Now",
        body,
        context: attachedContext(),
        delegation
      }
    ]);
    setDraft("");
    setAttachedContext([]);
  };

  return (
    <Rail
      features={features}
      activeFeatureId={activeFeatureId()}
      query={query()}
      onFeatureChange={setActiveFeatureId}
      onQueryChange={setQuery}
      showWindowControls={props.platform === "desktop"}
      sidebar={
        <Sidebar
          workspaceName="Rigged"
          sections={sidebarSections}
          activeItemId={activeSidebarItemId()}
          onItemChange={(itemId) => {
            setActiveSidebarItemId(itemId);
            setDraft("");
            setAttachedContext([]);
          }}
        />
      }
    >
      <section
        class="flex min-h-full min-w-0 flex-1 flex-col"
        id="feature"
        aria-labelledby="conversation-heading"
        aria-label={`${activeSidebarItem().name} content`}
      >
        <header class="flex h-[58px] shrink-0 items-center border-b border-[#e5e0e5] px-5">
          <div class="min-w-0">
            <h1 class="truncate text-[0.94rem] font-extrabold tracking-[-0.02em] text-[#302a2f]" id="conversation-heading">
              {activeTitle()}
            </h1>
            <p class="mt-0.5 text-[0.65rem] font-medium text-[#958c94]">Feature · {activeFeature().name}</p>
          </div>
        </header>

        <div class="flex h-9 shrink-0 items-end gap-4 border-b border-[#e5e0e5] px-5">
          <button class="h-full border-0 border-b-2 border-[#6f3f76] bg-transparent px-0 text-[0.72rem] font-extrabold text-[#3f3540]" type="button">
            Messages
          </button>
          <button class="h-full border-0 border-b-2 border-transparent bg-transparent px-0 text-[0.72rem] font-bold text-[#817980] hover:text-[#4c444a]" type="button">
            Add canvas
          </button>
        </div>

        <ChatMessages
          attachedContextIds={attachedContext().map((item) => item.id)}
          conversationName={activeSidebarItem().name}
          description={conversationDescription()}
          introTitle={conversationIntroTitle()}
          messages={activeMessages()}
          onUseContext={(context) =>
            setAttachedContext((current) =>
              current.some((item) => item.id === context.id) ? current : [...current, context]
            )
          }
          searchQuery={query()}
        />

        <ChatComposer
          agents={mentionableAgents}
          availableContext={availableContextItems}
          attachedContext={attachedContext()}
          conversationLabel={conversationLabel()}
          value={draft()}
          onContextChange={setAttachedContext}
          onValueChange={setDraft}
          onSend={sendMessage}
        />
      </section>
    </Rail>
  );
}
