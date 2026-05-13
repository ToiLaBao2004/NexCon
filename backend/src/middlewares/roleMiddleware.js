export function requireAdmin(req, res, next) {
    if ((req.user?.role || 'user') !== 'admin') {
        return res.status(403).json({ message: 'Admin access is required.' });
    }

    return next();
}

export function requireUser(req, res, next) {
    if ((req.user?.role || 'user') !== 'user') {
        return res.status(403).json({ message: 'User access is required.' });
    }

    return next();
}
