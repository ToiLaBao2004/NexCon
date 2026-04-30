import { useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/stores/useUserStore';
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function EditMusicProfile() {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const {
        user,
        musicResults = [],
        musicLoading,
        fetchMe,
        searchMusic,
        updateMusic,
        removeMusic,
    } = useUserStore();

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce thủ công
    const debouncedSearch = useCallback((value: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(async () => {
            if (value.trim().length < 2) return;

            setIsSearching(true);
            try {
                await searchMusic(value.trim());
            } catch (error: any) {
                console.error("Search music error:", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);
    }, [searchMusic]);

    useEffect(() => {
        fetchMe();
    }, [fetchMe]);

    // Cleanup timeout khi component unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        debouncedSearch(value);
    };

    const handleSelectMusic = async (track: any) => {
        try {
            await updateMusic(track);
            await fetchMe(); // fetch lại profile
            setQuery('');
            toast.success("Đã cập nhật nhạc trên profile!");
        } catch (error: any) {
            console.error("Failed to update music:", error);
            toast.error("Cập nhật nhạc thất bại");
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder="Tìm bài hát, nghệ sĩ trên Spotify..."
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm 
                             focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                />
            </div>

            {/* Loading state */}
            {(musicLoading || isSearching) && query.trim().length >= 2 && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2 pl-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tìm kiếm...
                </div>
            )}

            {/* Search Results */}
            {musicResults.length > 0 && query.trim().length >= 2 && (
                <div className="max-h-50 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm divide-y">
                    {musicResults.map((track: any) => (
                        <button
                            key={track.trackId}
                            onClick={() => handleSelectMusic(track)}
                            className="w-full flex items-center gap-4 p-3.5 hover:bg-gray-50 active:bg-gray-100 text-left transition-colors group"
                        >
                            <div className="flex-shrink-0">
                                {track.image ? (
                                    <img
                                        src={track.image}
                                        alt={track.name}
                                        className="w-14 h-14 rounded-xl object-cover shadow-sm"
                                    />
                                ) : (
                                    <div className="w-14 h-14 bg-gray-200 rounded-xl" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate group-hover:text-primary">
                                    {track.name}
                                </p>
                                <p className="text-sm text-gray-500 truncate">
                                    {track.artist}
                                </p>
                            </div>

                            <span className="text-xs font-medium text-green-600 px-3 py-1 bg-green-50 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                                Chọn
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* No results */}
            {query.trim().length >= 2 && !musicLoading && !isSearching && musicResults.length === 0 && (
                <div className="text-sm text-gray-500 py-4 text-center">
                    Không tìm thấy bài hát nào với từ khóa "{query}"
                </div>
            )}

            {/* Current attached music */}
            {user?.music && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">Đang gắn trên profile</p>

                    <div className="flex gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="mt-3">
                                <iframe
                                    src={`https://open.spotify.com/embed/track/${user.music.trackId}?utm_source=generator&theme=0`}
                                    width="100%"
                                    height="80"
                                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                    loading="lazy"
                                    className="rounded-xl"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            try {
                                await removeMusic();
                                await fetchMe(); // fetch lại profile
                                toast.success("Đã gỡ bài nhạc khỏi profile!");
                            } catch (error: any) {
                                toast.error("Gỡ nhạc thất bại");
                            }
                        }}
                        className="mt-4 text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                    >
                        × Gỡ bài nhạc này
                    </button>
                </div>
            )}
        </div>
    );
}