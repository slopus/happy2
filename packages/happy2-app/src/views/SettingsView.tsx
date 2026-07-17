import { Show, createSignal, onCleanup, onMount } from "solid-js";
import {
    Banner,
    Box,
    Button,
    EmptyState,
    FormRow,
    ProfileCard,
    Modal,
    ModalOverlay,
    SegmentedControl,
    StatusPicker,
    Switch,
    TextField,
    type Availability,
    type ProfileCardProps,
    type ProfileStatus,
    type SegmentedControlSegment,
} from "happy2-ui";
import { type AuthSession } from "../components/AuthGate";
import { featureEmptyStates, type NotificationPreference, type SettingsState } from "../mockData";

export type SettingsViewProps = {
    profile: Pick<
        ProfileCardProps,
        "name" | "username" | "title" | "initials" | "tone" | "presence" | "imageUrl"
    >;
    status: ProfileStatus;
    availability: Availability;
    settings: SettingsState;
    session?: AuthSession;
};

const notifySegments: SegmentedControlSegment[] = [
    { value: "all", label: "All activity" },
    { value: "mentions", label: "Mentions" },
    { value: "none", label: "Nothing" },
];

const themeSegments: SegmentedControlSegment[] = [
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
];

/**
 * You / Settings feature area. Authenticated profile, presence, status, and
 * notification changes autosave through happy2-state; unsupported device-only
 * presentation preferences remain local in the unauthenticated showcase.
 */
