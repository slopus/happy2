import "./styles.css";

export { happyOtterLogoUrl, onboardingBackgroundUrl } from "./assets";
export { AgentDesk, type AgentDeskProps, type DeskListItem, type DeskRun } from "./AgentDesk";
export { AgentImageDetail, type AgentImageDetailProps } from "./AgentImageDetail";
export {
    AgentImagePanel,
    type AgentImageItem,
    type AgentImagePanelProps,
    type AgentImageStatus,
} from "./AgentImagePanel";
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
export {
    Composer,
    type ComposerProps,
    ContextChips,
    type ContextChipsProps,
    type ContextItem,
    type ContextKind,
    type Mentionable,
    type MentionableAgent,
    MentionPicker,
    type MentionPickerProps,
} from "./Composer";
export {
    DiffSnippet,
    type DiffLine,
    type DiffLineKind,
    type DiffSnippetProps,
} from "./DiffSnippet";
export type { Dimension } from "./dimensions";
export { EventCard, type EventCardProps } from "./EventCard";
export {
    FileTree,
    type FileTreeGitStatus,
    type FileTreeNode,
    type FileTreeProps,
} from "./FileTree";
export { FilePanel, type FilePanelProps } from "./FilePanel";
export { Icon, type IconName, iconNames, type IconProps } from "./Icon";
export {
    DayDivider,
    Message,
    MessageList,
    type MessageDeliveryState,
    type MessageImage,
    type MessageListProps,
    type MessageProps,
    type MessageReaction,
    type MessageSegment,
} from "./Message";
export { type MessageGenerationStatus } from "./MessageMarkdown";
export { Lightbox, type LightboxProps } from "./Lightbox";
export { Rail, type RailItem, type RailProps } from "./Rail";
export { Sidebar, type SidebarItem, type SidebarProps, type SidebarSection } from "./Sidebar";
export {
    SearchField,
    type SearchFieldProps,
    TitleBar,
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
    EmptyState,
    type EmptyStateAction,
    type EmptyStateProps,
    type EmptyStateSize,
} from "./EmptyState";
export { type TabItem, Tabs, type TabsProps, type TabsSize } from "./Tabs";
export { Toolbar, type ToolbarProps, type ToolbarSearch } from "./Toolbar";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { Modal, type ModalProps, type ModalSize, type ModalTone } from "./Modal";
export {
    InfoPanel,
    type InfoPanelProfile,
    type InfoPanelProps,
    SURFACE_HEADER_HEIGHT,
} from "./InfoPanel";
export { ThreadPanel, type ThreadPanelProps } from "./ThreadPanel";
export { FormRow, type FormRowAlign, type FormRowLayout, type FormRowProps } from "./FormRow";
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
    type SearchResultType,
} from "./SearchResults";
export {
    type ThreadItem,
    ThreadList,
    type ThreadListProps,
    type ThreadParticipant,
} from "./ThreadList";
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
export { type EmojiItem, EmojiPicker, type EmojiPickerProps } from "./EmojiPicker";
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
