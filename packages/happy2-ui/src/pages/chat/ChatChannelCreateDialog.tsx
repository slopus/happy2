import { useState, type CSSProperties } from "react";
import {
    Box,
    Button,
    FormRow,
    Modal,
    ModalOverlay,
    Select,
    Switch,
    TextField,
    type SelectOption,
} from "./ChatPageComponents.js";
const kinds: SelectOption[] = [
    { value: "public_channel", label: "Public channel" },
    { value: "private_channel", label: "Private channel" },
];
const stackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
export interface ChatChannelCreateDialogProps {
    busy: boolean;
    isServerAdmin: boolean;
    projects: readonly { readonly id: string; readonly name: string }[];
    initialProjectId: string;
    onClose(): void;
    onCreate(input: {
        name: string;
        slug: string;
        kind: "public_channel" | "private_channel";
        projectId: string;
        autoJoin: boolean;
    }): void;
}
export function ChatChannelCreateDialog(props: ChatChannelCreateDialogProps) {
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugEdited, setSlugEdited] = useState(false);
    const [kind, setKind] = useState<"public_channel" | "private_channel">("public_channel");
    const [autoJoin, setAutoJoin] = useState(false);
    const [projectId, setProjectId] = useState(props.initialProjectId);
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.busy || !name.trim() || !projectId}
                            icon="plus"
                            onClick={() =>
                                props.onCreate({
                                    name: name.trim(),
                                    slug: channelSlug(slug || name),
                                    kind: kind,
                                    projectId,
                                    autoJoin: autoJoin,
                                })
                            }
                        >
                            Create channel
                        </Button>
                    </Box>
                }
                icon="hash"
                onClose={props.onClose}
                size="medium"
                title="Create channel"
            >
                <Box style={stackStyle}>
                    <FormRow
                        control={
                            <Select
                                fullWidth
                                onValueChange={setProjectId}
                                options={props.projects.map((project) => ({
                                    value: project.id,
                                    label: project.name,
                                }))}
                                value={projectId}
                            />
                        }
                        label="Project"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setName(value);
                                    if (!slugEdited) setSlug(channelSlug(value));
                                }}
                                value={name}
                            />
                        }
                        label="Name"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setSlugEdited(true);
                                    setSlug(channelSlug(value));
                                }}
                                value={slug}
                            />
                        }
                        label="Slug"
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
                    {props.isServerAdmin ? (
                        <FormRow
                            control={
                                <Switch
                                    aria-label="Auto-join new members"
                                    checked={autoJoin}
                                    onChange={setAutoJoin}
                                />
                            }
                            label="Auto-join new members"
                            layout="stacked"
                        />
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
function channelSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
        .slice(0, 64);
}
