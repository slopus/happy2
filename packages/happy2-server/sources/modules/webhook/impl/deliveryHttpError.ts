export class DeliveryHttpError extends Error {
    constructor(
        readonly statusCode: number,
        readonly responseBody?: string,
    ) {
        super(`Webhook returned HTTP ${statusCode}`);
    }
}
