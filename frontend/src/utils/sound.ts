const audios: Record<string, HTMLAudioElement> = {};
const unlocked: Record<string, boolean> = {};

const MESSAGE_PATH = "/sounds/message.mp3";
const NOTIFICATION_PATH = "/sounds/notification.mp3";
const RINGTONE_PATH = "/sounds/ringtone.mp3";

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
export const unlockRingtone = () => unlockSound(RINGTONE_PATH);

export const playMessageSound = () => playSound(MESSAGE_PATH);
export const playNotificationSound = () => playSound(NOTIFICATION_PATH);

export const playRingtone = () => {
    const el = getAudio(RINGTONE_PATH);
    el.loop = true;
    el.muted = false;
    el.volume = 1.0;
    return playSound(RINGTONE_PATH);
};

export const stopRingtone = () => {
    console.log("[Sound] Stopping ringtone");
    const el = getAudio(RINGTONE_PATH);
    el.pause();
    el.currentTime = 0;
};
