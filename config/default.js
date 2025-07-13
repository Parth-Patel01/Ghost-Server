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
        port: 80,
        host: '0.0.0.0',
        staticRoot: '/media/movies'
    },

    // Storage configuration
    storage: {
        mediaPath: '/media/movies',
        tempPath: '/tmp/pi-media-uploads',
        dbPath: '/home/pi/media.db'
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
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        }
    },

    // Network configuration
    network: {
        piIp: '192.168.1.50', // Default Pi IP - should be updated based on actual network
        uploadUrl: 'http://192.168.1.50:3000',
        streamingUrl: 'http://192.168.1.50'
    },

    // Development settings
    development: {
        enableLogging: true,
        logLevel: 'info'
    }
};