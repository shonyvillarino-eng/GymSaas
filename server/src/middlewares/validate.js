/**
 * Validates `req.body` against a Zod schema.
 * On failure it throws a 400 that the central error handler formats.
 */
export function validateBody(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const err = Object.assign(new Error('Validation failed'), {
                status: 400,
                details: result.error.flatten().fieldErrors,
            });
            next(err);
            return;
        }
        req.body = result.data;
        next();
    };
}
