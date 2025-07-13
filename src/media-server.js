const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config/default');

class MediaServer {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // CORS for cross-origin requests
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
            res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
            
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - Media: ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', service: 'media-server' });
        });

        // Serve movie files with byte-range support
        this.app.get('/:movieDir/movie.mp4', this.serveVideo.bind(this));
        
        // Serve poster images
        this.app.get('/:movieDir/poster.jpg', this.servePoster.bind(this));
        
        // Serve HLS playlist files
        this.app.get('/:movieDir/hls/playlist.m3u8', this.servePlaylist.bind(this));
        
        // Serve HLS segment files
        this.app.get('/:movieDir/hls/:segment', this.serveSegment.bind(this));

        // Generic static file serving for other assets
        this.app.use(express.static(config.storage.mediaPath, {
            setHeaders: (res, filePath, stat) => {
                // Enable byte-range requests for all files
                res.set('Accept-Ranges', 'bytes');
            }
        }));

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'File not found' });
        });
    }

    async serveVideo(req, res) {
        try {
            const { movieDir } = req.params;
            const videoPath = path.join(config.storage.mediaPath, movieDir, 'movie.mp4');

            // Check if file exists
            if (!fs.existsSync(videoPath)) {
                return res.status(404).json({ error: 'Video file not found' });
            }

            const stat = fs.statSync(videoPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                // Handle byte-range requests for seeking
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                if (start >= fileSize || end >= fileSize) {
                    return res.status(416).json({ error: 'Range not satisfiable' });
                }

                const file = fs.createReadStream(videoPath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                    'Cache-Control': 'public, max-age=3600'
                };

                res.writeHead(206, head);
                file.pipe(res);

            } else {
                // Serve full file
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600'
                };

                res.writeHead(200, head);
                fs.createReadStream(videoPath).pipe(res);
            }

        } catch (error) {
            console.error('Error serving video:', error);
            res.status(500).json({ error: 'Failed to serve video' });
        }
    }

    async servePoster(req, res) {
        try {
            const { movieDir } = req.params;
            const posterPath = path.join(config.storage.mediaPath, movieDir, 'poster.jpg');

            if (!fs.existsSync(posterPath)) {
                return res.status(404).json({ error: 'Poster not found' });
            }

            res.set({
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
            });

            fs.createReadStream(posterPath).pipe(res);

        } catch (error) {
            console.error('Error serving poster:', error);
            res.status(500).json({ error: 'Failed to serve poster' });
        }
    }

    async servePlaylist(req, res) {
        try {
            const { movieDir } = req.params;
            const playlistPath = path.join(config.storage.mediaPath, movieDir, 'hls', 'playlist.m3u8');

            if (!fs.existsSync(playlistPath)) {
                return res.status(404).json({ error: 'Playlist not found' });
            }

            res.set({
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
            });

            fs.createReadStream(playlistPath).pipe(res);

        } catch (error) {
            console.error('Error serving playlist:', error);
            res.status(500).json({ error: 'Failed to serve playlist' });
        }
    }

    async serveSegment(req, res) {
        try {
            const { movieDir, segment } = req.params;
            
            // Validate segment filename (should be .ts files)
            if (!segment.endsWith('.ts')) {
                return res.status(400).json({ error: 'Invalid segment file' });
            }

            const segmentPath = path.join(config.storage.mediaPath, movieDir, 'hls', segment);

            if (!fs.existsSync(segmentPath)) {
                return res.status(404).json({ error: 'Segment not found' });
            }

            const stat = fs.statSync(segmentPath);
            const range = req.headers.range;

            if (range) {
                // Handle byte-range requests for HLS segments
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunksize = (end - start) + 1;

                if (start >= stat.size || end >= stat.size) {
                    return res.status(416).json({ error: 'Range not satisfiable' });
                }

                const file = fs.createReadStream(segmentPath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp2t',
                    'Cache-Control': 'public, max-age=86400' // Cache segments for 24 hours
                };

                res.writeHead(206, head);
                file.pipe(res);

            } else {
                // Serve full segment
                res.set({
                    'Content-Type': 'video/mp2t',
                    'Content-Length': stat.size,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=86400'
                });

                fs.createReadStream(segmentPath).pipe(res);
            }

        } catch (error) {
            console.error('Error serving segment:', error);
            res.status(500).json({ error: 'Failed to serve segment' });
        }
    }

    start() {
        try {
            // Ensure media directory exists
            if (!fs.existsSync(config.storage.mediaPath)) {
                console.error(`Media directory does not exist: ${config.storage.mediaPath}`);
                process.exit(1);
            }

            this.server = this.app.listen(config.media.port, config.media.host, () => {
                console.log(`Media server running on http://${config.media.host}:${config.media.port}`);
                console.log(`Serving files from: ${config.storage.mediaPath}`);
            });

            // Graceful shutdown
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));

        } catch (error) {
            console.error('Failed to start media server:', error);
            process.exit(1);
        }
    }

    shutdown() {
        console.log('Shutting down media server...');
        
        if (this.server) {
            this.server.close(() => {
                console.log('Media server stopped');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new MediaServer();
    server.start();
}

module.exports = MediaServer;