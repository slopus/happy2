import { asDelivery } from "../../integration/asDelivery.js";
import { type ClaimedDelivery } from "../../integration/claimedDelivery.js";
import { text } from "../../integration/text.js";
export function asClaimedDelivery(row: Record<string, unknown>): ClaimedDelivery {
    return {
        ...asDelivery(row),
        url: text(row.url),
        signingSecretCiphertext: text(row.signing_secret_ciphertext),
        payloadJson: text(row.payload_json),
    };
}
