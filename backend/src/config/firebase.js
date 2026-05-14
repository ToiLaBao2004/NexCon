import admin from 'firebase-admin';

let fcm = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount && serviceAccount.project_id) {
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
            }
            fcm = admin.messaging();
        } else {
            console.warn('WARNING: FIREBASE_SERVICE_ACCOUNT is invalid (missing project_id). Push disabled.');
        }
    } catch (error) {
        console.error('ERROR: Failed to parse FIREBASE_SERVICE_ACCOUNT:', error.message);
    }
} else {
    console.warn('WARNING: FIREBASE_SERVICE_ACCOUNT is not defined in .env. Push disabled.');
}

export { fcm };