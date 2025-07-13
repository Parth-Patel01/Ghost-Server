-- Pi Media Server Database Schema

CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    year INTEGER,
    filename TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    poster_path TEXT,
    hls_path TEXT,
    file_size INTEGER,
    duration REAL,
    status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'error')),
    error_message TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
CREATE INDEX IF NOT EXISTS idx_movies_uploaded_at ON movies(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_movies_updated_at 
    AFTER UPDATE ON movies
BEGIN
    UPDATE movies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Table for upload sessions to support chunked uploads
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    total_size INTEGER NOT NULL,
    uploaded_size INTEGER DEFAULT 0,
    chunk_size INTEGER DEFAULT 1048576,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    movie_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (movie_id) REFERENCES movies(id)
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);