const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = require('../config/default');
const Database = require('./db/database');
const { parseMovieInfo, generateMovieDir, isValidVideoFile, formatFileSize } = require('./utils/movieParser');
const mediaQueue = require('./worker/mediaQueue');

class UploadServer {
    constructor() {
        this.app = express();
        this.db = new Database(config.storage.dbPath);
        this.uploadSessions = new Map(); // In-memory session storage
        this.setupMiddleware();
        this.setupRoutes();
        this.startSessionCleanup();
    }

    startSessionCleanup() {
        // Clean up expired upload sessions every 5 minutes
        setInterval(() => {
            const now = new Date();
            for (const [sessionId, session] of this.uploadSessions.entries()) {
                if (now > session.expiresAt) {
                    console.log(`Cleaning up expired session: ${sessionId}`);
                    this.uploadSessions.delete(sessionId);
                    // Clean up temp files
                    fs.rmdir(session.tempDir, { recursive: true }).catch(err => {
                        console.error('Error cleaning up temp dir:', err);
                    });
                }
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: false // Allow inline scripts for development
        }));
        this.app.use(compression());
        this.app.use(cors(config.security.cors));

        // Rate limiting - different limits for different endpoints
        const generalLimiter = rateLimit(config.security.rateLimit.general);
        const uploadLimiter = rateLimit(config.security.rateLimit.upload);
        
        // Apply general rate limiting to all API endpoints except uploads
        this.app.use('/api/', (req, res, next) => {
            if (req.path.startsWith('/upload/')) {
                return uploadLimiter(req, res, next);
            }
            return generalLimiter(req, res, next);
        });

        // Body parsing
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Serve static frontend files
        this.app.use(express.static(path.join(__dirname, '../frontend/dist')));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Setup multer for chunk uploads
        const upload = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: config.upload.chunkSize * 2 // Allow some overhead
            }
        });

        // API Routes
        this.app.post('/api/upload/start', this.startUpload.bind(this));
        this.app.post('/api/upload/chunk', upload.single('chunk'), this.uploadChunk.bind(this));
        this.app.post('/api/upload/complete', this.completeUpload.bind(this));
        this.app.post('/api/upload/cancel', this.cancelUpload.bind(this));
        this.app.get('/api/movies', this.getMovies.bind(this));
        this.app.get('/api/movies/:id', this.getMovie.bind(this));
        this.app.delete('/api/movies/:id', this.deleteMovie.bind(this));
        this.app.get('/api/status', this.getServerStatus.bind(this));
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'healthy', service: 'upload-server' });
        });

        // Serve frontend for all other routes
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
        });

        // Error handling
        this.app.use(this.errorHandler.bind(this));
    }

    async startUpload(req, res) {
        try {
            const { filename, fileSize, chunkSize = config.upload.chunkSize } = req.body;

            if (!filename || !fileSize) {
                return res.status(400).json({ error: 'Filename and file size are required' });
            }

            // Validate file type
            if (!isValidVideoFile(filename, config.upload.allowedExtensions)) {
                return res.status(400).json({ 
                    error: 'Invalid file type. Allowed extensions: ' + config.upload.allowedExtensions.join(', ')
                });
            }

            // Check file size limit
            if (fileSize > config.upload.maxFileSize) {
                return res.status(400).json({ 
                    error: `File too large. Maximum size: ${formatFileSize(config.upload.maxFileSize)}`
                });
            }

            // Parse movie information
            const movieInfo = parseMovieInfo(filename);
            const sessionId = uuidv4();
            const expiresAt = new Date(Date.now() + config.upload.sessionTimeout);

            // Create upload session
            const session = {
                id: sessionId,
                filename,
                fileSize,
                chunkSize,
                uploadedChunks: [],
                uploadedSize: 0,
                movieInfo,
                expiresAt,
                tempDir: path.join(config.storage.tempPath, sessionId)
            };

            // Ensure temp directory exists
            await fs.mkdir(session.tempDir, { recursive: true });

            // Store session
            this.uploadSessions.set(sessionId, session);

            // Save to database
            await this.db.createUploadSession({
                id: sessionId,
                filename,
                total_size: fileSize,
                chunk_size: chunkSize,
                expires_at: expiresAt.toISOString()
            });

            console.log(`Upload session started: ${sessionId} for ${filename} (${formatFileSize(fileSize)})`);

            res.json({
                sessionId,
                chunkSize,
                totalChunks: Math.ceil(fileSize / chunkSize),
                movieInfo
            });

        } catch (error) {
            console.error('Error starting upload:', error);
            res.status(500).json({ error: 'Failed to start upload session' });
        }
    }

    async uploadChunk(req, res) {
        try {
            const { sessionId, chunkIndex } = req.body;
            const chunk = req.file;

            if (!sessionId || chunkIndex === undefined || !chunk) {
                return res.status(400).json({ error: 'Session ID, chunk index, and chunk data are required' });
            }

            const session = this.uploadSessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Upload session not found' });
            }

            // Check if session has expired
            if (new Date() > session.expiresAt) {
                this.uploadSessions.delete(sessionId);
                return res.status(410).json({ error: 'Upload session expired' });
            }

            // Save chunk to temp directory
            const chunkPath = path.join(session.tempDir, `chunk_${chunkIndex}`);
            await fs.writeFile(chunkPath, chunk.buffer);

            // Update session
            session.uploadedChunks.push(parseInt(chunkIndex));
            session.uploadedSize += chunk.size;

            // Update database
            await this.db.updateUploadSession(sessionId, {
                uploaded_size: session.uploadedSize
            });

            console.log(`Chunk ${chunkIndex} uploaded for session ${sessionId} (${formatFileSize(session.uploadedSize)}/${formatFileSize(session.fileSize)})`);

            res.json({
                chunkIndex: parseInt(chunkIndex),
                uploadedSize: session.uploadedSize,
                totalSize: session.fileSize,
                progress: (session.uploadedSize / session.fileSize) * 100
            });

        } catch (error) {
            console.error('Error uploading chunk:', error);
            res.status(500).json({ error: 'Failed to upload chunk' });
        }
    }

    async completeUpload(req, res) {
        try {
            const { sessionId } = req.body;

            const session = this.uploadSessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Upload session not found' });
            }

            // Verify all chunks are uploaded
            const totalChunks = Math.ceil(session.fileSize / session.chunkSize);
            if (session.uploadedChunks.length !== totalChunks) {
                return res.status(400).json({ error: 'Missing chunks. Upload incomplete.' });
            }

            // Sort chunks by index
            session.uploadedChunks.sort((a, b) => a - b);

            // Create movie directory
            const movieDir = generateMovieDir(session.movieInfo.title, session.movieInfo.year);
            const moviePath = path.join(config.storage.mediaPath, movieDir);
            await fs.mkdir(moviePath, { recursive: true });

            // Combine chunks into final file
            const finalPath = path.join(moviePath, 'movie.mp4');
            const writeStream = await fs.open(finalPath, 'w');

            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(session.tempDir, `chunk_${i}`);
                const chunkData = await fs.readFile(chunkPath);
                await writeStream.write(chunkData);
            }

            await writeStream.close();

            // Create movie record in database
            const movieId = await this.db.createMovie({
                title: session.movieInfo.title,
                year: session.movieInfo.year,
                filename: session.filename,
                path: moviePath,
                file_size: session.fileSize
            });

            // Add processing job to queue
            await mediaQueue.add('process-movie', {
                movieId,
                moviePath,
                finalPath
            }, {
                attempts: 3,
                backoff: 'exponential'
            });

            // Update movie status
            await this.db.updateMovie(movieId, { status: 'processing' });

            // Clean up temp files
            await fs.rm(session.tempDir, { recursive: true, force: true });
            this.uploadSessions.delete(sessionId);

            // Update upload session status
            await this.db.updateUploadSession(sessionId, {
                status: 'completed',
                movie_id: movieId
            });

            console.log(`Upload completed: ${session.filename} -> Movie ID: ${movieId}`);

            res.json({
                movieId,
                title: session.movieInfo.title,
                year: session.movieInfo.year,
                status: 'processing',
                message: 'Upload completed successfully. Processing started.'
            });

        } catch (error) {
            console.error('Error completing upload:', error);
            res.status(500).json({ error: 'Failed to complete upload' });
        }
    }

    async cancelUpload(req, res) {
        try {
            const { sessionId } = req.body;

            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID is required' });
            }

            const session = this.uploadSessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Upload session not found' });
            }

            // Clean up session
            this.uploadSessions.delete(sessionId);

            // Clean up temp files
            try {
                await fs.rmdir(session.tempDir, { recursive: true });
            } catch (err) {
                console.error('Error cleaning up temp dir during cancel:', err);
            }

            // Remove from database
            await this.db.deleteUploadSession(sessionId);

            console.log(`Upload session cancelled: ${sessionId}`);
            res.json({ message: 'Upload cancelled successfully' });

        } catch (error) {
            console.error('Error cancelling upload:', error);
            res.status(500).json({ error: 'Failed to cancel upload' });
        }
    }

    async getMovies(req, res) {
        try {
            const { status } = req.query;
            const movies = await this.db.getAllMovies(status);
            
            // Add streaming URLs
            const moviesWithUrls = movies.map(movie => ({
                ...movie,
                posterUrl: movie.poster_path ? `${config.network.streamingUrl}/${path.basename(movie.path)}/poster.jpg` : null,
                streamUrl: movie.hls_path ? `${config.network.streamingUrl}/${path.basename(movie.path)}/hls/playlist.m3u8` : null,
                downloadUrl: `${config.network.streamingUrl}/${path.basename(movie.path)}/movie.mp4`
            }));

            res.json(moviesWithUrls);
        } catch (error) {
            console.error('Error getting movies:', error);
            res.status(500).json({ error: 'Failed to retrieve movies' });
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
                posterUrl: movie.poster_path ? `${config.network.streamingUrl}/${path.basename(movie.path)}/poster.jpg` : null,
                streamUrl: movie.hls_path ? `${config.network.streamingUrl}/${path.basename(movie.path)}/hls/playlist.m3u8` : null,
                downloadUrl: `${config.network.streamingUrl}/${path.basename(movie.path)}/movie.mp4`
            };

            res.json(movieWithUrls);
        } catch (error) {
            console.error('Error getting movie:', error);
            res.status(500).json({ error: 'Failed to retrieve movie' });
        }
    }

    async deleteMovie(req, res) {
        try {
            const { id } = req.params;
            const movie = await this.db.getMovie(id);
            
            if (!movie) {
                return res.status(404).json({ error: 'Movie not found' });
            }

            // Delete files
            if (movie.path && await fs.access(movie.path).then(() => true).catch(() => false)) {
                await fs.rm(movie.path, { recursive: true, force: true });
            }

            // Delete from database
            await this.db.deleteMovie(id);

            console.log(`Movie deleted: ${movie.title} (ID: ${id})`);
            res.json({ message: 'Movie deleted successfully' });
        } catch (error) {
            console.error('Error deleting movie:', error);
            res.status(500).json({ error: 'Failed to delete movie' });
        }
    }

    async getServerStatus(req, res) {
        try {
            const movies = await this.db.getAllMovies();
            const uploadingCount = movies.filter(m => m.status === 'uploading').length;
            const processingCount = movies.filter(m => m.status === 'processing').length;
            const readyCount = movies.filter(m => m.status === 'ready').length;

            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                movies: {
                    total: movies.length,
                    uploading: uploadingCount,
                    processing: processingCount,
                    ready: readyCount
                },
                activeSessions: this.uploadSessions.size
            });
        } catch (error) {
            console.error('Error getting server status:', error);
            res.status(500).json({ error: 'Failed to get server status' });
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
            await fs.mkdir(config.storage.tempPath, { recursive: true });

            // Clean up expired sessions on startup
            await this.db.cleanupExpiredSessions();

            // Start server
            this.server = this.app.listen(config.upload.port, config.upload.host, () => {
                console.log(`Upload server running on http://${config.upload.host}:${config.upload.port}`);
            });

            // Cleanup on exit
            process.on('SIGTERM', this.shutdown.bind(this));
            process.on('SIGINT', this.shutdown.bind(this));

        } catch (error) {
            console.error('Failed to start upload server:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('Shutting down upload server...');
        
        if (this.server) {
            this.server.close();
        }
        
        await this.db.close();
        process.exit(0);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new UploadServer();
    server.start();
}

module.exports = UploadServer;