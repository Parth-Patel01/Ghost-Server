module.exports = {
    // Server configuration
    upload: {
        port: 3000,
        host: '0.0.0.0',
        maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
        chunkSize: 1024 * 1024, // 1MB chunks
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        concurrentUploads: 5,
        allowedExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm']
    },

    media: {
        port: 8080,
        host: '0.0.0.0',
        staticRoot: '/media/movies'
    },

    // Storage configuration
    storage: {
        mediaPath: '/media/movies',
        tempPath: '/tmp/pi-media-uploads',
        dbPath: process.env.HOME + '/media.db'
    },

    // Redis configuration for job queue
    redis: {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 3
    },

    // Media processing configuration
    processing: {
        maxConcurrentJobs: 2,
        hlsSegmentTime: 6,
        posterTimeOffset: '00:01:30',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        hlsPlaylistType: 'vod'
    },

    // Security settings
    security: {
        cors: {
            origin: true, // Allow all origins on LAN
            credentials: true
        },
        rateLimit: {
            // General API rate limiting
            general: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 100 // limit each IP to 100 requests per windowMs
            },
            // Upload-specific rate limiting (much higher for chunk uploads)
            upload: {
                windowMs: 15 * 60 * 1000, // 15 minutes
                max: 10000 // allow many chunk uploads for large files
            }
        }
    },

    // Network configuration
    network: {
        piIp: '192.168.18.3', // Default Pi IP - should be updated based on actual network
        uploadUrl: 'http://192.168.18.3:3000',
        streamingUrl: 'http://192.168.18.3:8080'
    },

    // Server branding
    branding: {
        name: 'SoulStream',
        shortName: 'SoulStream',
        tagline: 'Where Souls Flow Through Eternity',
        theme: 'dark'
    },

    // Development settings
    development: {
        enableLogging: true,
        logLevel: 'info'
    }
};
