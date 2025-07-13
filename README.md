# Pi Media Server

A fully local media streaming service for Raspberry Pi 5 that allows you to upload movies via a modern web interface and stream them on your local network. No internet required!

## 🎯 Features

- **Modern Upload Interface**: Drag-and-drop multiple movie files with chunked upload support
- **Automatic Processing**: Auto-generates movie posters and HLS segments for optimal streaming
- **Custom Video Player**: Built-in player with custom controls, seeking, and fullscreen support
- **Fast Streaming**: Byte-range support for instant seeking, both MP4 and HLS playback
- **Concurrent Operations**: Support for 5+ simultaneous uploads and streams
- **Smart Metadata**: Automatically extracts movie titles and years from filenames
- **Local Network Only**: Completely offline operation, perfect for private media collections
- **Professional UI**: Modern React-based interface with responsive design

## 🏗️ Architecture

### Backend Services
- **Upload Server** (Port 3000): Handles chunked file uploads and serves the React frontend
- **Media Server** (Port 80): Serves video files with byte-range support for streaming
- **Processing Worker**: Background service using Redis queues for ffmpeg operations

### Frontend
- **React + Vite**: Modern frontend with Tailwind CSS
- **Custom Video Player**: HLS.js integration with fallback to native MP4 playback
- **Upload Manager**: Multi-file drag-and-drop with real-time progress tracking

### Storage Structure
```
/media/movies/
  └── Movie.Title.2023/
      ├── movie.mp4          # Original/converted video file
      ├── poster.jpg         # Auto-generated poster (1:30 timestamp)
      └── hls/
          ├── playlist.m3u8  # HLS playlist
          └── segment*.ts    # HLS video segments
```

## 🚀 Quick Installation

### Prerequisites
- Raspberry Pi 5 (4GB RAM recommended)
- USB 3.0 SSD for media storage
- Raspberry Pi OS 64-bit
- Nokia Beacon router (or any gigabit router)

### Automated Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd pi-media-server
   ```

2. **Run the installation script:**
   ```bash
   chmod +x scripts/install.sh
   ./scripts/install.sh
   ```

3. **The script will automatically:**
   - Update system packages
   - Install Node.js, Redis, ffmpeg, and other dependencies
   - Set up project files and build the frontend
   - Configure systemd services
   - Initialize the database
   - Start all services

4. **Access your server:**
   - Upload Interface: `http://192.168.1.50:3000`
   - Media Streaming: `http://192.168.1.50:80`

## 🔧 Manual Installation

<details>
<summary>Click to expand manual installation steps</summary>

### 1. System Dependencies
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential python3 python3-pip
sudo apt install -y ffmpeg redis-server nginx sqlite3
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Setup Project
```bash
# Install backend dependencies
npm install

# Install and build frontend
cd frontend
npm install
npm run build
cd ..
```

### 4. Configure Storage
```bash
sudo mkdir -p /media/movies
sudo chown pi:pi /media/movies
mkdir -p /tmp/pi-media-uploads
```

### 5. Setup Services
```bash
# Copy service files
sudo cp scripts/services/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pi-media-upload pi-media-stream pi-media-worker
sudo systemctl start pi-media-upload pi-media-stream pi-media-worker
```

</details>

## 📱 Usage

### Uploading Movies

1. **Access the upload interface** at `http://your-pi-ip:3000`
2. **Drag and drop** video files or click to select
3. **Monitor progress** - files are uploaded in chunks with real-time progress
4. **Wait for processing** - poster generation and HLS conversion happen automatically
5. **Watch your movies** - they'll appear in the library once ready

### Supported Formats
- **Input**: MP4, MKV, AVI, MOV, WMV, FLV, WebM
- **Output**: MP4 (direct playback) + HLS segments (streaming)
- **Maximum file size**: 4GB per file

### Watching Movies

1. **Browse your library** on the main page
2. **Click any movie poster** to start watching
3. **Use keyboard shortcuts**:
   - `Space`: Play/Pause
   - `←/→`: Seek ±10 seconds
   - `M`: Mute/Unmute
   - `F`: Fullscreen

## ⚙️ Configuration

### Network Settings

Update `config/default.js` with your actual Pi IP address:

```javascript
network: {
  piIp: '192.168.1.50',  // Your Pi's static IP
  uploadUrl: 'http://192.168.1.50:3000',
  streamingUrl: 'http://192.168.1.50'
}
```

### Static IP Setup

