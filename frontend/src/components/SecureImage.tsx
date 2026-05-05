import { useState, useEffect, useCallback, useRef } from 'react';
import { chatService } from '@/services/chatService';
import useMediaCacheStore from '@/stores/useMediaCacheStore';

interface SecureImageProps {
    messageId: string;
    alt?: string;
    className?: string;
    onLoadCallback?: () => void;
}

export default function SecureImage({ messageId, alt, className, onLoadCallback }: SecureImageProps) {
    const setUrl = useMediaCacheStore((state) => state.setUrl);
    const clearUrl = useMediaCacheStore((state) => state.clearUrl);
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const hasRetriedAfterLoadError = useRef(false);
    const isFetchingRef = useRef(false);
    const objectUrlRef = useRef<string | null>(null);

    const createObjectUrlFromUrl = useCallback(async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load media: ${response.status}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }, []);

    const applyObjectUrl = useCallback((objectUrl: string) => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = objectUrl;
        setSrc(objectUrl);
    }, []);

    const fetchUrl = useCallback(async () => {
        if (isFetchingRef.current) return;

        try {
            isFetchingRef.current = true;
            setIsLoading(true);
            const { url } = await chatService.getSignedMediaUrl(messageId);
            const objectUrl = await createObjectUrlFromUrl(url);
            applyObjectUrl(objectUrl);
            setUrl(messageId, url);
        } catch (error) {
            console.error('Failed to fetch media url for message:', messageId, error);
            clearUrl(messageId);
            setSrc(null);
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, [applyObjectUrl, clearUrl, createObjectUrlFromUrl, messageId, setUrl]);

    useEffect(() => {
        hasRetriedAfterLoadError.current = false;
        isFetchingRef.current = false;
    }, [messageId]);

    useEffect(() => {
        let isCancelled = false;

        const loadImage = async () => {
            if (isFetchingRef.current) return;

            try {
                isFetchingRef.current = true;
                setIsLoading(true);

                const cachedUrl = useMediaCacheStore.getState().getUrl(messageId);
                if (cachedUrl) {
                    try {
                        const objectUrl = await createObjectUrlFromUrl(cachedUrl);
                        if (isCancelled) {
                            URL.revokeObjectURL(objectUrl);
                            return;
                        }
                        applyObjectUrl(objectUrl);
                        setIsLoading(false);
                        return;
                    } catch {
                        clearUrl(messageId);
                    }
                }

                const { url } = await chatService.getSignedMediaUrl(messageId);
                const objectUrl = await createObjectUrlFromUrl(url);
                if (isCancelled) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                applyObjectUrl(objectUrl);
                setUrl(messageId, url);
            } catch (error) {
                if (!isCancelled) {
                    console.error('Failed to load media for message:', messageId, error);
                    clearUrl(messageId);
                    setSrc(null);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
                isFetchingRef.current = false;
            }
        };

        loadImage();
        return () => {
            isCancelled = true;
        };
    }, [applyObjectUrl, clearUrl, createObjectUrlFromUrl, messageId, setUrl]);

    useEffect(() => {
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [messageId]);

    if (isLoading) {
        return (
            <div
                className={`bg-muted animate-pulse ${className || ''}`}
                style={{ minHeight: '100px', minWidth: '100px' }}
            />
        );
    }

    if (!src) {
        return (
            <div
                className={`flex items-center justify-center bg-muted text-muted-foreground ${className || ''}`}
                style={{ minHeight: '100px', minWidth: '100px' }}
            >
                <span className="text-xs text-center px-2">Không thể tải ảnh</span>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt || "Media"}
            className={className}
            onLoad={() => {
                hasRetriedAfterLoadError.current = false;
                onLoadCallback?.();
            }}
            onError={() => {
                if (hasRetriedAfterLoadError.current) {
                    setSrc(null);
                    setIsLoading(false);
                    return;
                }

                hasRetriedAfterLoadError.current = true;
                fetchUrl();
            }}
            loading="lazy"
        />
    );
}
