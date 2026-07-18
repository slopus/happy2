import { Fragment, useLayoutEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../src/index";
import "./workbench.css";
import { AgentActivityIndicatorPage } from "./pages/AgentActivityIndicatorPage";
import { AgentDeskPage } from "./pages/AgentDeskPage";
import { AgentImageDetailPage } from "./pages/AgentImageDetailPage";
import { AgentImagePanelPage } from "./pages/AgentImagePanelPage";
import { AgentRunCardPage } from "./pages/AgentRunCardPage";
import { AgentSecretDetailPage } from "./pages/AgentSecretDetailPage";
import { AgentSecretPanelPage } from "./pages/AgentSecretPanelPage";
import { ApprovalCardPage } from "./pages/ApprovalCardPage";
import { AppShellPage } from "./pages/AppShellPage";
import { AutomationCardPage } from "./pages/AutomationCardPage";
import { AuthScreenPage } from "./pages/AuthScreenPage";
import { AvatarPage } from "./pages/AvatarPage";
import { BadgePage } from "./pages/BadgePage";
import { BannerPage } from "./pages/BannerPage";
import { BoxPage } from "./pages/BoxPage";
import { ButtonPage } from "./pages/ButtonPage";
import { CallPanelPage } from "./pages/CallPanelPage";
import { ChannelHeaderPage } from "./pages/ChannelHeaderPage";
import { CheckboxPage } from "./pages/CheckboxPage";
import { CommandPalettePage } from "./pages/CommandPalettePage";
import { ChatStorePage } from "./pages/ChatStorePage";
import { AudienceTogglePage } from "./pages/AudienceTogglePage";
import { PluginCatalogPanelPage } from "./pages/PluginCatalogPanelPage";
import { ComposerPage } from "./pages/ComposerPage";
import { DataTablePage } from "./pages/DataTablePage";
import { DiffSnippetPage } from "./pages/DiffSnippetPage";
import { EmojiPickerPage } from "./pages/EmojiPickerPage";
import { EmptyStatePage } from "./pages/EmptyStatePage";
import { EventCardPage } from "./pages/EventCardPage";
import { FadePage } from "./pages/FadePage";
import { FileAttachmentPage } from "./pages/FileAttachmentPage";
import { FileEditorPage } from "./pages/FileEditorPage";
import { FilePanelPage } from "./pages/FilePanelPage";
import { FileTreePage } from "./pages/FileTreePage";
import { FormRowPage } from "./pages/FormRowPage";
import { IconPage } from "./pages/IconPage";
import { InfoPanelPage } from "./pages/InfoPanelPage";
import { LightboxPage } from "./pages/LightboxPage";
import { MediaGalleryPage } from "./pages/MediaGalleryPage";
import { MemberListPage } from "./pages/MemberListPage";
import { MenuPage } from "./pages/MenuPage";
import { MessagePage } from "./pages/MessagePage";
import { ModalPage } from "./pages/ModalPage";
import { ModalOverlayPage } from "./pages/ModalOverlayPage";
import { DefaultAgentModalPage } from "./pages/DefaultAgentModalPage";
import { ModerationReportCardPage } from "./pages/ModerationReportCardPage";
import { NotificationListPage } from "./pages/NotificationListPage";
import { OnboardingScreenPage } from "./pages/OnboardingScreenPage";
import { PolicyControlPage } from "./pages/PolicyControlPage";
import { ProductStorePage } from "./pages/ProductStorePage";
import { ProfileCardPage } from "./pages/ProfileCardPage";
import { RailPage } from "./pages/RailPage";
import { SearchResultsPage } from "./pages/SearchResultsPage";
import { SettingsStorePage } from "./pages/SettingsStorePage";
import { SecretRevealPage } from "./pages/SecretRevealPage";
import { SegmentedControlPage } from "./pages/SegmentedControlPage";
import { SelectPage } from "./pages/SelectPage";
import { SetupOptionCardPage } from "./pages/SetupOptionCardPage";
import { BuildProgressPanelPage } from "./pages/BuildProgressPanelPage";
import { SidebarPage } from "./pages/SidebarPage";
import { StatTilePage } from "./pages/StatTilePage";
import { StatusPickerPage } from "./pages/StatusPickerPage";
import { SwitchPage } from "./pages/SwitchPage";
import { TabsPage } from "./pages/TabsPage";
import { TextFieldPage } from "./pages/TextFieldPage";
import { ThreadListPage } from "./pages/ThreadListPage";
import { ThreadPanelPage } from "./pages/ThreadPanelPage";
import { TitleBarPage } from "./pages/TitleBarPage";
import { ToolbarPage } from "./pages/ToolbarPage";
type BlueprintPage = {
    id: string;
    label: string;
    number: string;
    page: () => ReactNode;
};
const components: BlueprintPage[] = [
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
    { id: "text-field", label: "Text field", number: "C-018", page: TextFieldPage },
    { id: "select", label: "Select", number: "C-019", page: SelectPage },
    { id: "switch", label: "Switch", number: "C-020", page: SwitchPage },
    { id: "checkbox", label: "Checkbox", number: "C-021", page: CheckboxPage },
    {
        id: "segmented-control",
        label: "Segmented control",
        number: "C-022",
        page: SegmentedControlPage,
    },
    { id: "banner", label: "Banner", number: "C-023", page: BannerPage },
    { id: "empty-state", label: "Empty state", number: "C-024", page: EmptyStatePage },
    { id: "tabs", label: "Tabs", number: "C-025", page: TabsPage },
    { id: "toolbar", label: "Toolbar", number: "C-026", page: ToolbarPage },
    { id: "menu", label: "Menu", number: "C-027", page: MenuPage },
    { id: "modal", label: "Modal", number: "C-028", page: ModalPage },
    { id: "form-row", label: "Form row", number: "C-029", page: FormRowPage },
    { id: "data-table", label: "Data table", number: "C-030", page: DataTablePage },
    { id: "stat-tile", label: "Stat tile", number: "C-031", page: StatTilePage },
    { id: "auth-screen", label: "Auth screen", number: "C-032", page: AuthScreenPage },
    { id: "profile-card", label: "Profile card", number: "C-033", page: ProfileCardPage },
    { id: "status-picker", label: "Status picker", number: "C-034", page: StatusPickerPage },
    {
        id: "notification-list",
        label: "Notification list",
        number: "C-035",
        page: NotificationListPage,
    },
    { id: "search-results", label: "Search results", number: "C-036", page: SearchResultsPage },
    { id: "thread-list", label: "Thread list", number: "C-037", page: ThreadListPage },
    { id: "media-gallery", label: "Media gallery", number: "C-038", page: MediaGalleryPage },
    { id: "member-list", label: "Member list", number: "C-039", page: MemberListPage },
    { id: "call-panel", label: "Call panel", number: "C-040", page: CallPanelPage },
    { id: "policy-control", label: "Policy control", number: "C-041", page: PolicyControlPage },
    { id: "secret-reveal", label: "Secret reveal", number: "C-042", page: SecretRevealPage },
    { id: "emoji-picker", label: "Emoji picker", number: "C-043", page: EmojiPickerPage },
    { id: "automation-card", label: "Automation card", number: "C-044", page: AutomationCardPage },
    {
        id: "moderation-report-card",
        label: "Moderation report card",
        number: "C-045",
        page: ModerationReportCardPage,
    },
    { id: "lightbox", label: "Lightbox", number: "C-046", page: LightboxPage },
    { id: "info-panel", label: "Info panel", number: "C-047", page: InfoPanelPage },
    { id: "thread-panel", label: "Thread panel", number: "C-048", page: ThreadPanelPage },
    { id: "file-attachment", label: "File attachment", number: "C-049", page: FileAttachmentPage },
    {
        id: "agent-image-panel",
        label: "Agent image panel",
        number: "C-050",
        page: AgentImagePanelPage,
    },
    {
        id: "agent-image-detail",
        label: "Agent image detail",
        number: "C-051",
        page: AgentImageDetailPage,
    },
    { id: "file-tree", label: "File tree", number: "C-052", page: FileTreePage },
    { id: "file-panel", label: "File panel", number: "C-053", page: FilePanelPage },
    { id: "file-editor", label: "File editor", number: "C-054", page: FileEditorPage },
    {
        id: "agent-secret-panel",
        label: "Agent secret panel",
        number: "C-055",
        page: AgentSecretPanelPage,
    },
    {
        id: "agent-secret-detail",
        label: "Agent secret detail",
        number: "C-056",
        page: AgentSecretDetailPage,
    },
    { id: "fade", label: "Fade", number: "C-057", page: FadePage },
    { id: "modal-overlay", label: "Modal overlay", number: "C-058", page: ModalOverlayPage },
    {
        id: "agent-activity-indicator",
        label: "Agent activity indicator",
        number: "C-059",
        page: AgentActivityIndicatorPage,
    },
    { id: "command-palette", label: "Command palette", number: "C-060", page: CommandPalettePage },
    {
        id: "onboarding-screen",
        label: "Onboarding screen",
        number: "C-061",
        page: OnboardingScreenPage,
    },
    {
        id: "setup-option-card",
        label: "Setup option card",
        number: "C-062",
        page: SetupOptionCardPage,
    },
    {
        id: "build-progress-panel",
        label: "Build progress panel",
        number: "C-063",
        page: BuildProgressPanelPage,
    },
    {
        id: "default-agent-modal",
        label: "Default agent modal",
        number: "C-064",
        page: DefaultAgentModalPage,
    },
    {
        id: "audience-toggle",
        label: "Audience toggle",
        number: "C-065",
        page: AudienceTogglePage,
    },
    {
        id: "plugin-catalog-panel",
        label: "Plugin catalog panel",
        number: "C-066",
        page: PluginCatalogPanelPage,
    },
];
const fullScreens: BlueprintPage[] = [
    { id: "settings-store", label: "Settings", number: "P-001", page: SettingsStorePage },
    { id: "chat-store", label: "Chat", number: "P-002", page: ChatStorePage },
    {
        id: "home-store",
        label: "Home",
        number: "P-003",
        page: () => <ProductStorePage kind="home" />,
    },
    {
        id: "activity-store",
        label: "Activity",
        number: "P-004",
        page: () => <ProductStorePage kind="activity" />,
    },
    {
        id: "threads-store",
        label: "Threads",
        number: "P-005",
        page: () => <ProductStorePage kind="threads" />,
    },
    {
        id: "calls-store",
        label: "Calls",
        number: "P-006",
        page: () => <ProductStorePage kind="calls" />,
    },
    {
        id: "files-store",
        label: "Files",
        number: "P-007",
        page: () => <ProductStorePage kind="files" />,
    },
    {
        id: "search-store",
        label: "Search",
        number: "P-008",
        page: () => <ProductStorePage kind="search" />,
    },
    {
        id: "admin-store",
        label: "Admin",
        number: "P-009",
        page: () => <ProductStorePage kind="admin" />,
    },
    {
        id: "agent-images-store",
        label: "Agent images",
        number: "P-010",
        page: () => <ProductStorePage kind="agent-images" />,
    },
    {
        id: "agent-secrets-store",
        label: "Agent secrets",
        number: "P-011",
        page: () => <ProductStorePage kind="agent-secrets" />,
    },
];
const pages = [...components, ...fullScreens];
function componentFromHash(): string {
    const id = window.location.hash.slice(1).toLowerCase();
    return pages.some((page) => page.id === id) ? id : "icon";
}
function Workbench() {
    const [active, setActive] = useState(componentFromHash());
    const syncHash = () => setActive(componentFromHash());
    useLayoutEffect(() => {
        window.addEventListener("hashchange", syncHash);
        return () => window.removeEventListener("hashchange", syncHash);
    });
    const selectComponent = (id: string) => {
        window.location.hash = id;
        setActive(id);
    };
    return (
        <div className="workbench-shell">
            <header className="workbench-header">
                <a href="#icon" className="workbench-brand" aria-label="happy2-ui home">
                    <span>R</span>
                    <strong>happy2-ui</strong>
                    <i>component plans</i>
                </a>
                <div className="header-axis" aria-hidden="true">
                    <span>0</span>
                    <i />
                    <span>1200</span>
                </div>
                <label className="component-select">
                    <span>ComponentType</span>
                    <select
                        aria-label="Open component page"
                        value={active}
                        onInput={(event) => selectComponent(event.currentTarget.value)}
                    >
                        <optgroup label="Components">
                            {components.map((component) => (
                                <option key={component.id} value={component.id}>
                                    {component.number} · {component.label}
                                </option>
                            ))}
                        </optgroup>
                        {fullScreens.length > 0 ? (
                            <optgroup label="Full screens">
                                {fullScreens.map((screen) => (
                                    <option key={screen.id} value={screen.id}>
                                        {screen.number} · {screen.label}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                    </select>
                    <b aria-hidden="true">⌄</b>
                </label>
            </header>
            <div className="blueprint-field">
                {pages.map((page) =>
                    active === page.id ? <Fragment key={page.id}>{page.page()}</Fragment> : null,
                )}
            </div>
        </div>
    );
}
createRoot(document.getElementById("root")!).render(<Workbench />);
