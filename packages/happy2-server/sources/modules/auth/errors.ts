export class RegistrationClosedError extends Error {
    constructor() {
        super("Registration is closed");
        this.name = "RegistrationClosedError";
    }
}

export class AccountExistsError extends Error {
    constructor() {
        super("Account already exists");
        this.name = "AccountExistsError";
    }
}
