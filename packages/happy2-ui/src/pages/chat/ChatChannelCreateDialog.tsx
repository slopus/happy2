import { Show, createSignal, type JSX } from "solid-js";
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
const stackStyle: JSX.CSSProperties = { display: "flex", "flex-direction": "column", gap: "8px" };
const actionsStyle: JSX.CSSProperties = { display: "flex", "align-items": "center", gap: "8px" };

export interface ChatChannelCreateDialogProps {
    busy: boolean;
    isServerAdmin: boolean;
    onClose(): void;
    onCreate(input: {
        name: string;
        slug: string;
        kind: "public_channel" | "private_channel";
        autoJoin: boolean;
    }): void;
}

export function ChatChannelCreateDialog(props: ChatChannelCreateDialogProps) {
    const [name, setName] = createSignal("");
    const [slug, setSlug] = createSignal("");
    const [slugEdited, setSlugEdited] = createSignal(false);
    const [kind, setKind] = createSignal<"public_channel" | "private_channel">("public_channel");
    const [autoJoin, setAutoJoin] = createSignal(false);
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.busy || !name().trim()}
                            icon="plus"
                            onClick={() =>
                                props.onCreate({
                                    name: name().trim(),
                                    slug: channelSlug(slug() || name()),
                                    kind: kind(),
                                    autoJoin: autoJoin(),
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
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setName(value);
                                    if (!slugEdited()) setSlug(channelSlug(value));
                                }}
                                value={name()}
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
                                value={slug()}
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
                                value={kind()}
                            />
                        }
                        label="Visibility"
                        layout="stacked"
                    />
                    <Show when={props.isServerAdmin}>
                        <FormRow
                            control={
                                <Switch
                                    aria-label="Auto-join new members"
                                    checked={autoJoin()}
                                    onChange={setAutoJoin}
                                />
                            }
                            label="Auto-join new members"
                            layout="stacked"
                        />
                    </Show>
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
