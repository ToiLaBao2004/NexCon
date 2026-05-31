export function requireInternalJobSecret(req, res, next) {
    const configuredSecret = String(process.env.INTERNAL_JOB_SECRET || '').trim();
    if (!configuredSecret) {
        return res.status(503).json({ message: 'Internal job secret is not configured.' });
    }

    const receivedSecret = String(req.headers['x-internal-job-secret'] || '').trim();
    if (receivedSecret !== configuredSecret) {
        return res.status(401).json({ message: 'Invalid internal job secret.' });
    }

    return next();
}
