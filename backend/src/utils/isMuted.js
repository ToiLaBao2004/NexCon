// type: "messages" | "meetings"
export function isMuted(muteObj, type) {
    const until = muteObj?.[type];
    if (!until) return false;
    return new Date(until) > new Date();
}
