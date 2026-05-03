let originalTitle = "Next Connection";
let flashInterval: ReturnType<typeof setInterval> | null = null;
let isFlashing = false;
const ORIGINAL_FAVICON = "/logo.svg";

const getFaviconEl = (): HTMLLinkElement => {
    let el = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!el) {
        el = document.createElement("link");
        el.rel = "icon";
        document.head.appendChild(el);
    }
    return el;
};

const drawBadgeFavicon = (src: string): Promise<string> => {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d")!;

        const img = new Image();
        img.src = src;
        img.onload = () => {
            ctx.drawImage(img, 0, 0, 32, 32);

            // Chấm đỏ góc trên phải
            ctx.beginPath();
            ctx.arc(26, 6, 7, 0, 2 * Math.PI);
            ctx.fillStyle = "#ef4444";
            ctx.fill();

            // Viền trắng
            ctx.beginPath();
            ctx.arc(26, 6, 7, 0, 2 * Math.PI);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();

            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(src);
    });
};

const setFaviconBadge = async () => {
    const badgeUrl = await drawBadgeFavicon(ORIGINAL_FAVICON);
    getFaviconEl().href = badgeUrl;
};

const clearFaviconBadge = () => {
    getFaviconEl().href = ORIGINAL_FAVICON;
};

export const setOriginalTitle = (title: string) => {
    originalTitle = title;
};

export const flashTabTitle = async (message: string) => {
    if (isFlashing) return;
    isFlashing = true;

    await setFaviconBadge();

    let showMessage = true;
    flashInterval = setInterval(() => {
        document.title = showMessage ? message : originalTitle;
        showMessage = !showMessage;
    }, 1200);

    const stopOnFocus = () => {
        stopFlashTabTitle();
        window.removeEventListener("focus", stopOnFocus);
    };
    window.addEventListener("focus", stopOnFocus);
};

export const stopFlashTabTitle = () => {
    if (flashInterval) {
        clearInterval(flashInterval);
        flashInterval = null;
    }
    isFlashing = false;
    document.title = originalTitle;
    clearFaviconBadge();
};