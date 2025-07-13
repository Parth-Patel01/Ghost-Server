const path = require('path');

/**
 * Parse movie title and year from filename
 * Supports common movie naming conventions like:
 * - Movie.Title.2023.1080p.BluRay.x264.mp4
 * - Movie Title (2023).mp4
 * - Movie.Title.2023.mp4
 * - Movie Title 2023.mp4
 */
function parseMovieInfo(filename) {
    // Remove file extension
    const nameWithoutExt = path.parse(filename).name;
    
    // Common patterns for movie names
    const patterns = [
        // Pattern: Movie.Title.(YEAR) or Movie.Title.YEAR
        /^(.+?)[\.\s]+\(?(\d{4})\)?/,
        // Pattern: Movie Title (YEAR)
        /^(.+?)\s*\((\d{4})\)/,
        // Pattern: Movie Title YEAR
        /^(.+?)\s+(\d{4})/,
        // Pattern: just title without year
        /^(.+?)(?:\s*\d{4})?$/
    ];

    let title = nameWithoutExt;
    let year = null;

    for (const pattern of patterns) {
        const match = nameWithoutExt.match(pattern);
        if (match) {
            title = match[1];
            year = match[2] ? parseInt(match[2]) : null;
            break;
        }
    }

    // Clean up title
    title = title
        .replace(/[\.\-_]/g, ' ') // Replace dots, dashes, underscores with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

    // Capitalize first letter of each word
    title = title.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );

    // Validate year (should be between 1900 and current year + 2)
    const currentYear = new Date().getFullYear();
    if (year && (year < 1900 || year > currentYear + 2)) {
        year = null;
    }

    return {
        title,
        year,
        originalFilename: filename
    };
}

/**
 * Generate directory name for movie storage
 */
function generateMovieDir(title, year) {
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s\-\.]/g, '');
    const yearSuffix = year ? `.${year}` : '';
    return `${sanitizedTitle}${yearSuffix}`;
}

/**
 * Validate file extension
 */
function isValidVideoFile(filename, allowedExtensions) {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
}

/**
 * Generate unique filename to avoid conflicts
 */
function generateUniqueFilename(originalName, existingFiles = []) {
    const parsed = path.parse(originalName);
    let counter = 1;
    let newName = originalName;

    while (existingFiles.includes(newName)) {
        newName = `${parsed.name}_${counter}${parsed.ext}`;
        counter++;
    }

    return newName;
}

/**
 * Calculate estimated processing time based on file size
 */
function estimateProcessingTime(fileSizeBytes) {
    // Rough estimate: 1GB takes about 5-10 minutes to process on Pi 5
    const fileSizeGB = fileSizeBytes / (1024 * 1024 * 1024);
    const estimatedMinutes = Math.ceil(fileSizeGB * 7); // 7 minutes per GB
    return estimatedMinutes;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration from seconds to readable format
 */
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

module.exports = {
    parseMovieInfo,
    generateMovieDir,
    isValidVideoFile,
    generateUniqueFilename,
    estimateProcessingTime,
    formatFileSize,
    formatDuration
};