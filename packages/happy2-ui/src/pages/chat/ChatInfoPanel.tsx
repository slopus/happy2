import { Show, type Accessor, type JSX } from "solid-js";
import {
    Box,
    Button,
    FormRow,
    InfoPanel,
    SegmentedControl,
    Switch,
    TextField,
    type InfoPanelProfile,
    type MemberItem,
} from "./ChatPageComponents.js";

const formStyle: JSX.CSSProperties = { display: "flex", "flex-direction": "column" };
const footerStyle: JSX.CSSProperties = {
    display: "flex",
    "justify-content": "flex-end",
    gap: "8px",
    "padding-top": "4px",
};
const effortStyle: JSX.CSSProperties = {
    "font-size": "13px",
    "line-height": "20px",
    color: "var(--happy2-text-muted)",
};

export interface ChatInfoPanelProps {
    about?: string;
    autoJoin: boolean;
    busy: boolean;
    canEdit: boolean;
    canChangeEffort: boolean;
    channelName: string;
    channelTopic: string;
    effortBusy: boolean;
    effortError?: string;
    effortOptions?: readonly string[];
    effortValue?: string;
    isAgent: boolean;
    isMain: boolean;
    isServerAdmin: boolean;
    members: MemberItem[];
    peer: boolean;
    profile?: InfoPanelProfile;
    profileOverride?: InfoPanelProfile;
    title: string;
    onAutoJoinChange(value: boolean): void;
    onChannelNameChange(value: string): void;
    onChannelTopicChange(value: string): void;
    onClose(): void;
    onEffortChange(value: string): void;
    onSave(): void;
}

export function ChatInfoPanel(props: ChatInfoPanelProps) {
    return (
        <InfoPanel
            about={
                !props.profileOverride && !props.peer && !props.canEdit ? props.about : undefined
            }
            data-testid="channel-info-panel"
            leadingIcon={props.profileOverride || props.peer ? undefined : "hash"}
            members={props.profileOverride ? [] : props.members}
            onClose={props.onClose}
            profile={props.profileOverride ?? props.profile}
            subtitle={
                props.profileOverride
                    ? "Profile"
                    : props.peer
                      ? "Direct message"
                      : props.canEdit
                        ? "Edit details"
                        : "Details"
            }
            title={props.profileOverride?.name ?? props.title}
        >
            <Show when={!props.profileOverride && !props.peer && props.canEdit}>
                <Box style={formStyle}>
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={props.onChannelNameChange}
                                value={props.channelName}
                            />
                        }
                        label="Name"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={props.onChannelTopicChange}
                                value={props.channelTopic}
                            />
                        }
                        label="About"
                        layout="stacked"
                    />
                    <Show when={props.isServerAdmin && !props.isMain}>
                        <FormRow
                            control={
                                <Switch
                                    aria-label="Auto-join new members"
                                    checked={props.autoJoin}
                                    onChange={props.onAutoJoinChange}
                                />
                            }
                            label="Auto-join new members"
                            layout="stacked"
                        />
                    </Show>
                    <Box style={footerStyle}>
                        <Button
                            disabled={props.busy || !props.channelName.trim()}
                            onClick={props.onSave}
                        >
                            Save changes
                        </Button>
                    </Box>
                </Box>
            </Show>
            <Show when={!props.profileOverride && props.isAgent}>
                <FormRow
                    control={
                        <Show
                            when={props.effortOptions}
                            fallback={
                                <Box style={effortStyle}>
                                    {props.effortError ?? "Loading effort levels…"}
                                </Box>
                            }
                        >
                            {(options: Accessor<readonly string[]>) => (
                                <SegmentedControl
                                    disabled={!props.canChangeEffort || props.effortBusy}
                                    fullWidth
                                    onChange={props.onEffortChange}
                                    segments={options().map((value) => ({
                                        label: effortLabel(value),
                                        value,
                                    }))}
                                    value={props.effortValue ?? options()[0] ?? ""}
                                />
                            )}
                        </Show>
                    }
                    label="Reasoning effort"
                    layout="stacked"
                />
            </Show>
        </InfoPanel>
    );
}

function effortLabel(value: string): string {
    return value === "xhigh" ? "X-High" : value.charAt(0).toUpperCase() + value.slice(1);
}
