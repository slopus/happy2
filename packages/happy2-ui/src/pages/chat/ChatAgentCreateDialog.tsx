import { createSignal, type JSX } from "solid-js";
import { Box, Button, FormRow, Modal, ModalOverlay, TextField } from "./ChatPageComponents.js";

const stackStyle: JSX.CSSProperties = { display: "flex", "flex-direction": "column", gap: "8px" };
const actionsStyle: JSX.CSSProperties = { display: "flex", "align-items": "center", gap: "8px" };

export interface ChatAgentCreateDialogProps {
    busy: boolean;
    onClose(): void;
    onCreate(name: string, username: string): void;
}

export function ChatAgentCreateDialog(props: ChatAgentCreateDialogProps) {
    const [name, setName] = createSignal("");
    const [username, setUsername] = createSignal("");
    const [usernameEdited, setUsernameEdited] = createSignal(false);
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                props.busy || !name().trim() || !validAgentUsername(username())
                            }
                            icon="plus"
                            onClick={() => props.onCreate(name().trim(), username())}
                        >
                            Create agent
                        </Button>
                    </Box>
                }
                icon="spark"
                onClose={props.onClose}
                size="medium"
                title="Create agent"
            >
                <Box style={stackStyle}>
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setName(value);
                                    if (!usernameEdited()) setUsername(agentUsername(value));
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
                                    setUsernameEdited(true);
                                    setUsername(agentUsername(value));
                                }}
                                value={username()}
                            />
                        }
                        label="Username"
                        layout="stacked"
                    />
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

function agentUsername(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/gu, "_")
        .replace(/^[^a-z0-9]+/u, "")
        .slice(0, 32);
}
function validAgentUsername(value: string): boolean {
    return /^[a-z0-9][a-z0-9_.-]{1,31}$/u.test(value);
}
