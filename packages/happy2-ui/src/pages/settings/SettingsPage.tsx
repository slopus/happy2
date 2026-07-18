import type { ClientUser, HappyState, SettingsSnapshot, SettingsStore } from "happy2-state";
import { createEffect, Show, createSignal } from "solid-js";
import type { ToneName } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
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
    const [handleDraft, setHandleDraft] = createSignal(props.store.get().profile.username);
    const [handleDirty, setHandleDirty] = createSignal(false);
    const [usernameConfirmationOpen, setUsernameConfirmationOpen] = createSignal(false);
    const [avatarUploading, setAvatarUploading] = createSignal(false);
    const [localError, setLocalError] = createSignal<string>();
    let avatarInput: HTMLInputElement | undefined;
    let observedUsername = props.store.get().profile.username;

    const profileChanged = () => props.onProfileChange?.(props.store.get().profile);
    const displayNameUpdate = (value: string) => {
        const parts = value.trimStart().split(/\s+/);
        props.store.displayNameUpdate(parts.shift() ?? "", parts.join(" ") || undefined);
        profileChanged();
    };
    const emailUpdate = (value: string) => {
        props.store.emailUpdate(value || undefined);
        profileChanged();
    };
    const usernameConfirm = () => {
        const username = handleDraft().trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
            setLocalError(
                "Username must be 3–32 lowercase letters, numbers, underscores, or hyphens.",
            );
        } else {
            props.store.usernameUpdate(username);
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
            if (avatarInput) avatarInput.value = "";
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
            if (avatarInput) avatarInput.value = "";
        }
    };

    return (
        <StoreSurface store={props.store}>
            {(snapshot, store) => {
                createEffect(() => {
                    const username = snapshot().profile.username;
                    if (username === observedUsername) return;
                    observedUsername = username;
                    if (!handleDirty()) queueMicrotask(() => setHandleDraft(observedUsername));
                });
                const name = () => profileName(snapshot());
                const notificationLevel = () => notificationLevelGet(snapshot());
                const error = () => saveError(snapshot()) ?? localError();
                const saving = () => savePending(snapshot()) || avatarUploading();
                const statusError = () => {
                    const status = snapshot().status;
                    return status.type === "error" ? status.error.message : undefined;
                };
                return (
                    <Box
                        style={{
                            "align-items": "center",
                            "box-sizing": "border-box",
                            display: "flex",
                            flex: "1 1 0%",
                            "flex-direction": "column",
                            "min-height": "0",
                            "overflow-y": "auto",
                            padding: "32px 24px",
                            width: "100%",
                        }}
                    >
                        <Show
                            when={snapshot().status.type !== "loading"}
                            fallback={
                                <EmptyState
                                    description="Retrieving your workspace profile and preferences."
                                    icon="at"
                                    title="Loading settings…"
                                />
                            }
                        >
                            <Show
                                when={!statusError()}
                                fallback={
                                    <Banner tone="danger" title="Settings unavailable">
                                        {statusError()}
                                    </Banner>
                                }
                            >
                                <Box
                                    style={{
                                        display: "flex",
                                        "flex-direction": "column",
                                        gap: "16px",
                                        "max-width": "640px",
                                        width: "100%",
                                    }}
                                >
                                    <Banner
                                        tone={error() ? "danger" : saving() ? "info" : "success"}
                                        title={
                                            error()
                                                ? "Changes were not saved"
                                                : saving()
                                                  ? "Saving changes…"
                                                  : "All changes saved"
                                        }
                                    >
                                        {error() ??
                                            (saving()
                                                ? "Your workspace is updating."
                                                : "Profile and notification settings are up to date.")}
                                    </Banner>
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
                                                        ref={(element) => (avatarInput = element)}
                                                        type="file"
                                                    />
                                                    <Button
                                                        disabled={avatarUploading()}
                                                        onClick={() => avatarInput?.click()}
                                                        size="small"
                                                        type="button"
                                                        variant="secondary"
                                                    >
                                                        {avatarUploading()
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
                                            snapshot().presence.customStatusText ||
                                            snapshot().presence.customStatusEmoji
                                                ? {
                                                      emoji: snapshot().presence.customStatusEmoji,
                                                      text: snapshot().presence.customStatusText,
                                                  }
                                                : undefined
                                        }
                                        title={snapshot().title}
                                        tone={props.avatarTone ?? "brand"}
                                        username={snapshot().profile.username}
                                    />
                                    <StatusPicker
                                        availability={snapshot().presence.availability}
                                        onAvailabilityChange={store.availabilityUpdate}
                                        onClearStatus={() => {
                                            store.statusTextUpdate(undefined);
                                            store.statusEmojiUpdate(undefined);
                                        }}
                                        onStatusTextChange={(value) =>
                                            store.statusTextUpdate(value || undefined)
                                        }
                                        statusEmoji={snapshot().presence.customStatusEmoji}
                                        statusText={snapshot().presence.customStatusText ?? ""}
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
                                                        "align-items": "center",
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
                                                        value={handleDraft()}
                                                    />
                                                    <Show
                                                        when={
                                                            handleDraft().trim().toLowerCase() !==
                                                            snapshot().profile.username
                                                        }
                                                    >
                                                        <Button
                                                            onClick={() =>
                                                                setUsernameConfirmationOpen(true)
                                                            }
                                                            size="small"
                                                            type="button"
                                                            variant="secondary"
                                                        >
                                                            Confirm username
                                                        </Button>
                                                    </Show>
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
                                                        value={snapshot().title ?? ""}
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
                                                        value={snapshot().profile.email ?? ""}
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
                                                        snapshot().notifications
                                                            .desktopNotifications
                                                    }
                                                    onChange={store.desktopNotificationsUpdate}
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
                                                        snapshot().notifications.emailNotifications
                                                    }
                                                    onChange={store.emailNotificationsUpdate}
                                                />
                                            }
                                            description="Allow account and activity notifications by email"
                                            label="Email notifications"
                                        />
                                    </Box>
                                </Box>
                                <Show when={usernameConfirmationOpen()}>
                                    <ModalOverlay
                                        onDismiss={() => setUsernameConfirmationOpen(false)}
                                    >
                                        <Modal
                                            footer={
                                                <>
                                                    <Button
                                                        onClick={() => {
                                                            setHandleDraft(
                                                                snapshot().profile.username,
                                                            );
                                                            setHandleDirty(false);
                                                            setUsernameConfirmationOpen(false);
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
                                            onClose={() => setUsernameConfirmationOpen(false)}
                                            size="small"
                                            title="Confirm username change"
                                        >
                                            Your username will change from @
                                            {snapshot().profile.username} to @
                                            {handleDraft().trim().toLowerCase()}. Mentions and
                                            profile links will use the new username.
                                        </Modal>
                                    </ModalOverlay>
                                </Show>
                            </Show>
                        </Show>
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

function notificationLevelUpdate(store: SettingsStore, value: NotificationLevel): void {
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
