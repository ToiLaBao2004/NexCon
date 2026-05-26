const SLOW_API_LOG_MS = Number(process.env.SLOW_API_LOG_MS || 1000);

export function slowRequestLogger(req, res, next) {
    if (!SLOW_API_LOG_MS || SLOW_API_LOG_MS < 1) {
        return next();
    }

    const startedAt = Date.now();

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        if (durationMs < SLOW_API_LOG_MS) return;

        console.warn(`[SLOW API] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durationMs}ms`);
    });

    return next();
}
