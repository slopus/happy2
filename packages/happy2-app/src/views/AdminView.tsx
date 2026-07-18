import { AdminPage } from "happy2-ui";
import type { HappyState } from "happy2-state";

export interface AdminViewProps {
    state: HappyState;
}

export function AdminView(props: AdminViewProps) {
    return (
        <AdminPage
            agentImagesStore={() => props.state.agentImages()}
            agentSecretsStore={() => props.state.agentSecrets()}
            store={props.state.admin()}
        />
    );
}