export function SettingsView(props: SettingsViewProps) {
    if (!props.session) {
        return (
            <EmptyState
                description="Connect to a workspace to view and change your profile settings."
                icon="at"
                title="Profile requires a workspace"
            />
        );
    }
    const user = props.session?.user;
    const liveName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "";
    const initialName = liveName || props.profile.name;

    /* Empty state: no identity to render (degenerate/missing profile data). */
    if (!initialName.trim()) {
        const empty = featureEmptyStates["you"]!;
        return <EmptyState description={empty.description} icon={empty.icon} title={empty.title} />;
    }

    const imageUrl = user?.avatarUrl ?? props.profile.imageUrl;

    const [name, setName] = createSignal(initialName);
    const [handle, setHandle] = createSignal(user?.username ?? props.profile.username);
    const [confirmedHandle, setConfirmedHandle] = createSignal(handle());
    const [usernameConfirmationOpen, setUsernameConfirmationOpen] = createSignal(false);
    const [title, setTitle] = createSignal(props.profile.title ?? "");
    const [email, setEmail] = createSignal(user?.email ?? props.settings.email);
    const [availability, setAvailability] = createSignal<Availability>(props.availability);
    const [statusEmoji, setStatusEmoji] = createSignal(props.status.emoji ?? "");
    const [statusText, setStatusText] = createSignal(props.status.text ?? "");

    const [notify, setNotify] = createSignal<NotificationPreference>(
        props.settings.notificationPreference,
    );
    const [desktopNotifications, setDesktopNotifications] = createSignal(
        props.settings.soundsEnabled,
    );
    const [emailNotifications, setEmailNotifications] = createSignal(props.settings.emailDigest);
    const [theme, setTheme] = createSignal<SettingsState["theme"]>(props.settings.theme);
    const [saveError, setSaveError] = createSignal<string>();
    const [loadError, setLoadError] = createSignal<string>();
    const [savingCount, setSavingCount] = createSignal(0);
    const [savePending, setSavePending] = createSignal(false);
    const [initialized, setInitialized] = createSignal(!props.session);
    let profileTimer: ReturnType<typeof setTimeout> | undefined;
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    let preferencesTimer: ReturnType<typeof setTimeout> | undefined;
    let profileSaving = false;
    let statusSaving = false;
    let preferencesSaving = false;
    let disposed = false;

    const initials = () => {
        const parts = name().trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return props.profile.initials;
        const first = parts[0]!.charAt(0);
        const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
        return (first + last).toUpperCase() || props.profile.initials;
    };
    const hasStatus = () => statusText().trim() !== "" || statusEmoji() !== "";
    const clearStatus = () => {
        setStatusText("");
        setStatusEmoji("");
        queueStatusSave();
    };

    const currentProfileFingerprint = () => JSON.stringify([name(), email()]);
    const currentStatusFingerprint = () =>
        JSON.stringify([availability(), statusEmoji(), statusText()]);
    const currentPreferencesFingerprint = () =>
        JSON.stringify([notify(), desktopNotifications(), emailNotifications()]);

    function queueProfileSave() {
        if (!props.session || disposed) return;
        setSavePending(true);
        if (profileTimer) clearTimeout(profileTimer);
        profileTimer = setTimeout(() => {
            profileTimer = undefined;
            if (initialized()) void saveProfile();
            else queueProfileSave();
        }, 400);
    }

    function queueStatusSave() {
        if (!props.session || disposed) return;
        setSavePending(true);
        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
            statusTimer = undefined;
            if (initialized()) void saveStatus();
            else queueStatusSave();
        }, 400);
    }

    function queuePreferencesSave() {
        if (!props.session || disposed) return;
        setSavePending(true);
        if (preferencesTimer) clearTimeout(preferencesTimer);
        preferencesTimer = setTimeout(() => {
            preferencesTimer = undefined;
            if (initialized()) void savePreferences();
            else queuePreferencesSave();
        }, 400);
    }

    async function saveProfile() {
        const session = props.session;
        if (!session) return;
        const fingerprint = currentProfileFingerprint();
        const parts = name().trim().split(/\s+/).filter(Boolean);
        const firstName = parts.shift();
        const username = confirmedHandle();
        if (!firstName) {
            setSaveError("Display name must include a first name.");
            refreshSavePending();
            return;
        }
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
            setSaveError(
                "Username must be 3–32 lowercase letters, numbers, underscores, or hyphens.",
            );
            refreshSavePending();
            return;
        }
        if (profileSaving) return;
        profileSaving = true;
        setSavingCount((count) => count + 1);
        try {
            const result = await session.state.execute("updateProfile", {
                firstName,
                lastName: parts.join(" ") || null,
                username,
                email: email().trim() || null,
                phone: session.user.phone ?? null,
            });
            if (disposed) return;
            session.updateUser({
                ...result.user,
                kind: session.user.kind,
                avatarUrl: session.user.avatarUrl,
            });
            setSaveError(undefined);
        } catch (reason) {
            if (!disposed) setLoadError(errorMessage(reason));
        } finally {
            profileSaving = false;
            setSavingCount((count) => Math.max(0, count - 1));
            if (currentProfileFingerprint() !== fingerprint) queueProfileSave();
            else refreshSavePending();
        }
    }

    async function confirmUsernameChange() {
        const session = props.session;
        if (!session) return;
        const username = handle().trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) {
            setSaveError(
                "Username must be 3–32 lowercase letters, numbers, underscores, or hyphens.",
            );
            setUsernameConfirmationOpen(false);
            return;
        }
        const parts = name().trim().split(/\s+/).filter(Boolean);
        const firstName = parts.shift();
        if (!firstName) {
            setSaveError("Display name must include a first name.");
            setUsernameConfirmationOpen(false);
            return;
        }
        setSavingCount((count) => count + 1);
        try {
            const result = await session.state.execute("updateProfile", {
                firstName,
                lastName: parts.join(" ") || null,
                username,
                email: email().trim() || null,
                phone: session.user.phone ?? null,
            });
            if (disposed) return;
            setConfirmedHandle(username);
            setHandle(username);
            session.updateUser({
                ...result.user,
                kind: session.user.kind,
                avatarUrl: session.user.avatarUrl,
            });
            setSaveError(undefined);
        } catch (reason) {
            if (!disposed) setSaveError(errorMessage(reason));
        } finally {
            setUsernameConfirmationOpen(false);
            setSavingCount((count) => Math.max(0, count - 1));
        }
    }

    async function saveStatus() {
        const session = props.session;
        if (!session) return;
        const fingerprint = currentStatusFingerprint();
        if (statusSaving) return;
        statusSaving = true;
        setSavingCount((count) => count + 1);
        try {
            await session.state.execute("updateStatus", {
                availability: availability(),
                customStatusEmoji: statusEmoji().trim() || null,
                customStatusText: statusText().trim() || null,
            });
            if (disposed) return;
            setSaveError(undefined);
        } catch (reason) {
            if (!disposed) setSaveError(errorMessage(reason));
        } finally {
            statusSaving = false;
            setSavingCount((count) => Math.max(0, count - 1));
            if (currentStatusFingerprint() !== fingerprint) queueStatusSave();
            else refreshSavePending();
        }
    }

    async function savePreferences() {
        const session = props.session;
        if (!session) return;
        const fingerprint = currentPreferencesFingerprint();
        const level = notify();
        if (preferencesSaving) return;
        preferencesSaving = true;
        setSavingCount((count) => count + 1);
        try {
            await session.state.execute("updateNotificationPreferences", {
                directMessages: level === "all" ? "all" : "none",
                mentions: level === "none" ? "none" : "all",
                threadReplies: level,
                desktopNotifications: desktopNotifications(),
                emailNotifications: emailNotifications(),
            });
            if (disposed) return;
            setSaveError(undefined);
        } catch (reason) {
            if (!disposed) setSaveError(errorMessage(reason));
        } finally {
            preferencesSaving = false;
            setSavingCount((count) => Math.max(0, count - 1));
            if (currentPreferencesFingerprint() !== fingerprint) queuePreferencesSave();
            else refreshSavePending();
        }
    }

    function refreshSavePending() {
        setSavePending(
            Boolean(
                profileTimer ||
                statusTimer ||
                preferencesTimer ||
                profileSaving ||
                statusSaving ||
                preferencesSaving,
            ),
        );
    }

    onMount(async () => {
        const session = props.session;
        if (!session) return;
        const statusBeforeLoad = currentStatusFingerprint();
        const preferencesBeforeLoad = currentPreferencesFingerprint();
        try {
            const [contacts, presence, preferences] = await Promise.all([
                session.state.execute("getContacts"),
                session.state.execute("getPresence"),
                session.state.execute("getNotificationPreferences"),
            ]);
            if (disposed) return;
            const current = contacts.users.find((item) => item.id === session.user.id);
            const currentStatus = presence.statuses.find((item) => item.userId === session.user.id);
            if (current?.title) setTitle(current.title);
            const statusChangedWhileLoading = currentStatusFingerprint() !== statusBeforeLoad;
            if (currentStatus && !statusChangedWhileLoading) {
                setAvailability(currentStatus.availability);
                setStatusEmoji(currentStatus.customStatusEmoji ?? "");
                setStatusText(currentStatus.customStatusText ?? "");
            }
            const value = preferences.preferences;
            const preferencesChangedWhileLoading =
                currentPreferencesFingerprint() !== preferencesBeforeLoad;
            if (!preferencesChangedWhileLoading) {
                setNotify(
                    value.directMessages === "all" && value.threadReplies === "all"
                        ? "all"
                        : value.mentions === "all" || value.threadReplies === "mentions"
                          ? "mentions"
                          : "none",
                );
                setDesktopNotifications(value.desktopNotifications);
                setEmailNotifications(value.emailNotifications);
            }
        } catch (reason) {
            if (!disposed) setSaveError(errorMessage(reason));
        } finally {
            if (!disposed) setInitialized(true);
        }
    });

    onCleanup(() => {
        disposed = true;
        if (profileTimer) clearTimeout(profileTimer);
        if (statusTimer) clearTimeout(statusTimer);
        if (preferencesTimer) clearTimeout(preferencesTimer);
    });

    return (
        <Box
            style={{
                "box-sizing": "border-box",
                display: "flex",
                flex: "1 1 0%",
                "flex-direction": "column",
                "align-items": "center",
                "min-height": "0",
                width: "100%",
                padding: "32px 24px",
                "overflow-y": "auto",
            }}
        >
            <Show
                when={initialized()}
                fallback={
                    <EmptyState
                        description="Retrieving your workspace profile and preferences."
                        icon="at"
                        title="Loading settings…"
                    />
                }
            >
                <Show
                    when={!loadError()}
                    fallback={
                        <Banner tone="danger" title="Settings unavailable">
                            {loadError()!}
                        </Banner>
                    }
                >
                    <>
                        <Box
                            style={{
                                display: "flex",
                                "flex-direction": "column",
                                gap: "16px",
                                width: "100%",
                                "max-width": "640px",
                            }}
                        >
                            <Banner
                                tone={
                                    saveError()
                                        ? "danger"
                                        : savingCount() > 0 || savePending()
                                          ? "info"
                                          : "success"
                                }
                                title={
                                    saveError()
                                        ? "Changes were not saved"
                                        : savingCount() > 0 || savePending()
                                          ? "Saving changes…"
                                          : initialized()
                                            ? "All changes saved"
                                            : "Loading settings…"
                                }
                            >
                                {saveError() ??
                                    (savingCount() > 0 || savePending()
                                        ? "Your workspace is updating."
                                        : initialized()
                                          ? "Profile and notification settings are up to date."
                                          : "Retrieving your workspace preferences.")}
                            </Banner>
                            <ProfileCard
                                imageUrl={imageUrl}
                                initials={initials()}
                                name={name()}
                                presence={props.profile.presence}
                                status={
                                    hasStatus()
                                        ? {
                                              emoji: statusEmoji() || undefined,
                                              text: statusText() || undefined,
                                          }
                                        : undefined
                                }
                                title={title() || undefined}
                                tone={props.profile.tone}
                                username={handle()}
                            />

                            <StatusPicker
                                availability={availability()}
                                onAvailabilityChange={(value) => {
                                    setAvailability(value);
                                    queueStatusSave();
                                }}
                                onClearStatus={clearStatus}
                                onStatusTextChange={(value) => {
                                    setStatusText(value);
                                    queueStatusSave();
                                }}
                                statusEmoji={statusEmoji() || undefined}
                                statusText={statusText()}
                            />

                            <Box>
                                <FormRow
                                    control={
                                        <Box width={260}>
                                            <TextField
                                                fullWidth
                                                id="settings-name"
                                                onValueChange={(value) => {
                                                    setName(value);
                                                    queueProfileSave();
                                                }}
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
                                                display: "flex",
                                                "align-items": "center",
                                                gap: "8px",
                                                width: "360px",
                                            }}
                                        >
                                            <TextField
                                                fullWidth
                                                id="settings-username"
                                                leadingIcon="at"
                                                onValueChange={setHandle}
                                                size="small"
                                                value={handle()}
                                            />
                                            <Show
                                                when={
                                                    handle().trim().toLowerCase() !==
                                                    confirmedHandle()
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
                                                disabled={Boolean(props.session)}
                                                fullWidth
                                                id="settings-title"
                                                onValueChange={setTitle}
                                                placeholder="Add a title"
                                                size="small"
                                                value={title()}
                                            />
                                        </Box>
                                    }
                                    description={
                                        props.session
                                            ? "Managed by workspace administrators"
                                            : "Role or team shown next to your name"
                                    }
                                    htmlFor="settings-title"
                                    label="Title"
                                />
                                <FormRow
                                    control={
                                        <Box width={260}>
                                            <TextField
                                                fullWidth
                                                id="settings-email"
                                                onValueChange={(value) => {
                                                    setEmail(value);
                                                    queueProfileSave();
                                                }}
                                                size="small"
                                                type="email"
                                                value={email()}
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
                                            onChange={(value) => {
                                                setNotify(value as NotificationPreference);
                                                queuePreferencesSave();
                                            }}
                                            segments={notifySegments}
                                            size="small"
                                            value={notify()}
                                        />
                                    }
                                    description="Choose what activity sends you a notification"
                                    label="Notifications"
                                />
                                <FormRow
                                    control={
                                        <Switch
                                            aria-label="Desktop notifications"
                                            checked={desktopNotifications()}
                                            onChange={(value) => {
                                                setDesktopNotifications(value);
                                                queuePreferencesSave();
                                            }}
                                        />
                                    }
                                    description="Show notifications for new messages and mentions on this device"
                                    label="Desktop notifications"
                                />
                                <FormRow
                                    control={
                                        <Switch
                                            aria-label="Email notifications"
                                            checked={emailNotifications()}
                                            onChange={(value) => {
                                                setEmailNotifications(value);
                                                queuePreferencesSave();
                                            }}
                                        />
                                    }
                                    description="Allow account and activity notifications by email"
                                    label="Email notifications"
                                />
                                <Show when={!props.session}>
                                    <FormRow
                                        control={
                                            <SegmentedControl
                                                onChange={(value) =>
                                                    setTheme(value as SettingsState["theme"])
                                                }
                                                segments={themeSegments}
                                                size="small"
                                                value={theme()}
                                            />
                                        }
                                        description="Match your system theme or force dark"
                                        label="Appearance"
                                    />
                                </Show>
                            </Box>
                        </Box>
                        <Show when={usernameConfirmationOpen()}>
                            <ModalOverlay onDismiss={() => setUsernameConfirmationOpen(false)}>
                                <Modal
                                    footer={
                                        <>
                                            <Button
                                                onClick={() => {
                                                    setHandle(confirmedHandle());
                                                    setUsernameConfirmationOpen(false);
                                                }}
                                                size="small"
                                                type="button"
                                                variant="ghost"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={() => void confirmUsernameChange()}
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
                                    Your username will change from @{confirmedHandle()} to @
                                    {handle().trim().toLowerCase()}. Mentions and profile links will
                                    use the new username.
                                </Modal>
                            </ModalOverlay>
                        </Show>
                    </>
                </Show>
            </Show>
        </Box>
    );
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
