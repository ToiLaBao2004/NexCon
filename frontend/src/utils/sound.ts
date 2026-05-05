const audios: Record<string, HTMLAudioElement> = {};
const unlocked: Record<string, boolean> = {};

const MESSAGE_PATH = "/sounds/message.mp3";
const NOTIFICATION_PATH = "/sounds/notification.mp3";
const RINGTONE_PATH = "/sounds/ringtone.mp3";
const CALLER_WAITING_RINGTONE_PATH = "/sounds/waiting_ringtone.mp3";
const CALLER_RINGING_RINGTONE_PATH = "/sounds/incoming_ringtone.mp3";
const RINGTONE_PATHS = [
    RINGTONE_PATH,
    CALLER_WAITING_RINGTONE_PATH,
    CALLER_RINGING_RINGTONE_PATH,
];

let activeRingtonePath: string | null = null;

function getAudio(path: string) {
    if (!audios[path]) {
        const el = new Audio(path);
        el.preload = "auto";
        el.load();
        audios[path] = el;
    }
    return audios[path];
}

async function unlockSound(path: string) {
    if (unlocked[path]) return true;

    const el = new Audio(path);
    el.preload = "auto";
    el.muted = true;

    try {
        await el.play();
        el.pause();
        el.currentTime = 0;
        unlocked[path] = true;
        getAudio(path).load();
        return true;
    } catch (err) {
        console.error(`[Sound] unlockSound failed for ${path}:`, err);
        return false;
    }
}

async function playSound(path: string) {
    const el = getAudio(path);

    if (!unlocked[path]) {
        console.warn(`[Sound] Not unlocked: ${path}. Autoplay might block this.`);
    }

    try {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        await el.play();
        return true;
    } catch (err: any) {
        console.error(`[Sound] playSound failed for ${path}. Error ${err?.name}: ${err?.message}`);
        return false;
    }
}

export const unlockMessageSound = () => unlockSound(MESSAGE_PATH);
export const unlockNotificationSound = () => unlockSound(NOTIFICATION_PATH);
export const unlockRingtone = async () => {
    const results = await Promise.all(RINGTONE_PATHS.map((path) => unlockSound(path)));
    return results.every(Boolean);
};

export const playMessageSound = () => playSound(MESSAGE_PATH);
export const playNotificationSound = () => playSound(NOTIFICATION_PATH);

function stopSound(path: string) {
    const el = getAudio(path);
    el.pause();
    el.currentTime = 0;
    if (activeRingtonePath === path) {
        activeRingtonePath = null;
    }
}

function playLoopingRingtone(path: string) {
    if (activeRingtonePath && activeRingtonePath !== path) {
        stopSound(activeRingtonePath);
    }

    const el = getAudio(path);
    el.loop = true;
    el.muted = false;
    el.volume = 1.0;

    activeRingtonePath = path;
    if (!el.paused) {
        return Promise.resolve(true);
    }

    return playSound(path);
}

export const playRingtone = () => playLoopingRingtone(RINGTONE_PATH);
export const playCallerWaitingRingtone = () => playLoopingRingtone(CALLER_WAITING_RINGTONE_PATH);
export const playCallerRingingRingtone = () => playLoopingRingtone(CALLER_RINGING_RINGTONE_PATH);

export const stopRingtone = () => {
    console.log("[Sound] Stopping ringtone");
    RINGTONE_PATHS.forEach((path) => stopSound(path));
};
