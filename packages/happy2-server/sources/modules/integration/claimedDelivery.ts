import { type QueuedWebhookDelivery } from "../integrations/types.js";
export interface ClaimedDelivery extends QueuedWebhookDelivery {
    url: string;
    signingSecretCiphertext: string;
    payloadJson: string;
}
