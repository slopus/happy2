import { createSignal } from "solid-js";
import {
    Box,
    EmptyState,
    FormRow,
    ProfileCard,
    Select,
    SegmentedControl,
    StatusPicker,
    Switch,
    TextField,
    type Availability,
    type ProfileCardProps,
    type ProfileStatus,
    type SegmentedControlSegment,
    type SelectOption,
} from "rigged-ui";
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

const languageOptions: SelectOption[] = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "fr", label: "Français" },
    { value: "de", label: "Deutsch" },
    { value: "ja", label: "日本語" },
];

/**
 * You / Settings feature area — a live/mock profile summary (ProfileCard), an
 * availability + custom-status editor (StatusPicker), and a settings form built
 * from FormRow + TextField/Select/Switch/SegmentedControl. Profile identity is
 * wired to the authenticated session when present (name, @username, avatar,
 * email) and falls back to the representative mock profile otherwise; the
 * notification and appearance preferences are local-only mock state.
 * TODO(server): persist profile + preference edits once server.ts exposes them.
 */
export function SettingsView(props: SettingsViewProps) {
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
    const [title, setTitle] = createSignal(props.profile.title ?? "");
    const [email, setEmail] = createSignal(user?.email ?? props.settings.email);
    const [language, setLanguage] = createSignal(props.settings.language);

    const [availability, setAvailability] = createSignal<Availability>(props.availability);
    const [statusEmoji, setStatusEmoji] = createSignal(props.status.emoji ?? "");
    const [statusText, setStatusText] = createSignal(props.status.text ?? "");

    const [notify, setNotify] = createSignal<NotificationPreference>(
        props.settings.notificationPreference,
    );
    const [sounds, setSounds] = createSignal(props.settings.soundsEnabled);
    const [digest, setDigest] = createSignal(props.settings.emailDigest);
    const [theme, setTheme] = createSignal<SettingsState["theme"]>(props.settings.theme);

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
    };

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
            <Box
                style={{
                    display: "flex",
                    "flex-direction": "column",
                    gap: "16px",
                    width: "100%",
                    "max-width": "640px",
                }}
            >
                <ProfileCard
                    imageUrl={imageUrl}
                    initials={initials()}
                    name={name()}
                    presence={props.profile.presence}
                    status={
                        hasStatus()
                            ? { emoji: statusEmoji() || undefined, text: statusText() || undefined }
                            : undefined
                    }
                    title={title() || undefined}
                    tone={props.profile.tone}
                    username={handle()}
                />

                <StatusPicker
                    availability={availability()}
                    expiresLabel={hasStatus() ? "Clears in 2 hours" : undefined}
                    onAvailabilityChange={setAvailability}
                    onClearStatus={clearStatus}
                    onStatusTextChange={setStatusText}
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
                                    onValueChange={setName}
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
                            <Box width={260}>
                                <TextField
                                    fullWidth
                                    id="settings-username"
                                    leadingIcon="at"
                                    onValueChange={setHandle}
                                    size="small"
                                    value={handle()}
                                />
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
                                    fullWidth
                                    id="settings-title"
                                    onValueChange={setTitle}
                                    placeholder="Add a title"
                                    size="small"
                                    value={title()}
                                />
                            </Box>
                        }
                        description="Role or team shown next to your name"
                        htmlFor="settings-title"
                        label="Title"
                    />
                    <FormRow
                        control={
                            <Box width={260}>
                                <TextField
                                    fullWidth
                                    id="settings-email"
                                    onValueChange={setEmail}
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
                    <FormRow
                        control={
                            <Select
                                id="settings-language"
                                onValueChange={setLanguage}
                                options={languageOptions}
                                size="small"
                                value={language()}
                                width={200}
                            />
                        }
                        description="Interface language on this device"
                        htmlFor="settings-language"
                        label="Language"
                    />
                </Box>

                <Box>
                    <FormRow
                        control={
                            <SegmentedControl
                                onChange={(value) => setNotify(value as NotificationPreference)}
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
                                aria-label="Notification sounds"
                                checked={sounds()}
                                onChange={setSounds}
                            />
                        }
                        description="Play a sound for new messages and mentions"
                        label="Notification sounds"
                    />
                    <FormRow
                        control={
                            <Switch
                                aria-label="Weekly email digest"
                                checked={digest()}
                                onChange={setDigest}
                            />
                        }
                        description="A Monday summary of what you missed"
                        label="Weekly email digest"
                    />
                    <FormRow
                        control={
                            <SegmentedControl
                                onChange={(value) => setTheme(value as SettingsState["theme"])}
                                segments={themeSegments}
                                size="small"
                                value={theme()}
                            />
                        }
                        description="Match your system theme or force dark"
                        label="Appearance"
                    />
                </Box>
            </Box>
        </Box>
    );
}
