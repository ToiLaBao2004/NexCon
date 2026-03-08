const audios: Record<string, HTMLAudioElement> = {};
const unlocked: Record<string, boolean> = {};

function getAudio(path: string) {
    if (!audios[path]) {
        audios[path] = new Audio(path);
        audios[path].preload = "auto";
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
        console.warn(`unlockSound failed for ${path}:`, err);
        return false;
    }
}

async function playSound(path: string) {
    const el = getAudio(path);

    if (!unlocked[path]) {
        console.warn(`Sound not unlocked: ${path}`);
        return false;
    }

    try {
        el.pause();
        el.currentTime = 0;
        await el.play();
        return true;
    } catch (err) {
        console.warn(`playSound failed for ${path}:`, err);
        return false;
    }
}

export const unlockMessageSound = () => unlockSound("/sounds/message.mp3");
export const unlockNotificationSound = () => unlockSound("/sounds/notification.mp3");

export const playMessageSound = () => playSound("/sounds/message.mp3");
export const playNotificationSound = () => playSound("/sounds/notification.mp3");