1. **Configure static IP on your Pi:**
   ```bash
   sudo nano /etc/dhcpcd.conf
   ```
   Add:
   ```
   interface eth0
   static ip_address=192.168.1.50/24
   static routers=192.168.1.1
   static domain_name_servers=192.168.1.1 8.8.8.8
   ```

2. **Reserve IP on your router** (Nokia Beacon example):
   - Access router admin panel
   - Go to DHCP settings
   - Add MAC address reservation for your Pi

## 🔍 Monitoring & Troubleshooting

### Service Management
```bash
# Check service status
sudo systemctl status pi-media-*

# View real-time logs
sudo journalctl -u pi-media-upload -f
sudo journalctl -u pi-media-worker -f

# Restart services
sudo systemctl restart pi-media-*
```

### Common Issues

**Upload fails or stalls:**
```bash
# Check disk space
df -h /media/movies

# Check Redis
redis-cli ping

# Verify permissions
ls -la /media/movies
```

**Video won't play:**
```bash
# Check media server logs
sudo journalctl -u pi-media-stream -f

# Test direct file access
curl -I http://your-pi-ip/Movie.Title.2023/movie.mp4
```

**Processing stuck:**
```bash
# Check worker logs
sudo journalctl -u pi-media-worker -f

# Check ffmpeg
ffmpeg -version

# Manual processing test
ffmpeg -i /media/movies/test.mp4 -ss 00:01:30 -vframes 1 test.jpg
```

## 🎛️ Advanced Configuration

### Performance Tuning

**For better upload performance:**
```javascript
// config/default.js
upload: {
  chunkSize: 2 * 1024 * 1024,  // 2MB chunks
  concurrentUploads: 3,        // Reduce if network is slow
}
```

**For better processing performance:**
```javascript
// config/default.js
processing: {
  maxConcurrentJobs: 1,  // Reduce on Pi with limited RAM
  hlsSegmentTime: 10,    // Longer segments = less CPU
}
```

### Custom Movie Metadata

The system automatically parses movie information from filenames:

- `Movie.Title.2023.1080p.BluRay.mp4` → "Movie Title" (2023)
- `Movie Title (2023).mp4` → "Movie Title" (2023)
- `Movie Title 2023.mkv` → "Movie Title" (2023)

### Storage Management

**Check usage:**
```bash
# Disk usage
du -sh /media/movies/*

# Database size
ls -lh /home/pi/media.db
```

**Clean up:**
```bash
# Remove processed upload chunks
sudo rm -rf /tmp/pi-media-uploads/*

# Clean old Redis jobs
redis-cli FLUSHDB
```

## 🔒 Security Considerations

- **LAN-only access**: Services are bound to all interfaces but intended for local network use
- **No authentication**: Designed for trusted home networks
- **File validation**: Only video files are accepted, with size limits
- **Rate limiting**: API endpoints have built-in rate limiting

## 📊 Performance Expectations

### Raspberry Pi 5 Performance
- **Upload speed**: Up to SSD write speeds (~400MB/s over USB 3.0)
- **Concurrent uploads**: 5 files simultaneously
- **Processing time**: ~7 minutes per GB (poster + HLS generation)
- **Streaming**: 5+ concurrent 1080p streams
- **Seeking**: Instant with byte-range support

### Network Requirements
- **Gigabit Ethernet**: Recommended for best performance
- **Wi-Fi 6**: Nokia Beacon dual-band works well
- **Local bandwidth**: ~20Mbps per 1080p stream

## 🛠️ Development

### Development Setup
```bash
# Backend development
npm run dev

# Frontend development
cd frontend
npm run dev

# Worker development
npm run worker
```

### Project Structure
```
pi-media-server/
├── src/
│   ├── db/              # Database models and schema
│   ├── utils/           # Utility functions
│   ├── worker/          # Background job processing
│   ├── server.js        # Main upload server
│   ├── media-server.js  # Streaming server
│   └── worker.js        # Processing worker
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── utils/       # Frontend utilities
│   └── dist/            # Built frontend
├── config/              # Configuration files
├── scripts/             # Installation and service scripts
└── docs/                # Documentation
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🎉 Acknowledgments

- Built with modern web technologies: Node.js, React, Express
- Video processing powered by FFmpeg
- Job queues handled by Redis and Bull
- UI built with Tailwind CSS and Heroicons
- Video streaming with HLS.js

---

**Enjoy your local media streaming experience! 🎬**