export class SupabaseError extends Error {
    code;
    message;
    constructor(message, code) {
        super(message);
        this.name = 'SupabaseError';
        this.message = message;
        this.code = code;
    }
}
