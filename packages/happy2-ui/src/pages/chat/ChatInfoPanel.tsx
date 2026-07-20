import { type CSSProperties } from "react";
import {
    Box,
    Button,
    FormRow,
    InfoPanel,
    PortShareControl,
    SegmentedControl,
    Select,
    Switch,
    TextField,
    type InfoPanelProfile,
    type MemberItem,
    type SelectOption,
} from "./ChatPageComponents.js";
import type { PortShareView } from "./chatPageModels.js";
const formStyle: CSSProperties = { display: "flex", flexDirection: "column" };
const footerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    paddingTop: "4px",
};
const effortStyle: CSSProperties = {
    fontSize: "13px",
    lineHeight: "20px",
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
    defaultAgentBusy?: boolean;
    defaultAgentOptions?: SelectOption[];
    defaultAgentUserId?: string;
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
    portShare?: PortShareView;
    onAutoJoinChange(value: boolean): void;
    onChannelNameChange(value: string): void;
    onChannelTopicChange(value: string): void;
    onClose(): void;
    onDefaultAgentChange?(agentUserId: string): void;
    onEffortChange(value: string): void;
    onPortShareOpen(): void;
    onPortShareDisable(): void;
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
            {!props.profileOverride && props.portShare ? (
                <FormRow
                    control={
                        <PortShareControl
                            disabling={props.portShare.disabling}
                            error={props.portShare.error}
                            name={props.portShare.name}
                            onDisable={props.onPortShareDisable}
                            onOpen={props.onPortShareOpen}
                            opening={props.portShare.opening}
                            subtitle={props.portShare.subtitle}
                            variant="bar"
                        />
                    }
                    label="Port sharing"
                    layout="stacked"
                />
            ) : null}
            {!props.profileOverride && !props.peer && props.canEdit ? (
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
                    {props.isServerAdmin && !props.isMain ? (
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
                    ) : null}
                    {props.onDefaultAgentChange && (props.defaultAgentOptions?.length ?? 0) > 0 ? (
                        <FormRow
                            control={
                                <Select
                                    data-testid="channel-default-agent"
                                    disabled={props.busy || props.defaultAgentBusy}
                                    fullWidth
                                    onValueChange={props.onDefaultAgentChange}
                                    options={props.defaultAgentOptions ?? []}
                                    placeholder="Choose an agent"
                                    value={props.defaultAgentUserId}
                                />
                            }
                            label="Default agent"
                            layout="stacked"
                        />
                    ) : null}
                    <Box style={footerStyle}>
                        <Button
                            disabled={props.busy || !props.channelName.trim()}
                            onClick={props.onSave}
                        >
                            Save changes
                        </Button>
                    </Box>
                </Box>
            ) : null}
            {!props.profileOverride && props.isAgent ? (
                <FormRow
                    control={
                        props.effortOptions ? (
                            ((options: readonly string[]) => (
                                <SegmentedControl
                                    disabled={!props.canChangeEffort || props.effortBusy}
                                    fullWidth
                                    onChange={props.onEffortChange}
                                    segments={options.map((value) => ({
                                        label: effortLabel(value),
                                        value,
                                    }))}
                                    value={props.effortValue ?? options[0] ?? ""}
                                />
                            ))(props.effortOptions)
                        ) : (
                            <Box style={effortStyle}>
                                {props.effortError ?? "Loading effort levels…"}
                            </Box>
                        )
                    }
                    label="Reasoning effort"
                    layout="stacked"
                />
            ) : null}
        </InfoPanel>
    );
}
function effortLabel(value: string): string {
    return value === "xhigh" ? "X-High" : value.charAt(0).toUpperCase() + value.slice(1);
}
