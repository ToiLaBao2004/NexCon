let cachedToken = null;
let tokenExpiresAt = 0;

export async function getSpotifyToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.SPOTIFY_CLIENT_ID,
            client_secret: process.env.SPOTIFY_CLIENT_SECRET
        })
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error_description || "Failed to get Spotify token");
    }

    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    return cachedToken;
}

export async function searchSpotifyTracks(query) {
    const token = await getSpotifyToken();

    const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error?.message || "Failed to search Spotify tracks");
    }

    return data.tracks.items.map(track => ({
        trackId: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(", "),
        image: track.album.images[0]?.url || null,
        spotifyUrl: track.external_urls.spotify,
    }));
}