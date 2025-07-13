const Queue = require('bull');
const config = require('../../config/default');

// Create the media processing queue
const mediaQueue = new Queue('media processing', {
    redis: {
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest
    },
    defaultJobOptions: {
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 20,     // Keep last 20 failed jobs
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        }
    }
});

// Queue event listeners
mediaQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed successfully:`, result);
});

mediaQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
});

mediaQueue.on('progress', (job, progress) => {
    console.log(`Job ${job.id} progress: ${progress}%`);
});

mediaQueue.on('stalled', (job) => {
    console.warn(`Job ${job.id} stalled`);
});

module.exports = mediaQueue;