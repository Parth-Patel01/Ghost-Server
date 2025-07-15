const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const compression = require('compression');

class MediaOnlyServer {
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // CORS for cross-origin requests
        this.app.use(cors({
            origin: true,
            credentials: true
        }));

        // Compression for better performance
        this.app.use(compression());

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - Media: ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', service: 'media-only-server' });
        });

        // API Routes for movie information
        this.app.get('/api/movies', this.getMovies.bind(this));
        this.app.get('/api/movies/:id', this.getMovie.bind(this));
        this.app.get('/api/movies/search', this.searchMovies.bind(this));

        // Serve movie files with byte-range support
        this.app.get('/:movieDir/movie.mp4', this.serveVideo.bind(this));
        
        // Serve poster images
        this.app.get('/:movieDir/poster.jpg', this.servePoster.bind(this));
        
        // Serve HLS playlist files
        this.app.get('/:movieDir/hls/playlist.m3u8', this.servePlaylist.bind(this));
        
        // Serve HLS segment files
        this.app.get('/:movieDir/hls/:segment', this.serveSegment.bind(this));

        // Generic static file serving for other assets
        this.app.use(express.static('/media/movies', {
            setHeaders: (res, filePath, stat) => {
                // Enable byte-range requests for all files
                res.set('Accept-Ranges', 'bytes');
                res.set('Cache-Control', 'public, max-age=3600');
            }
        }));

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'File not found' });
        });
    }

    async getMovies(req, res) {
        try {
            const moviesDir = '/media/movies';
            const movies = [];

            if (fs.existsSync(moviesDir)) {
                const movieFolders = fs.readdirSync(moviesDir, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                for (const folder of movieFolders) {
                    const moviePath = path.join(moviesDir, folder);
                    const movieFile = path.join(moviePath, 'movie.mp4');
                    const posterFile = path.join(moviePath, 'poster.jpg');

                    if (fs.existsSync(movieFile)) {
                        const stat = fs.statSync(movieFile);
                        const movieInfo = this.parseMovieInfo(folder);
                        
                        movies.push({
                            id: folder,
                            title: movieInfo.title,
                            year: movieInfo.year,
                            filename: 'movie.mp4',
                            path: moviePath,
                            file_size: stat.size,
                            poster_path: fs.existsSync(posterFile) ? posterFile : null,
                            hls_path: fs.existsSync(path.join(moviePath, 'hls', 'playlist.m3u8')) ? path.join(moviePath, 'hls') : null,
                            status: 'ready',
                            uploaded_at: stat.mtime.toISOString(),
                            posterUrl: fs.existsSync(posterFile) ? `http://localhost:8080/${folder}/poster.jpg` : null,
                            streamUrl: fs.existsSync(path.join(moviePath, 'hls', 'playlist.m3u8')) ? `http://localhost:8080/${folder}/hls/playlist.m3u8` : null,
                            downloadUrl: `http://localhost:8080/${folder}/movie.mp4`
                        });
                    }
                }
            }

            // Sort by upload date (newest first)
            movies.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
            res.json(movies);
        } catch (error) {
            console.error('Error getting movies:', error);
            res.status(500).json({ error: 'Failed to retrieve movies' });
        }
    }

    async getMovie(req, res) {
        try {
            const { id } = req.params;
            const moviePath = path.join('/media/movies', id);
            const movieFile = path.join(moviePath, 'movie.mp4');

            if (!fs.existsSync(movieFile)) {
                return res.status(404).json({ error: 'Movie not found' });
            }

            const stat = fs.statSync(movieFile);
            const posterFile = path.join(moviePath, 'poster.jpg');
            const movieInfo = this.parseMovieInfo(id);

            const movie = {
                id,
                title: movieInfo.title,
                year: movieInfo.year,
                filename: 'movie.mp4',
                path: moviePath,
                file_size: stat.size,
                poster_path: fs.existsSync(posterFile) ? posterFile : null,
                hls_path: fs.existsSync(path.join(moviePath, 'hls', 'playlist.m3u8')) ? path.join(moviePath, 'hls') : null,
                status: 'ready',
                uploaded_at: stat.mtime.toISOString(),
                posterUrl: fs.existsSync(posterFile) ? `http://localhost:8080/${id}/poster.jpg` : null,
                streamUrl: fs.existsSync(path.join(moviePath, 'hls', 'playlist.m3u8')) ? `http://localhost:8080/${id}/hls/playlist.m3u8` : null,
                downloadUrl: `http://localhost:8080/${id}/movie.mp4`
            };

            res.json(movie);
        } catch (error) {
            console.error('Error getting movie:', error);
            res.status(500).json({ error: 'Failed to retrieve movie' });
        }
    }

    async searchMovies(req, res) {
        try {
            const { q } = req.query;
            
            if (!q || q.trim().length === 0) {
                return res.json([]);
            }

            const movies = await this.getMovies(req, res);
            const searchResults = movies.filter(movie => 
                movie.title.toLowerCase().includes(q.toLowerCase()) ||
                movie.filename.toLowerCase().includes(q.toLowerCase())
            );

            res.json(searchResults);
        } catch (error) {
            console.error('Error searching movies:', error);
            res.status(500).json({ error: 'Failed to search movies' });
        }
    }

    parseMovieInfo(folderName) {
        // Parse movie title and year from folder name
        const patterns = [
            /^(.+?)[\.\s]+\(?(\d{4})\)?/,
            /^(.+?)\s*\((\d{4})\)/,
            /^(.+?)\s+(\d{4})/,
            /^(.+?)(?:\s*\d{4})?$/
        ];

        let title = folderName;
        let year = null;

        for (const pattern of patterns) {
            const match = folderName.match(pattern);
            if (match) {
                title = match[1];
                year = match[2] ? parseInt(match[2]) : null;
                break;
            }
        }

        // Clean up title
        title = title
            .replace(/[\.\-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Capitalize first letter of each word
        title = title.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );

        return { title, year };
    }

    async serveVideo(req, res) {
        try {
            const { movieDir } = req.params;
            const videoPath = path.join('/media/movies', movieDir, 'movie.mp4');

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
            const posterPath = path.join('/media/movies', movieDir, 'poster.jpg');

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
            const playlistPath = path.join('/media/movies', movieDir, 'hls', 'playlist.m3u8');

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

            const segmentPath = path.join('/media/movies', movieDir, 'hls', segment);

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
                    'Cache-Control': 'public, max-age=3600'
                };

                res.writeHead(206, head);
                file.pipe(res);

            } else {
                // Serve full segment
                const head = {
                    'Content-Length': stat.size,
                    'Content-Type': 'video/mp2t',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600'
                };

                res.writeHead(200, head);
                fs.createReadStream(segmentPath).pipe(res);
            }

        } catch (error) {
            console.error('Error serving segment:', error);
            res.status(500).json({ error: 'Failed to serve segment' });
        }
    }

    start() {
        const port = process.env.MEDIA_PORT || 8080;
        const host = process.env.MEDIA_HOST || '0.0.0.0';

        this.server = this.app.listen(port, host, () => {
            console.log(`Media-only server running on http://${host}:${port}`);
            console.log('This server only serves movies - no upload functionality');
        });

        // Cleanup on exit
        process.on('SIGTERM', this.shutdown.bind(this));
        process.on('SIGINT', this.shutdown.bind(this));
    }

    shutdown() {
        console.log('Shutting down media-only server...');
        if (this.server) {
            this.server.close();
        }
        process.exit(0);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new MediaOnlyServer();
    server.start();
}

module.exports = MediaOnlyServer; 