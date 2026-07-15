import nodemailer, { type Transporter } from "nodemailer";

export function smtpTransport(): Transporter {
    const required = [
        "EMAIL_SMTP_HOST",
        "EMAIL_SMTP_PORT",
        "EMAIL_SMTP_USER",
        "EMAIL_SMTP_PASSWORD",
    ] as const;
    for (const name of required)
        if (!process.env[name])
            throw new Error(`${name} is required when magic-link authentication is enabled`);
    const port = Number(process.env.EMAIL_SMTP_PORT);
    if (!Number.isSafeInteger(port) || port < 1)
        throw new Error("EMAIL_SMTP_PORT must be a valid port");
    return nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASSWORD },
    });
}
