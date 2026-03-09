const audios: Record<string, HTMLAudioElement> = {};
const unlocked: Record<string, boolean> = {};

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
    const el = getAudio(path);

    if (unlocked[path]) return true;

    try {
        el.muted = true;
        el.currentTime = 0;
        await el.play();
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        unlocked[path] = true;
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
        await el.play();
        return true;
    } catch (err: any) {
        console.error(`[Sound] playSound failed for ${path}. Error ${err?.name}: ${err?.message}`);
        return false;
    }
}

export const unlockMessageSound = () => unlockSound("/sounds/message.mp3");
export const unlockNotificationSound = () => unlockSound("/sounds/notification.mp3");
export const unlockRingtone = () => unlockSound("/sounds/ringtone.mp3");

export const playMessageSound = () => playSound("/sounds/message.mp3");
export const playNotificationSound = () => playSound("/sounds/notification.mp3");

export const playRingtone = () => {
    const el = getAudio("/sounds/ringtone.mp3");
    el.loop = true;
    el.muted = false;
    el.volume = 1.0;
    return playSound("/sounds/ringtone.mp3");
};

export const stopRingtone = () => {
    console.log(`[Sound] Stopping ringtone`);
    const el = getAudio("/sounds/ringtone.mp3");
    el.pause();
    el.currentTime = 0;
};