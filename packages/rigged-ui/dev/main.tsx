import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { render } from "solid-js/web";
import "../src/index";
import "./workbench.css";
import { AgentDeskPage } from "./pages/AgentDeskPage";
import { AgentRunCardPage } from "./pages/AgentRunCardPage";
import { ApprovalCardPage } from "./pages/ApprovalCardPage";
import { AppShellPage } from "./pages/AppShellPage";
import { AvatarPage } from "./pages/AvatarPage";
import { BadgePage } from "./pages/BadgePage";
import { BoxPage } from "./pages/BoxPage";
import { ButtonPage } from "./pages/ButtonPage";
import { ChannelHeaderPage } from "./pages/ChannelHeaderPage";
import { ComposerPage } from "./pages/ComposerPage";
import { DiffSnippetPage } from "./pages/DiffSnippetPage";
import { EventCardPage } from "./pages/EventCardPage";
import { IconPage } from "./pages/IconPage";
import { MessagePage } from "./pages/MessagePage";
import { RailPage } from "./pages/RailPage";
import { SidebarPage } from "./pages/SidebarPage";
import { TitleBarPage } from "./pages/TitleBarPage";

const components: Array<{ id: string; label: string; number: string; page: () => JSX.Element }> = [
    { id: "box", label: "Box", number: "C-001", page: BoxPage },
    { id: "icon", label: "Icon", number: "C-002", page: IconPage },
    { id: "button", label: "Button", number: "C-003", page: ButtonPage },
    { id: "avatar", label: "Avatar", number: "C-004", page: AvatarPage },
    { id: "badge", label: "Badge", number: "C-005", page: BadgePage },
    { id: "diff-snippet", label: "Diff snippet", number: "C-006", page: DiffSnippetPage },
    { id: "title-bar", label: "Title bar", number: "C-007", page: TitleBarPage },
    { id: "rail", label: "Rail", number: "C-008", page: RailPage },
    { id: "sidebar", label: "Sidebar", number: "C-009", page: SidebarPage },
    { id: "app-shell", label: "App shell", number: "C-010", page: AppShellPage },
    { id: "channel-header", label: "Channel header", number: "C-011", page: ChannelHeaderPage },
    { id: "message", label: "Message", number: "C-012", page: MessagePage },
    { id: "agent-run-card", label: "Agent run card", number: "C-013", page: AgentRunCardPage },
    { id: "approval-card", label: "Approval card", number: "C-014", page: ApprovalCardPage },
    { id: "event-card", label: "Event card", number: "C-015", page: EventCardPage },
    { id: "agent-desk", label: "Agent desk", number: "C-016", page: AgentDeskPage },
    { id: "composer", label: "Composer", number: "C-017", page: ComposerPage },
];

function componentFromHash(): string {
    const id = window.location.hash.slice(1).toLowerCase();
    return components.some((component) => component.id === id) ? id : "icon";
}

function Workbench() {
    const [active, setActive] = createSignal(componentFromHash());
    const syncHash = () => setActive(componentFromHash());

    onMount(() => window.addEventListener("hashchange", syncHash));
    onCleanup(() => window.removeEventListener("hashchange", syncHash));

    const selectComponent = (id: string) => {
        window.location.hash = id;
        setActive(id);
    };

    return (
        <div class="workbench-shell">
            <header class="workbench-header">
                <a href="#icon" class="workbench-brand" aria-label="rigged-ui home">
                    <span>R</span>
                    <strong>rigged-ui</strong>
                    <i>component plans</i>
                </a>
                <div class="header-axis" aria-hidden="true">
                    <span>0</span>
                    <i />
                    <span>1200</span>
                </div>
                <label class="component-select">
                    <span>Component</span>
                    <select
                        aria-label="Open component page"
                        value={active()}
                        onInput={(event) => selectComponent(event.currentTarget.value)}
                    >
                        <For each={components}>
                            {(component) => (
                                <option value={component.id}>
                                    {component.number} · {component.label}
                                </option>
                            )}
                        </For>
                    </select>
                    <b aria-hidden="true">⌄</b>
                </label>
            </header>
            <div class="blueprint-field">
                <For each={components}>
                    {(component) => (
                        <Show when={active() === component.id}>{component.page()}</Show>
                    )}
                </For>
            </div>
        </div>
    );
}

render(() => <Workbench />, document.getElementById("root")!);
