import "./styles.css";

export { happyLogoUrl, onboardingBackgroundUrl } from "./assets";
export {
    AgentActivityStrip,
    type AgentActivityStripProps,
    type AgentActivityStripSubagent,
    type AgentActivityStripSubagentStatus,
    type AgentActivityStripTerminal,
} from "./AgentActivityStrip";
export { AgentDesk, type AgentDeskProps, type DeskListItem, type DeskRun } from "./AgentDesk";
export {
    AgentTracePanel,
    type AgentTracePanelEntry,
    type AgentTracePanelProps,
    type AgentTracePanelStatus,
} from "./AgentTracePanel";
export {
    AgentTraceRow,
    type AgentTraceRowKind,
    type AgentTraceRowProps,
    type AgentTraceRowStatus,
} from "./AgentTraceRow";
export { AgentImageDetail, type AgentImageDetailProps } from "./AgentImageDetail";
export {
    AgentImagePanel,
    type AgentImageItem,
    type AgentImagePanelProps,
    type AgentImageStatus,
} from "./AgentImagePanel";
export {
    AgentSecretDetail,
    type AgentSecretBinding,
    type AgentSecretDetailProps,
} from "./AgentSecretDetail";
export {
    AgentSecretPanel,
    type AgentSecretDraftVariable,
    type AgentSecretItem,
    type AgentSecretPanelProps,
} from "./AgentSecretPanel";
export {
    PluginCatalogPanel,
    PluginInstallationRow,
    installationShortId,
    type PluginCatalogEntry,
    type PluginCatalogPanelProps,
    type PluginDiagnosticsView,
    type PluginInstallationItem,
    type PluginInstallationStatus,
    type PluginUpdateBadge,
    type PluginVariableField,
} from "./PluginCatalogPanel";
export {
    PluginInstallDialog,
    type PluginInstallDialogCandidate,
    type PluginInstallDialogProgress,
    type PluginInstallDialogProps,
    type PluginInstallDialogSourceKind,
    type PluginInstallDialogStep,
} from "./PluginInstallDialog";
export { PluginUninstallDialog, type PluginUninstallDialogProps } from "./PluginUninstallDialog";
export {
    PluginDiagnosticsViewer,
    type PluginDiagnosticsStatus,
    type PluginDiagnosticsViewerProps,
} from "./PluginDiagnosticsViewer";
export {
    PluginPermissionCard,
    type PluginPermissionAction,
    type PluginPermissionCardProps,
    type PluginPermissionStatus,
} from "./PluginPermissionCard";
export {
    DocumentWritePermissionCard,
    type DocumentWritePermissionCardProps,
    type DocumentWritePermissionStatus,
} from "./DocumentWritePermissionCard";
export {
    AgentRunCard,
    type AgentRun,
    type AgentRunAction,
    type AgentRunCardProps,
    type AgentRunStatus,
    type AgentRunStep,
} from "./AgentRunCard";
export {
    ApprovalCard,
    type ApprovalCardProps,
    type ApprovalRequest,
    type ApprovalResolution,
} from "./ApprovalCard";
export { AppShell, type AppShellProps } from "./AppShell";
export {
    Avatar,
    type AvatarProps,
    type AvatarSize,
    type AvatarType,
    type ToneName,
} from "./Avatar";
export { AutomatedTag, type AutomatedTagProps } from "./AutomatedTag";
export {
    ChannelAccessSummary,
    type ChannelAccessSummaryProps,
    type ChannelStewardRole,
    type ChannelVisibility,
} from "./ChannelAccessSummary";
export {
    ChannelDirectoryList,
    type ChannelDirectoryItem,
    type ChannelDirectoryListProps,
} from "./ChannelDirectoryList";
export {
    Badge,
    type BadgeProps,
    type BadgeVariant,
    CountBadge,
    type CountBadgeProps,
    KeyCap,
    type KeyCapProps,
    ReactionChip,
    type ReactionChipProps,
} from "./Badge";
export { Box, type BoxProps } from "./Box";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export { ChannelHeader, type ChannelHeaderProps, type ChannelMember } from "./ChannelHeader";
export { AudienceToggle, type AudienceToggleProps, type AudienceValue } from "./AudienceToggle";
export {
    Composer,
    type ComposerProps,
    ContextChips,
    type ContextChipsProps,
    type ContextItem,
    type ContextKind,
    type Mentionable,
    MentionPicker,
    type MentionPickerProps,
} from "./Composer";
export {
    ComposerModelControl,
    type ComposerModelChoice,
    type ComposerModelControlProps,
} from "./ComposerModelControl";
export {
    DiffSnippet,
    type DiffLine,
    type DiffLineKind,
    type DiffSnippetProps,
} from "./DiffSnippet";
export type { Dimension } from "./dimensions";
export { EventCard, type EventCardProps } from "./EventCard";
export { Fade, type FadeProps } from "./Fade";
export {
    FileTree,
    type FileTreeGitStatus,
    type FileTreeNode,
    type FileTreeProps,
} from "./FileTree";
export { FilePanel, type FilePanelProps } from "./FilePanel";
export { FileEditor, type FileEditorProps } from "./FileEditor";
export { Icon, type IconName, iconNames, type IconProps } from "./Icon";
export {
    Ionicon,
    type IoniconName,
    type IoniconProps,
    ioniconNames,
    Octicon,
    type OcticonName,
    type OcticonProps,
    octiconNames,
} from "./vectorIcons/VectorIcon";
export {
    DayDivider,
    Message,
    MessageList,
    type MessageDeliveryState,
    type MessageImage,
    type MessageListProps,
    type MessageListScrollPosition,
    type MessageProps,
    type MessageReaction,
    type MessageSegment,
    SystemNotice,
    type SystemNoticeSegment,
} from "./Message";
export { type MessageGenerationStatus } from "./MessageMarkdown";
export { Lightbox, type LightboxProps } from "./Lightbox";
export { Rail, type RailItem, type RailProps } from "./Rail";
export { ThemeScope, type ThemeMode, type ThemeScopeProps } from "./ThemeScope";
export { Sidebar, type SidebarItem, type SidebarProps, type SidebarSection } from "./Sidebar";
export {
    SearchField,
    type SearchFieldEditableProps,
    type SearchFieldOpenerProps,
    type SearchFieldProps,
    TitleBar,
    type TitleBarEditableProps,
    type TitleBarOpenerProps,
    type TitleBarPlainProps,
    type TitleBarProps,
    WindowDragRegion,
    type WindowDragRegionProps,
} from "./TitleBar";
export {
    TextField,
    type TextFieldProps,
    type TextFieldSize,
    type TextFieldType,
} from "./TextField";
export { Select, type SelectOption, type SelectProps, type SelectSize } from "./Select";
export { Switch, type SwitchProps, type SwitchSize } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export {
    SegmentedControl,
    type SegmentedControlProps,
    type SegmentedControlSegment,
    type SegmentedControlSize,
} from "./SegmentedControl";
export { Banner, type BannerAction, type BannerProps, type BannerTone } from "./Banner";
export {
    PortShareControl,
    type PortShareControlProps,
    type PortShareControlVariant,
} from "./PortShareControl";
export {
    EmptyState,
    type EmptyStateAction,
    type EmptyStateProps,
    type EmptyStateSize,
} from "./EmptyState";
export { type TabItem, Tabs, type TabsProps, type TabsSize } from "./Tabs";
export { Toolbar, type ToolbarProps, type ToolbarSearch } from "./Toolbar";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { Modal, type ModalProps, type ModalSize, type ModalTone } from "./Modal";
export { ModalOverlay, type ModalOverlayProps } from "./ModalOverlay";
export {
    DefaultAgentForm,
    type DefaultAgentFormProps,
    DEFAULT_AGENT_LUCKY_LABEL,
} from "./DefaultAgentForm";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export {
    InfoPanel,
    type InfoPanelProfile,
    type InfoPanelProps,
    SURFACE_HEADER_HEIGHT,
} from "./InfoPanel";
export { FormRow, type FormRowAlign, type FormRowLayout, type FormRowProps } from "./FormRow";
export {
    DocumentEditor,
    documentFragmentName,
    documentThreadsName,
    type DocumentEditorCommentUser,
    type DocumentEditorPresence,
    type DocumentEditorPresencePayload,
    type DocumentEditorProps,
    type DocumentEditorUser,
} from "./DocumentEditor";
export {
    DocumentsPanel,
    type DocumentsPanelEntry,
    type DocumentsPanelProps,
} from "./DocumentsPanel";
export {
    DocumentSurface,
    type DocumentSurfaceParticipant,
    type DocumentSurfaceProps,
} from "./DocumentSurface";
export { DocumentDeleteDialog, type DocumentDeleteDialogProps } from "./DocumentDeleteDialog";
export { DocumentsPage, type DocumentsPageProps } from "./pages/documents/DocumentsPage";
export {
    DocumentDetailPane,
    type DocumentDetailPaneProps,
} from "./pages/documents/DocumentDetailPane";
export {
    DataTable,
    type DataTableAlign,
    type DataTableColumn,
    type DataTableProps,
    type DataTableRow,
} from "./DataTable";
export {
    type StatDelta,
    StatTile,
    type StatTileProps,
    type StatTone,
    type StatTrend,
} from "./StatTile";
export {
    type AuthBrand,
    AuthScreen,
    type AuthScreenProps,
    type AuthScreenState,
} from "./AuthScreen";
export {
    OnboardingScreen,
    type OnboardingBrand,
    type OnboardingScreenProps,
    type OnboardingScreenState,
    type OnboardingStep,
    type OnboardingStepState,
} from "./OnboardingScreen";
export {
    SetupOptionCard,
    type SetupOptionCardProps,
    type SetupOptionHintTone,
    type SetupOptionStatus,
} from "./SetupOptionCard";
export {
    BuildProgressPanel,
    type BuildProgressPanelProps,
    type BuildProgressStatus,
} from "./BuildProgressPanel";
export { McpAppShell, type McpAppShellProps, type McpAppShellStatus } from "./McpAppShell";
export {
    McpAppBridgeFrame,
    MCP_APP_DEFAULT_HEIGHT,
    type McpAppBridgeFrameProps,
    type McpAppBridgeResource,
    type McpAppDisplayMode,
} from "./mcpAppBridge";
export type { McpAppLogEntry, McpAppLogLevel, McpAppSize } from "./mcpAppProtocol";
export { PluginAssetGlyph, type PluginAssetGlyphProps } from "./PluginAssetGlyph";
export {
    PluginAppView,
    PluginAppOverlay,
    type PluginAppViewProps,
    type PluginAppViewStatus,
    type PluginAppOverlayProps,
} from "./PluginAppView";
export {
    PluginContributionControl,
    PluginContributionSection,
    PluginContributionMenuButton,
    type PluginContributionControlProps,
    type PluginContributionSectionProps,
    type PluginContributionMenuButtonProps,
    type PluginContributionActionState,
    type PluginContributionMenuState,
    type PluginContributionInvoke,
} from "./PluginContribution";
export {
    SidebarAppsSection,
    type SidebarAppsSectionProps,
    type SidebarAppEntry,
} from "./SidebarAppsSection";
export {
    PluginSettingsPanel,
    type PluginSettingsPanelProps,
    type PluginSettingsAppRow,
} from "./PluginSettingsPanel";
export {
    ProfileCard,
    type ProfileCardProps,
    type ProfileCardSize,
    type ProfilePresence,
    type ProfileStatus,
} from "./ProfileCard";
export { type Availability, StatusPicker, type StatusPickerProps } from "./StatusPicker";
export {
    type NotificationActor,
    type NotificationItem,
    type NotificationKind,
    NotificationList,
    type NotificationListProps,
} from "./NotificationList";
export {
    type SearchResultAvatar,
    type SearchResultGroup,
    type SearchResultItem,
    SearchResults,
    type SearchResultsProps,
    type SearchResultsVariant,
    type SearchResultType,
} from "./SearchResults";
export {
    MediaGallery,
    type MediaGalleryProps,
    type MediaItem,
    type MediaKind,
} from "./MediaGallery";
export {
    FileAttachment,
    type FileAttachmentKind,
    type FileAttachmentProps,
    type FileAttachmentVariant,
} from "./FileAttachment";
export {
    type MemberItem,
    MemberList,
    type MemberListProps,
    type MemberPresence,
    type MemberRole,
} from "./MemberList";
export {
    type CallKind,
    CallPanel,
    type CallPanelProps,
    type CallParticipant,
    type CallParticipantState,
    type CallStatus,
    type CallVariant,
} from "./CallPanel";
export {
    type AfterReadScope,
    type ExpiryMode,
    PolicyControl,
    type PolicyControlProps,
    type RetentionMode,
} from "./PolicyControl";
export { SecretReveal, type SecretRevealProps } from "./SecretReveal";
export { DevelopmentTokenModal, type DevelopmentTokenModalProps } from "./DevelopmentTokenModal";
export {
    UserPasswordResetDialog,
    type UserPasswordResetDialogProps,
    type UserPasswordResetStatus,
} from "./UserPasswordResetDialog";
export { type EmojiItem, EmojiPicker, type EmojiPickerProps } from "./EmojiPicker";
export { StoreSurface, type StoreSurfaceProps } from "./StoreSurface";
export { TerminalPanel, type TerminalPanelProps } from "./TerminalPanel";
export {
    ChatPage,
    type ChatPageActions,
    type ChatPageConversationKind,
    type ChatPageNavigation,
    type ChatPagePanel,
    type ChatPageProps,
    type ChatPageUser,
    type McpAppRenderInput,
} from "./pages/chat/ChatPage";
export {
    ChatProjectCreateDialog,
    type ChatProjectCreateDialogProps,
} from "./pages/chat/ChatProjectCreateDialog";
export {
    PermissionChecklist,
    type PermissionChecklistOption,
    type PermissionChecklistProps,
} from "./PermissionChecklist";
export {
    type RoleBuiltinKind,
    type RoleListItem,
    RolesPanel,
    type RolesPanelProps,
} from "./RolesPanel";
export { RoleEditor, type RoleEditorProps } from "./RoleEditor";
export {
    MemberAccessPanel,
    type MemberAccessPanelProps,
    type MemberAccessRoleItem,
} from "./MemberAccessPanel";
export { RolesPage, type RolesPageProps } from "./pages/admin/RolesPage";
export { AgentImagesPage, type AgentImagesPageProps } from "./pages/admin/AgentImagesPage";
export { AgentSecretsPage, type AgentSecretsPageProps } from "./pages/admin/AgentSecretsPage";
export { PluginsPage, type PluginsPageProps } from "./pages/admin/PluginsPage";
export { AdminPage, type AdminPageProps, type AdminPageSection } from "./pages/admin/AdminPage";
export { ActivityPage, type ActivityPageProps } from "./pages/activity/ActivityPage";
export { ProfilePage, type ProfilePageProps } from "./pages/profile/ProfilePage";
export { CallsPage, type CallsPageProps } from "./pages/calls/CallsPage";
export {
    ComposeModal,
    type ComposeModalModelOption,
    type ComposeModalProps,
} from "./pages/compose/ComposeModal";
export { HomePage, type HomePageProps } from "./pages/home/HomePage";
export { FilesPage, type FilesPageFilter, type FilesPageProps } from "./pages/files/FilesPage";
export { SearchPage, type SearchPageProps } from "./pages/search/SearchPage";
export { SettingsPage, type SettingsPageProps } from "./pages/settings/SettingsPage";
export {
    type AutomationAction,
    AutomationCard,
    type AutomationCardProps,
    type AutomationTrigger,
} from "./AutomationCard";
export {
    ModerationReportCard,
    type ModerationReportCardProps,
    type ModerationParty,
    type ModerationStatus,
    type ModerationTarget,
    type ModerationTargetKind,
} from "./ModerationReportCard";
