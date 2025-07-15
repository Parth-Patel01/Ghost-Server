const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');

const config = require('../config/default');
const Database = require('./db/database');

class MediaOnlyServer {
    constructor() {
        this.app = express();
        this.db = new Database(config.storage.dbPath);
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false // Allow inline scripts for development
        }));
        this.app.use(compression());
        this.app.use(cors(config.security.cors));

        // Rate limiting
        const generalLimiter = rateLimit(config.security.rateLimit.general);
        this.app.use('/api/', generalLimiter);

        // Body parsing
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Serve static frontend files
        this.app.use(express.static(path.join(__dirname, '../frontend/dist')));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - Media Only: ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // API Routes
        this.app.get('/api/movies', this.getMovies.bind(this));
        this.app.get('/api/movies/search', this.searchMovies.bind(this));
        this.app.get('/api/movies/:id', this.getMovie.bind(this));
        this.app.get('/api/status', this.getServerStatus.bind(this));
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'healthy', service: 'media-only-server' });
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

        // Serve frontend for all other routes
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
        });

        // Error handling
        this.app.use(this.errorHandler.bind(this));
    }

    async getMovies(req, res) {
        try {
            const { status } = req.query;
            const movies = await this.db.getAllMovies(status);

            // Add streaming URLs
            const moviesWithUrls = movies.map(movie => ({
                ...movie,
                posterUrl: movie.poster_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/poster.jpg` : null,
                streamUrl: movie.hls_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/hls/playlist.m3u8` : null,
                downloadUrl: `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/movie.mp4`
            }));

            res.json(moviesWithUrls);
        } catch (error) {
            console.error('Error getting movies:', error);
            res.status(500).json({ error: 'Failed to retrieve movies' });
        }
    }

    async searchMovies(req, res) {
        try {
            const { q, status } = req.query;

            if (!q || q.trim().length === 0) {
                return res.json([]);
            }

            const movies = await this.db.searchMovies(q.trim(), status);

            // Add streaming URLs
            const moviesWithUrls = movies.map(movie => ({
                ...movie,
                posterUrl: movie.poster_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/poster.jpg` : null,
                streamUrl: movie.hls_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/hls/playlist.m3u8` : null,
                downloadUrl: `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/movie.mp4`
            }));

            res.json(moviesWithUrls);
        } catch (error) {
            console.error('Error searching movies:', error);
            res.status(500).json({ error: 'Failed to search movies' });
        }
    }

    async getMovie(req, res) {
        try {
            const { id } = req.params;
            const movie = await this.db.getMovie(id);

            if (!movie) {
                return res.status(404).json({ error: 'Movie not found' });
            }

            // Add streaming URLs
            const movieWithUrls = {
                ...movie,
                posterUrl: movie.poster_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/poster.jpg` : null,
                streamUrl: movie.hls_path ? `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/hls/playlist.m3u8` : null,
                downloadUrl: `http://${config.media.host}:${config.media.port}/${path.basename(movie.path)}/movie.mp4`
            };

            res.json(movieWithUrls);
        } catch (error) {
            console.error('Error getting movie:', error);
            res.status(500).json({ error: 'Failed to retrieve movie' });
        }
    }

    async getServerStatus(req, res) {
        try {
            const movies = await this.db.getAllMovies();
            const readyCount = movies.filter(m => m.status === 'ready').length;

            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                movies: {
                    total: movies.length,
                    ready: readyCount
                }
            });
        } catch (error) {
            console.error('Error getting server status:', error);
            res.status(500).json({ error: 'Failed to get server status' });
        }
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

    errorHandler(err, req, res, next) {
        console.error('Express error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }

    async start() {
        try {
            // Initialize database
            await this.db.initialize();

            // Ensure directories exist
            await fs.mkdir(config.storage.mediaPath, { recursive: true });

            // Start server
            this.server = this.app.listen(config.media.port, config.media.host, () => {
                console.log(`Media-only server running on http://${config.media.host}:${config.media.port}`);
                console.log(`Serving files from: ${config.storage.mediaPath}`);
            });

            // Cleanup on exit
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));

        } catch (error) {
            console.error('Failed to start media-only server:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('Shutting down media-only server...');

        if (this.server) {
            this.server.close();
        }

        await this.db.close();
        process.exit(0);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new MediaOnlyServer();
    server.start();
}

module.exports = MediaOnlyServer; 