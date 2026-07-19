import { useRef, useState } from "react";
import type {
    ClientUser,
    DevelopmentTokenCredential,
    HappyState,
    SettingsSnapshot,
    SettingsStore,
} from "happy2-state";
import type { ToneName } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { DevelopmentTokenModal } from "../../DevelopmentTokenModal";
import { FormRow } from "../../FormRow";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { ProfileCard } from "../../ProfileCard";
import { SegmentedControl, type SegmentedControlSegment } from "../../SegmentedControl";
import { StatusPicker } from "../../StatusPicker";
import { StoreSurface } from "../../StoreSurface";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
type NotificationLevel = "all" | "mentions" | "none";
export interface SettingsPageProps {
    store: SettingsStore;
    avatarUrl?: string;
    avatarTone?: ToneName;
    presence?: "online" | "offline";
    /** HappyState owns typed upload/set actions while the page owns the chosen browser File. */
    avatarActions?: Pick<HappyState, "avatarUpload" | "avatarSet">;
    /** Present only when the server advertises session-bound development-token support. */
    developmentTokenActions?: Pick<HappyState, "developmentTokenCreate">;
    onAvatarChanged?: (fileId: string) => Promise<void>;
    /** Lets a host project the changed profile into chrome outside the settings surface. */
    onProfileChange?: (profile: ClientUser) => void;
}
const notificationSegments: SegmentedControlSegment[] = [
    { value: "all", label: "All activity" },
    { value: "mentions", label: "Mentions" },
    { value: "none", label: "Nothing" },
];
/** Complete settings page: one coarse SettingsStore subscription plus typed field actions. */
export function SettingsPage(props: SettingsPageProps) {
    const [handleDraft, setHandleDraft] = useState(props.store.getState().profile.username);
    const [handleDirty, setHandleDirty] = useState(false);
    const [usernameConfirmationOpen, setUsernameConfirmationOpen] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [localError, setLocalError] = useState<string>();
    const [developmentTokenPending, setDevelopmentTokenPending] = useState(false);
    const [developmentTokenError, setDevelopmentTokenError] = useState<string>();
    const [developmentToken, setDevelopmentToken] = useState<DevelopmentTokenCredential>();
    const [developmentTokenRevealed, setDevelopmentTokenRevealed] = useState(false);
    const [developmentTokenCopied, setDevelopmentTokenCopied] = useState(false);
    const [developmentTokenCopyError, setDevelopmentTokenCopyError] = useState<string>();
    const avatarInput = useRef<HTMLInputElement>(null);
    const developmentTokenPendingRef = useRef(false);
    const profileChanged = () => props.onProfileChange?.(props.store.getState().profile);
    const displayNameUpdate = (value: string) => {
        const parts = value.trimStart().split(/\s+/);
        props.store.getState().displayNameUpdate(parts.shift() ?? "", parts.join(" ") || undefined);
        profileChanged();
    };
    const emailUpdate = (value: string) => {
        props.store.getState().emailUpdate(value || undefined);
        profileChanged();
    };
    const usernameConfirm = () => {
        const username = handleDraft.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
            setLocalError(
                "Username must be 3–32 lowercase letters, numbers, underscores, or hyphens.",
            );
        } else {
            props.store.getState().usernameUpdate(username);
            setHandleDraft(username);
            setHandleDirty(false);
            setLocalError(undefined);
            profileChanged();
        }
        setUsernameConfirmationOpen(false);
    };
    const avatarUpload = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file || !props.avatarActions) return;
        if (!file.type.startsWith("image/")) {
            setLocalError("Choose an image file for your avatar.");
            if (avatarInput.current) avatarInput.current.value = "";
            return;
        }
        setAvatarUploading(true);
        setLocalError(undefined);
        try {
            const body = new FormData();
            body.set("visibility", "public");
            body.set("file", file, file.name);
            const uploaded = await props.avatarActions.avatarUpload(body);
            await props.avatarActions.avatarSet(uploaded.id);
            await props.onAvatarChanged?.(uploaded.id);
        } catch (reason) {
            setLocalError(
                reason instanceof Error ? reason.message : "The avatar could not upload.",
            );
        } finally {
            setAvatarUploading(false);
            if (avatarInput.current) avatarInput.current.value = "";
        }
    };
    const developmentTokenCreate = async () => {
        if (!props.developmentTokenActions || developmentTokenPendingRef.current) return;
        developmentTokenPendingRef.current = true;
        setDevelopmentTokenPending(true);
        setDevelopmentTokenError(undefined);
        try {
            const credential = await props.developmentTokenActions.developmentTokenCreate();
            setDevelopmentToken(credential);
            setDevelopmentTokenRevealed(true);
            setDevelopmentTokenCopied(false);
            setDevelopmentTokenCopyError(undefined);
        } catch (reason) {
            setDevelopmentTokenError(
                errorMessage(reason, "The development token could not be created."),
            );
        } finally {
            developmentTokenPendingRef.current = false;
            setDevelopmentTokenPending(false);
        }
    };
    const developmentTokenCopy = async () => {
        if (!developmentToken) return;
        try {
            if (!navigator.clipboard?.writeText)
                throw new Error("Clipboard access is unavailable.");
            await navigator.clipboard.writeText(developmentToken.token);
            setDevelopmentTokenCopied(true);
            setDevelopmentTokenCopyError(undefined);
        } catch (reason) {
            setDevelopmentTokenCopied(false);
            setDevelopmentTokenCopyError(
                errorMessage(reason, "Copy the token manually from the field above."),
            );
        }
    };
    const developmentTokenClose = () => {
        setDevelopmentToken(undefined);
        setDevelopmentTokenRevealed(false);
        setDevelopmentTokenCopied(false);
        setDevelopmentTokenCopyError(undefined);
    };
    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                const name = () => profileName(snapshot);
                const usernameDraft = handleDirty ? handleDraft : snapshot.profile.username;
                const notificationLevel = () => notificationLevelGet(snapshot);
                const saveFailure = () => saveError(snapshot);
                const error = () => saveFailure() ?? localError;
                const saving = () => savePending(snapshot) || avatarUploading;
                const statusError = () => {
                    const status = snapshot.status;
                    return status.type === "error" ? status.error.message : undefined;
                };
                return (
                    <Box
                        style={{
                            boxSizing: "border-box",
                            display: "flex",
                            flex: "1 1 0%",
                            flexDirection: "column",
                            minHeight: "0",
                            overflowY: "auto",
                            width: "100%",
                        }}
                    >
                        <Box
                            style={{
                                alignItems: "center",
                                boxSizing: "border-box",
                                display: "flex",
                                flexDirection: "column",
                                padding: "32px 24px",
                                width: "100%",
                            }}
                        >
                            {snapshot.status.type !== "loading" ? (
                                !statusError() ? (
                                    <>
                                        <Box
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "16px",
                                                maxWidth: "640px",
                                                width: "100%",
                                            }}
                                        >
                                            {error() ? (
                                                <Banner
                                                    tone="danger"
                                                    title={
                                                        saveFailure()
                                                            ? "Changes were not saved"
                                                            : "Settings need attention"
                                                    }
                                                >
                                                    {error()}
                                                </Banner>
                                            ) : (
                                                <Box
                                                    data-happy2-ui="settings-save-status"
                                                    role="status"
                                                    style={{
                                                        alignItems: "center",
                                                        color: "var(--happy2-text-muted)",
                                                        display: "flex",
                                                        flex: "0 0 20px",
                                                        fontFamily: "var(--happy2-font-ui)",
                                                        fontSize: "13px",
                                                        fontSynthesis: "none",
                                                        fontWeight: "400",
                                                        height: "20px",
                                                        justifyContent: "flex-end",
                                                        lineHeight: "20px",
                                                        width: "100%",
                                                    }}
                                                >
                                                    {saving() ? (
                                                        <span data-happy2-ui="settings-save-status-label">
                                                            Saving…
                                                        </span>
                                                    ) : null}
                                                </Box>
                                            )}
                                            <ProfileCard
                                                actions={
                                                    props.avatarActions ? (
                                                        <>
                                                            <input
                                                                accept="image/*"
                                                                hidden
                                                                onChange={(event) =>
                                                                    void avatarUpload(
                                                                        event.currentTarget.files,
                                                                    )
                                                                }
                                                                ref={avatarInput}
                                                                type="file"
                                                            />
                                                            <Button
                                                                disabled={avatarUploading}
                                                                onClick={() =>
                                                                    avatarInput.current?.click()
                                                                }
                                                                size="small"
                                                                type="button"
                                                                variant="secondary"
                                                            >
                                                                {avatarUploading
                                                                    ? "Uploading…"
                                                                    : "Change photo"}
                                                            </Button>
                                                        </>
                                                    ) : undefined
                                                }
                                                imageUrl={props.avatarUrl}
                                                initials={initials(name())}
                                                name={name()}
                                                presence={props.presence}
                                                status={
                                                    snapshot.presence.customStatusText ||
                                                    snapshot.presence.customStatusEmoji
                                                        ? {
                                                              emoji: snapshot.presence
                                                                  .customStatusEmoji,
                                                              text: snapshot.presence
                                                                  .customStatusText,
                                                          }
                                                        : undefined
                                                }
                                                title={snapshot.title}
                                                tone={props.avatarTone ?? "brand"}
                                                username={snapshot.profile.username}
                                            />
                                            <StatusPicker
                                                availability={snapshot.presence.availability}
                                                onAvailabilityChange={store.availabilityUpdate}
                                                onClearStatus={() => {
                                                    store.statusTextUpdate(undefined);
                                                    store.statusEmojiUpdate(undefined);
                                                }}
                                                onStatusTextChange={(value) =>
                                                    store.statusTextUpdate(value || undefined)
                                                }
                                                statusEmoji={snapshot.presence.customStatusEmoji}
                                                statusText={
                                                    snapshot.presence.customStatusText ?? ""
                                                }
                                            />
                                            <Box>
                                                <FormRow
                                                    control={
                                                        <Box width={260}>
                                                            <TextField
                                                                fullWidth
                                                                id="settings-name"
                                                                onValueChange={displayNameUpdate}
                                                                size="small"
                                                                value={name()}
                                                            />
                                                        </Box>
                                                    }
                                                    description="Shown on your messages and across the workspace"
                                                    htmlFor="settings-name"
                                                    label="Display name"
                                                />
                                                <FormRow
                                                    control={
                                                        <Box
                                                            style={{
                                                                alignItems: "center",
                                                                display: "flex",
                                                                gap: "8px",
                                                                width: "360px",
                                                            }}
                                                        >
                                                            <TextField
                                                                fullWidth
                                                                id="settings-username"
                                                                leadingIcon="at"
                                                                onValueChange={(value) => {
                                                                    setHandleDirty(true);
                                                                    setHandleDraft(value);
                                                                }}
                                                                size="small"
                                                                value={usernameDraft}
                                                            />
                                                            {usernameDraft.trim().toLowerCase() !==
                                                            snapshot.profile.username ? (
                                                                <Button
                                                                    onClick={() =>
                                                                        setUsernameConfirmationOpen(
                                                                            true,
                                                                        )
                                                                    }
                                                                    size="small"
                                                                    type="button"
                                                                    variant="secondary"
                                                                >
                                                                    Confirm username
                                                                </Button>
                                                            ) : null}
                                                        </Box>
                                                    }
                                                    description="Your unique handle for mentions"
                                                    htmlFor="settings-username"
                                                    label="Username"
                                                />
                                                <FormRow
                                                    control={
                                                        <Box width={260}>
                                                            <TextField
                                                                disabled
                                                                fullWidth
                                                                id="settings-title"
                                                                placeholder="Add a title"
                                                                size="small"
                                                                value={snapshot.title ?? ""}
                                                            />
                                                        </Box>
                                                    }
                                                    description="Managed by workspace administrators"
                                                    htmlFor="settings-title"
                                                    label="Title"
                                                />
                                                <FormRow
                                                    control={
                                                        <Box width={260}>
                                                            <TextField
                                                                fullWidth
                                                                id="settings-email"
                                                                onValueChange={emailUpdate}
                                                                size="small"
                                                                type="email"
                                                                value={snapshot.profile.email ?? ""}
                                                            />
                                                        </Box>
                                                    }
                                                    description="Used for sign-in and account notices"
                                                    htmlFor="settings-email"
                                                    label="Email"
                                                />
                                            </Box>
                                            <Box>
                                                <FormRow
                                                    control={
                                                        <SegmentedControl
                                                            onChange={(value) =>
                                                                notificationLevelUpdate(
                                                                    store,
                                                                    value as NotificationLevel,
                                                                )
                                                            }
                                                            segments={notificationSegments}
                                                            size="small"
                                                            value={notificationLevel()}
                                                        />
                                                    }
                                                    description="Choose what activity sends you a notification"
                                                    label="Notifications"
                                                />
                                                <FormRow
                                                    control={
                                                        <Switch
                                                            aria-label="Desktop notifications"
                                                            checked={
                                                                snapshot.notifications
                                                                    .desktopNotifications
                                                            }
                                                            onChange={
                                                                store.desktopNotificationsUpdate
                                                            }
                                                        />
                                                    }
                                                    description="Show notifications for new messages and mentions on this device"
                                                    label="Desktop notifications"
                                                />
                                                <FormRow
                                                    control={
                                                        <Switch
                                                            aria-label="Email notifications"
                                                            checked={
                                                                snapshot.notifications
                                                                    .emailNotifications
                                                            }
                                                            onChange={
                                                                store.emailNotificationsUpdate
                                                            }
                                                        />
                                                    }
                                                    description="Allow account and activity notifications by email"
                                                    label="Email notifications"
                                                />
                                            </Box>
                                            {props.developmentTokenActions ? (
                                                <Box
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "8px",
                                                    }}
                                                >
                                                    {developmentTokenError ? (
                                                        <Banner
                                                            data-testid="development-token-error"
                                                            tone="danger"
                                                            title="Development token unavailable"
                                                        >
                                                            {developmentTokenError}
                                                        </Banner>
                                                    ) : null}
                                                    <FormRow
                                                        control={
                                                            <Button
                                                                disabled={developmentTokenPending}
                                                                icon="terminal"
                                                                onClick={() =>
                                                                    void developmentTokenCreate()
                                                                }
                                                                size="small"
                                                                type="button"
                                                                variant="secondary"
                                                            >
                                                                {developmentTokenPending
                                                                    ? "Creating token…"
                                                                    : "Create development token"}
                                                            </Button>
                                                        }
                                                        description="Connect a local web or UI build to this server. The token carries your current access and remains valid until this server invalidates it or its expiry is reached."
                                                        label="Development token"
                                                    />
                                                </Box>
                                            ) : null}
                                        </Box>
                                        {usernameConfirmationOpen ? (
                                            <ModalOverlay
                                                onDismiss={() => setUsernameConfirmationOpen(false)}
                                            >
                                                <Modal
                                                    footer={
                                                        <>
                                                            <Button
                                                                onClick={() => {
                                                                    setHandleDraft(
                                                                        snapshot.profile.username,
                                                                    );
                                                                    setHandleDirty(false);
                                                                    setUsernameConfirmationOpen(
                                                                        false,
                                                                    );
                                                                }}
                                                                size="small"
                                                                type="button"
                                                                variant="ghost"
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                onClick={usernameConfirm}
                                                                size="small"
                                                                type="button"
                                                            >
                                                                Change username
                                                            </Button>
                                                        </>
                                                    }
                                                    icon="at"
                                                    onClose={() =>
                                                        setUsernameConfirmationOpen(false)
                                                    }
                                                    size="small"
                                                    title="Confirm username change"
                                                >
                                                    Your username will change from @
                                                    {snapshot.profile.username} to @
                                                    {usernameDraft.trim().toLowerCase()}. Mentions
                                                    and profile links will use the new username.
                                                </Modal>
                                            </ModalOverlay>
                                        ) : null}
                                        {developmentToken ? (
                                            <DevelopmentTokenModal
                                                copied={developmentTokenCopied}
                                                copyError={developmentTokenCopyError}
                                                credential={developmentToken}
                                                onClose={developmentTokenClose}
                                                onCopy={() => void developmentTokenCopy()}
                                                onToggleReveal={() => {
                                                    setDevelopmentTokenRevealed(
                                                        !developmentTokenRevealed,
                                                    );
                                                    setDevelopmentTokenCopied(false);
                                                }}
                                                revealed={developmentTokenRevealed}
                                            />
                                        ) : null}
                                    </>
                                ) : (
                                    <Banner tone="danger" title="Settings unavailable">
                                        {statusError()}
                                    </Banner>
                                )
                            ) : (
                                <EmptyState
                                    description="Retrieving your workspace profile and preferences."
                                    icon="at"
                                    title="Loading settings…"
                                />
                            )}
                        </Box>
                    </Box>
                );
            }}
        </StoreSurface>
    );
}
function profileName(snapshot: SettingsSnapshot): string {
    return [snapshot.profile.firstName, snapshot.profile.lastName].filter(Boolean).join(" ");
}
function initials(value: string): string {
    return value
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
function notificationLevelGet(snapshot: SettingsSnapshot): NotificationLevel {
    if (
        snapshot.notifications.directMessages === "all" &&
        snapshot.notifications.threadReplies === "all"
    )
        return "all";
    if (
        snapshot.notifications.mentions === "all" ||
        snapshot.notifications.threadReplies === "mentions"
    )
        return "mentions";
    return "none";
}
function notificationLevelUpdate(
    store: ReturnType<SettingsStore["getState"]>,
    value: NotificationLevel,
): void {
    store.directMessagesUpdate(value === "all" ? "all" : "none");
    store.mentionsUpdate(value === "none" ? "none" : "all");
    store.threadRepliesUpdate(value);
}
function saveError(snapshot: SettingsSnapshot): string | undefined {
    for (const save of [snapshot.profileSave, snapshot.presenceSave, snapshot.notificationsSave])
        if (save.type === "error") return save.error.message;
    return undefined;
}
function savePending(snapshot: SettingsSnapshot): boolean {
    return [snapshot.profileSave, snapshot.presenceSave, snapshot.notificationsSave].some(
        (save) => save.type === "dirty" || save.type === "saving",
    );
}

function errorMessage(reason: unknown, fallback: string): string {
    return reason instanceof Error && reason.message ? reason.message : fallback;
}
