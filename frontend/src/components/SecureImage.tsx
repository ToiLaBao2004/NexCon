import { useState, useEffect, useCallback } from 'react';
import { chatService } from '@/services/chatService';
import useMediaCacheStore from '@/stores/useMediaCacheStore';

interface SecureImageProps {
    messageId: string;
    alt?: string;
    className?: string;
}

export default function SecureImage({ messageId, alt, className }: SecureImageProps) {
    const { cache, setUrl } = useMediaCacheStore();
    const [src, setSrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const fetchUrl = useCallback(async () => {
        try {
            setIsLoading(true);
            const { url } = await chatService.getSignedMediaUrl(messageId);
            setUrl(messageId, url);
            setSrc(url);
        } catch (error) {
            console.error('Failed to fetch media url for message:', messageId, error);
            setSrc(null);
        } finally {
            setIsLoading(false);
        }
    }, [messageId, setUrl]);

    const cachedUrl = cache[messageId];

    useEffect(() => {
        if (cachedUrl) {
            setSrc(cachedUrl);
            setIsLoading(false);
        } else {
            fetchUrl();
        }
    }, [messageId, cachedUrl, fetchUrl]);

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
            onError={() => {
                setSrc(null);
                setIsLoading(false);
            }}
            loading="lazy"
        />
    );
}
