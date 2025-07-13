const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs').promises;

const config = require('../config/default');
const Database = require('./db/database');
const mediaQueue = require('./worker/mediaQueue');

// Set ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic);

class MediaWorker {
    constructor() {
        this.db = new Database(config.storage.dbPath);
        this.isProcessing = false;
        this.setupQueue();
    }

    async initialize() {
        await this.db.initialize();
        console.log('Media worker initialized');
    }

    setupQueue() {
        // Process media jobs with limited concurrency
        mediaQueue.process('process-movie', config.processing.maxConcurrentJobs, this.processMovie.bind(this));
        
        console.log(`Media worker started with ${config.processing.maxConcurrentJobs} concurrent slots`);
    }

    async processMovie(job) {
        const { movieId, moviePath, finalPath } = job.data;
        
        try {
            console.log(`Starting processing for movie ID: ${movieId}`);
            job.progress(0);

            // Get video metadata first
            const metadata = await this.getVideoMetadata(finalPath);
            console.log(`Video metadata: ${metadata.duration}s, ${metadata.width}x${metadata.height}`);

            // Update movie with metadata
            await this.db.updateMovie(movieId, {
                duration: metadata.duration
            });

            job.progress(10);

            // Generate poster
            console.log('Generating poster...');
            const posterPath = await this.generatePoster(finalPath, moviePath);
            job.progress(30);

            // Generate HLS segments
            console.log('Generating HLS segments...');
            const hlsPath = await this.generateHLS(finalPath, moviePath, (progress) => {
                // Update job progress: 30% + (progress * 60%)
                job.progress(30 + (progress * 0.6));
            });

            job.progress(95);

            // Update database with final paths
            await this.db.updateMovie(movieId, {
                status: 'ready',
                poster_path: posterPath,
                hls_path: hlsPath,
                processed_at: new Date().toISOString()
            });

            job.progress(100);

            console.log(`Movie processing completed for ID: ${movieId}`);
            return {
                movieId,
                posterPath,
                hlsPath,
                duration: metadata.duration
            };

        } catch (error) {
            console.error(`Error processing movie ID ${movieId}:`, error);
            
            // Update movie status to error
            await this.db.updateMovie(movieId, {
                status: 'error',
                error_message: error.message
            });

            throw error;
        }
    }

    async getVideoMetadata(videoPath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    reject(err);
                } else {
                    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
                    resolve({
                        duration: metadata.format.duration,
                        width: videoStream ? videoStream.width : null,
                        height: videoStream ? videoStream.height : null,
                        bitrate: metadata.format.bit_rate
                    });
                }
            });
        });
    }

    async generatePoster(videoPath, outputDir) {
        const posterPath = path.join(outputDir, 'poster.jpg');
        
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .screenshots({
                    count: 1,
                    timemarks: [config.processing.posterTimeOffset],
                    filename: 'poster.jpg',
                    folder: outputDir,
                    size: '1280x720'
                })
                .on('end', () => {
                    console.log('Poster generated successfully');
                    resolve(posterPath);
                })
                .on('error', (err) => {
                    console.error('Error generating poster:', err);
                    reject(err);
                });
        });
    }

    async generateHLS(videoPath, outputDir, progressCallback) {
        const hlsDir = path.join(outputDir, 'hls');
        const playlistPath = path.join(hlsDir, 'playlist.m3u8');
        
        // Ensure HLS directory exists
        await fs.mkdir(hlsDir, { recursive: true });

        return new Promise((resolve, reject) => {
            const command = ffmpeg(videoPath)
                .outputOptions([
                    '-codec: copy',  // Copy streams without re-encoding when possible
                    '-start_number 0',
                    '-hls_time ' + config.processing.hlsSegmentTime,
                    '-hls_list_size 0',
                    '-hls_playlist_type ' + config.processing.hlsPlaylistType,
                    '-f hls'
                ])
                .output(playlistPath);

            // Track progress
            command.on('progress', (progress) => {
                if (progressCallback && progress.percent) {
                    progressCallback(Math.min(progress.percent, 100));
                }
            });

            command.on('end', () => {
                console.log('HLS conversion completed');
                resolve(playlistPath);
            });

            command.on('error', (err) => {
                console.error('Error generating HLS:', err);
                reject(err);
            });

            command.run();
        });
    }

    async start() {
        await this.initialize();
        
        // Graceful shutdown
        process.on('SIGTERM', this.shutdown.bind(this));
        process.on('SIGINT', this.shutdown.bind(this));
        
        console.log('Media worker is ready to process jobs');
    }

    async shutdown() {
        console.log('Shutting down media worker...');
        
        // Close queue connections
        await mediaQueue.close();
        
        // Close database
        await this.db.close();
        
        console.log('Media worker stopped');
        process.exit(0);
    }
}

// Start worker if this file is run directly
if (require.main === module) {
    const worker = new MediaWorker();
    worker.start().catch(console.error);
}

module.exports = MediaWorker;