import ytdl from 'ytdl-core';
import { search } from 'youtube-sr';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url, quality = 'highestaudio' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let finalUrl = url;

    try {
        // If Spotify link: get song name, find it on YouTube (100% free, no API key)
        if (url.includes('spotify.com') || url.includes('open.spotify.com')) {
            const trackId = url.match(/track\/([a-zA-Z0-9]+)/);
            if (!trackId) {
                return res.status(400).json({ error: 'Invalid Spotify URL. Use a direct track link.' });
            }

            const spotifyRes = await fetch(`https://open.spotify.com/embed/track/${trackId[1]}`);
            const html = await spotifyRes.text();
            
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            if (!titleMatch) {
                return res.status(400).json({ error: 'Could not read Spotify track. Ensure the link is public.' });
            }
            
            let cleanTitle = titleMatch[1].split(' - song and lyrics by ')[0] || titleMatch[1].split(' | Spotify')[0];
            
            const results = await search(cleanTitle, { limit: 1 });
            if (!results || results.length === 0) {
                return res.status(404).json({ error: `Could not find "${cleanTitle}" on YouTube.` });
            }
            
            finalUrl = results[0].url;
        }

        if (!ytdl.validateURL(finalUrl)) {
            return res.status(400).json({ error: 'Invalid or unsupported URL.' });
        }

        const info = await ytdl.getInfo(finalUrl);
        const safeName = info.videoDetails.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');

        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.mp3"`);
        res.setHeader('Content-Type', 'audio/mpeg');

        const stream = ytdl(finalUrl, {
            quality: quality,
            filter: 'audioonly',
            highWaterMark: 1 << 25
        });

        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream audio.' });
            }
        });

    } catch (error) {
        console.error('Server Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
        }
    }
}