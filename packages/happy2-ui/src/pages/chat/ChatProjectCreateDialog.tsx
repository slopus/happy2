import { useState, type CSSProperties } from "react";
import {
    Box,
    Button,
    FormRow,
    Modal,
    ModalOverlay,
    Select,
    TextField,
    type SelectOption,
} from "./ChatPageComponents.js";

const kinds: SelectOption[] = [
    { value: "public_channel", label: "Public channel" },
    { value: "private_channel", label: "Private channel" },
];
const stackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };

export interface ChatProjectCreateDialogProps {
    busy: boolean;
    initialKind?: "public_channel" | "private_channel";
    onClose(): void;
    onCreate(input: import("happy2-state").CreateProjectInput): void;
}

/** Prop-driven project form that always collects the project's required first channel. */
export function ChatProjectCreateDialog(props: ChatProjectCreateDialogProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [channelName, setChannelName] = useState("");
    const [channelSlug, setChannelSlug] = useState("");
    const [channelSlugEdited, setChannelSlugEdited] = useState(false);
    const [kind, setKind] = useState<"public_channel" | "private_channel">(
        props.initialKind ?? "public_channel",
    );
    const ready = name.trim() !== "" && channelName.trim() !== "" && channelSlug.trim() !== "";
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.busy || !ready}
                            icon="plus"
                            onClick={() =>
                                props.onCreate({
                                    name: name.trim(),
                                    ...(description.trim()
                                        ? { description: description.trim() }
                                        : {}),
                                    initialChannel: {
                                        kind,
                                        name: channelName.trim(),
                                        slug: channelSlug,
                                    },
                                })
                            }
                        >
                            Create project
                        </Button>
                    </Box>
                }
                icon="files"
                onClose={props.onClose}
                size="medium"
                title="Create project"
            >
                <Box style={stackStyle}>
                    <FormRow
                        control={<TextField fullWidth onValueChange={setName} value={name} />}
                        label="Project name"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={setDescription}
                                placeholder="What belongs in this project?"
                                value={description}
                            />
                        }
                        label="Description"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setChannelName(value);
                                    if (!channelSlugEdited) setChannelSlug(slugify(value));
                                }}
                                value={channelName}
                            />
                        }
                        label="First channel"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setChannelSlugEdited(true);
                                    setChannelSlug(slugify(value));
                                }}
                                value={channelSlug}
                            />
                        }
                        label="Channel slug"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <Select
                                fullWidth
                                onValueChange={(value) =>
                                    setKind(value as "public_channel" | "private_channel")
                                }
                                options={kinds}
                                value={kind}
                            />
                        }
                        label="Visibility"
                        layout="stacked"
                    />
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
        .slice(0, 64);
}
