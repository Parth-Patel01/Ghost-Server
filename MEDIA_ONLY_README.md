# 🎬 Media-Only Server

A dedicated media server that only serves movies without upload functionality, perfect for a Netflix-style viewing experience.

## 🚀 Quick Start

### 1. Start the Media-Only Server

```bash
# Start the media-only server (no upload functionality)
npm run media-only

# Or run directly
node start-media-server.js
```

The server will start on `http://localhost:8080`

### 2. Access Your Movies

- **Web Interface**: `http://localhost:8080` (Netflix-style interface)
- **Direct API**: `http://localhost:8080/api/movies`
- **Video Files**: `http://localhost:8080/[movie-folder]/movie.mp4`

## 📁 Movie Organization

Place your movies in the `/media/movies` directory with this structure:

```
/media/movies/
├── Movie.Title.2023/
│   ├── movie.mp4
│   ├── poster.jpg (optional)
│   └── hls/ (optional)
├── Another.Movie.2022/
│   ├── movie.mp4
│   └── poster.jpg
└── ...
```

### Movie Folder Naming

The server automatically parses movie titles and years from folder names:

- `Movie.Title.2023` → Title: "Movie Title", Year: 2023
- `Another Movie (2022)` → Title: "Another Movie", Year: 2022
- `Movie Title 2021` → Title: "Movie Title", Year: 2021

## 🎯 Features

### ✅ What's Included
- **Netflix-style interface** with hero section and movie grid
- **Real-time search** with debounced input
- **Continue watching** with progress tracking
- **Movie details page** with enhanced information
- **Responsive design** for mobile, desktop, and TV
- **Byte-range support** for instant video seeking
- **HLS streaming** support (if available)
- **Poster images** support
- **No upload functionality** - pure media server

### ❌ What's NOT Included
- Upload functionality
- User management
- Database storage
- Processing/encoding

## 🔧 Configuration

### Environment Variables

```bash
MEDIA_PORT=8080          # Server port (default: 8080)
MEDIA_HOST=0.0.0.0       # Server host (default: 0.0.0.0)
```

### Movie Directory

The server looks for movies in `/media/movies` by default. You can modify this in `src/media-only-server.js`:

```javascript
const moviesDir = '/media/movies'; // Change this path
```

## 📱 Usage

### Web Interface

1. **Browse Movies**: Visit `http://localhost:8080` to see all your movies
2. **Search**: Use the search bar to find specific movies
3. **Play**: Click on any movie to start playback
4. **Details**: Click "More Info" for enhanced movie information

### API Endpoints

```bash
# Get all movies
GET /api/movies

# Get specific movie
GET /api/movies/[movie-id]

# Search movies
GET /api/movies/search?q=[query]

# Health check
GET /health
```

### Direct Video Access

```bash
# Direct video file
GET /[movie-folder]/movie.mp4

# Poster image
GET /[movie-folder]/poster.jpg

# HLS playlist (if available)
GET /[movie-folder]/hls/playlist.m3u8
```

## 🎥 Video Playback

The server supports multiple video formats:

- **Direct MP4**: `http://localhost:8080/[movie]/movie.mp4`
- **HLS Streaming**: `http://localhost:8080/[movie]/hls/playlist.m3u8` (if available)
- **Byte-range requests** for instant seeking
- **Cross-origin support** for web players

## 🔍 Search Features

- **Real-time search** with 300ms debouncing
- **Search by title** and filename
- **Loading states** and error handling
- **Responsive results** display

## 📊 Performance

- **Lightweight**: No database or complex processing
- **Fast**: Direct file serving with caching
- **Scalable**: Can handle multiple concurrent streams
- **Efficient**: Byte-range support for smooth playback

## 🛠️ Troubleshooting

### Video Not Playing

1. **Check file format**: Ensure movies are in MP4 format
2. **Verify file path**: Movies should be in `/media/movies/[folder]/movie.mp4`
3. **Check permissions**: Ensure the server can read the movie files
4. **Browser compatibility**: Try different browsers or video players

### Movies Not Showing

1. **Check folder structure**: Ensure movies are in the correct directory
2. **Verify file names**: Movies should be named `movie.mp4`
3. **Check server logs**: Look for errors in the console
4. **Restart server**: Stop and restart the media server

### Search Not Working

1. **Check API endpoint**: Verify `/api/movies/search` is accessible
2. **Check network**: Ensure frontend can reach the backend
3. **Check console**: Look for JavaScript errors in browser console

## 🔄 Migration from Full Server

If you're switching from the full server with upload functionality:

1. **Stop the full server**: `npm stop` or `Ctrl+C`
2. **Start media-only server**: `npm run media-only`
3. **Update frontend URL**: Point to `http://localhost:8080`
4. **Verify movies**: Check that all movies are accessible

## 📝 Notes

- This server is designed for **viewing only** - no upload functionality
- Movies must be **pre-processed** and placed in the correct directory
- The server is **lightweight** and focused on serving media
- **No user management** or authentication included
- **No database** required - uses file system for movie discovery

## 🎯 Perfect For

- **Home media centers**
- **Raspberry Pi media servers**
- **Local Netflix alternatives**
- **Simple movie streaming**
- **Offline media libraries**

---

**Enjoy your movies! 🎬** 