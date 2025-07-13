#!/bin/bash

# Pi Media Server Installation Script
# This script sets up the complete local media streaming service on Raspberry Pi

set -e  # Exit on any error

# Configuration
INSTALL_DIR="$HOME/pi-media-server"
MEDIA_DIR="/media/movies"
DB_PATH="$HOME/media.db"
SERVICE_USER="$USER"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if port is in use and kill process if needed
check_and_free_port() {
    local port=$1
    local service_name=$2
    
    print_status "Checking if port $port is in use..."
    
    # Check if port is in use
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port $port is in use"
        
        # Get the process using the port
        local pid=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null | head -n1)
        local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
        
        print_status "Process using port $port: $process_name (PID: $pid)"
        
        if [[ "$process_name" == "$service_name" ]]; then
            print_status "Stopping existing $service_name service..."
            sudo systemctl stop $service_name 2>/dev/null || true
            sudo pkill -f $service_name 2>/dev/null || true
            sleep 2
        else
            print_warning "Killing process $process_name (PID: $pid) using port $port"
            sudo kill -9 $pid 2>/dev/null || true
            sleep 2
        fi
        
        # Double check if port is still in use
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_error "Failed to free port $port"
            return 1
        fi
    fi
    
    print_success "Port $port is available"
    return 0
}

# Stop all nginx processes
stop_nginx_completely() {
    print_status "Stopping all nginx processes..."
    
    # Stop nginx service
    sudo systemctl stop nginx 2>/dev/null || true
    
    # Kill any remaining nginx processes
    sudo pkill -f nginx 2>/dev/null || true
    
    # Wait a moment for processes to stop
    sleep 2
    
    # Force kill if still running
    if pgrep -f nginx >/dev/null; then
        print_warning "Force killing remaining nginx processes..."
        sudo pkill -9 -f nginx 2>/dev/null || true
        sleep 2
    fi
    
    print_success "All nginx processes stopped"
}

# Check if running as root
check_user() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root!"
        print_error "Please run as your regular user: ./scripts/install.sh"
        exit 1
    fi
    
    # Ensure we're running as a regular user with home directory
    if [[ -z "$HOME" ]]; then
        print_error "HOME environment variable is not set!"
        exit 1
    fi
    
    print_status "Running as user: $USER (home: $HOME)"
}

# Check if we're on a Raspberry Pi
check_platform() {
    if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
        print_warning "This script is designed for Raspberry Pi, but can work on other Linux systems"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Update system packages
update_system() {
    print_status "Updating system packages..."
    sudo apt update
    sudo apt upgrade -y
    print_success "System updated"
}

# Install required system packages
install_dependencies() {
    print_status "Installing system dependencies..."
    
    # Essential packages
    sudo apt install -y \
        curl \
        wget \
        git \
        build-essential \
        python3 \
        python3-pip \
        ffmpeg \
        redis-server \
        nginx \
        sqlite3 \
        htop \
        tree \
        lsof \
        net-tools
    
    print_success "System dependencies installed"
}

# Install Node.js (using NodeSource repository for latest LTS)
install_nodejs() {
    print_status "Installing Node.js..."
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_status "Node.js $NODE_VERSION is already installed"
        
        # Check if version is sufficient (v18+)
        if [[ $(node --version | cut -d'v' -f2 | cut -d'.' -f1) -ge 18 ]]; then
            print_success "Node.js version is sufficient"
            return
        else
            print_warning "Node.js version is too old, updating..."
        fi
    fi
    
    # Install Node.js LTS
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install -y nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    print_success "Node.js $NODE_VERSION and npm $NPM_VERSION installed"
}

# Setup project directory and install dependencies
setup_project() {
    print_status "Setting up project..."
    
    # Create project directory if it doesn't exist
    if [ ! -d "$INSTALL_DIR" ]; then
        print_status "Creating project directory at $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR"
    fi
    
    # Copy project files
    print_status "Copying project files..."
    cp -r . "$INSTALL_DIR/"
    cd "$INSTALL_DIR"
    
    # Install backend dependencies
    print_status "Installing backend dependencies..."
    npm install
    
    # Install frontend dependencies and build
    print_status "Installing frontend dependencies..."
    cd frontend
    npm install
    
    print_status "Building frontend..."
    npm run build
    cd ..
    
    print_success "Project setup complete"
}

# Setup storage directories
setup_storage() {
    print_status "Setting up storage directories..."
    
    # Create media directory
    sudo mkdir -p "$MEDIA_DIR"
    sudo chown $SERVICE_USER:$SERVICE_USER "$MEDIA_DIR"
    sudo chmod 755 "$MEDIA_DIR"
    
    # Create temp upload directory
    sudo mkdir -p /tmp/pi-media-uploads
    sudo chown $SERVICE_USER:$SERVICE_USER /tmp/pi-media-uploads
    sudo chmod 755 /tmp/pi-media-uploads
    
    # Create database directory
    mkdir -p "$(dirname $DB_PATH)"
    
    print_success "Storage directories created"
}

# Configure Redis
configure_redis() {
    print_status "Configuring Redis..."
    
    # Enable and start Redis
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    
    # Test Redis connection
    if redis-cli ping | grep -q "PONG"; then
        print_success "Redis is running"
    else
        print_error "Redis failed to start"
        exit 1
    fi
}

# Setup systemd services
setup_services() {
    print_status "Setting up systemd services..."
    
    # Copy service files
    sudo cp scripts/services/*.service /etc/systemd/system/
    
    # Update service file paths for current user
    print_status "Updating service file paths for user: $USER..."
    sudo sed -i "s|/home/pi/pi-media-server|$INSTALL_DIR|g" /etc/systemd/system/pi-media-*.service
    sudo sed -i "s|User=pi|User=$USER|g" /etc/systemd/system/pi-media-*.service
    sudo sed -i "s|Group=pi|Group=$USER|g" /etc/systemd/system/pi-media-*.service
    
    # Reload systemd and enable services
    sudo systemctl daemon-reload
    sudo systemctl enable pi-media-upload.service
    sudo systemctl enable pi-media-stream.service
    sudo systemctl enable pi-media-worker.service
    
    print_success "Systemd services configured"
}

# Configure nginx reverse proxy (optional)
configure_nginx() {
    print_status "Configuring nginx..."
    
    # Stop all existing nginx processes to avoid conflicts
    stop_nginx_completely

    # Backup existing nginx configuration if it exists
    if [ -f /etc/nginx/sites-enabled/default ]; then
        print_status "Backing up existing nginx default configuration..."
        sudo cp /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup.$(date +%Y%m%d-%H%M%S)
    fi

    # Create nginx configuration
    sudo tee /etc/nginx/sites-available/pi-media-server > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    
    # Media files (direct serving)
    location ~* ^/[^/]+\.(mp4|m3u8|ts|jpg|jpeg|png)$ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        
        # Enable byte-range requests
        proxy_set_header Range \$http_range;
        proxy_set_header If-Range \$http_if_range;
        
        # Caching for media files
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
    
    # API requests (upload server)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # Increase timeout for large uploads
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 5G;
    }
    
    # Frontend (upload server serves built React app)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/pi-media-server /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Check and free port 80 if needed
    if ! check_and_free_port 80 "nginx"; then
        print_error "Cannot free port 80 for nginx"
        exit 1
    fi
    
    # Test nginx configuration
    if sudo nginx -t; then
        print_success "Nginx configuration test passed"
        sudo systemctl enable nginx
        
        # Start nginx service
        print_status "Starting nginx service..."
        if sudo systemctl start nginx; then
            print_success "Nginx started successfully"
            
            # Verify nginx is running and listening on port 80
            sleep 2
            if sudo systemctl is-active --quiet nginx && netstat -tlnp | grep -q ":80.*nginx"; then
                print_success "Nginx is running and listening on port 80"
            else
                print_error "Nginx failed to start properly"
                sudo systemctl status nginx
                exit 1
            fi
        else
            print_error "Failed to start nginx"
            sudo systemctl status nginx
            exit 1
        fi
    else
        print_error "Nginx configuration test failed"
        exit 1
    fi
}

# Initialize database
init_database() {
    print_status "Initializing database..."
    
    cd "$INSTALL_DIR"
    node -e "
        const Database = require('./src/db/database');
        const db = new Database('$DB_PATH');
        db.initialize().then(() => {
            console.log('Database initialized successfully');
            process.exit(0);
        }).catch((err) => {
            console.error('Database initialization failed:', err);
            process.exit(1);
        });
    "
    
    print_success "Database initialized"
}

# Start services
start_services() {
    print_status "Starting services..."
    
    # Check if required ports are available
    if ! check_and_free_port 3000 "node"; then
        print_error "Cannot free port 3000 for upload service"
        exit 1
    fi
    
    if ! check_and_free_port 8080 "node"; then
        print_error "Cannot free port 8080 for stream service"
        exit 1
    fi
    
    # Start all services
    sudo systemctl start pi-media-upload.service
    sudo systemctl start pi-media-stream.service
    sudo systemctl start pi-media-worker.service
    
    # Wait a moment for services to start
    sleep 3
    
    # Check service status
    if sudo systemctl is-active --quiet pi-media-upload.service; then
        print_success "Upload service started"
    else
        print_error "Upload service failed to start"
        sudo systemctl status pi-media-upload.service
    fi
    
    if sudo systemctl is-active --quiet pi-media-stream.service; then
        print_success "Streaming service started"
    else
        print_error "Streaming service failed to start"
        sudo systemctl status pi-media-stream.service
    fi
    
    if sudo systemctl is-active --quiet pi-media-worker.service; then
        print_success "Worker service started"
    else
        print_error "Worker service failed to start"
        sudo systemctl status pi-media-worker.service
    fi
}

# Create a simple test file
create_test_info() {
    print_status "Creating test information..."
    
    # Get the Pi's IP address
    PI_IP=$(hostname -I | awk '{print $1}')
    
    cat > "$INSTALL_DIR/SERVER_INFO.txt" <<EOF
Pi Media Server Installation Complete!

Server Information:
==================
Upload Interface: http://$PI_IP:3000
Media Streaming:   http://$PI_IP:80
Installation Dir:  $INSTALL_DIR
Media Directory:   $MEDIA_DIR
Database:          $DB_PATH

Service Management:
==================
View status:       sudo systemctl status pi-media-*
Start services:    sudo systemctl start pi-media-*
Stop services:     sudo systemctl stop pi-media-*
Restart services:  sudo systemctl restart pi-media-*
View logs:         sudo journalctl -u pi-media-upload -f

Network Setup:
==============
1. Set static IP on your Pi (recommended: $PI_IP)
2. Update router settings to reserve this IP
3. Update config/default.js with your actual Pi IP
4. Restart services after IP changes

Troubleshooting:
===============
- Check logs: sudo journalctl -u pi-media-upload -f
- Test Redis: redis-cli ping
- Check ports: ss -tlnp | grep -E ':(80|3000|6379)'
- Check ffmpeg: ffmpeg -version

File Locations:
==============
- Logs: sudo journalctl -u pi-media-*
- Config: $INSTALL_DIR/config/default.js
- Services: /etc/systemd/system/pi-media-*.service
EOF
    
    print_success "Server info created at $INSTALL_DIR/SERVER_INFO.txt"
}

# Remove existing Jellyfin installation and reset OS to defaults
remove_jellyfin() {
    print_status "Checking for existing Jellyfin installation..."
    
    # Stop and disable Jellyfin services
    if systemctl is-active --quiet jellyfin 2>/dev/null; then
        print_status "Stopping Jellyfin services..."
        sudo systemctl stop jellyfin
    fi
    
    if systemctl is-enabled --quiet jellyfin 2>/dev/null; then
        print_status "Disabling Jellyfin services..."
        sudo systemctl disable jellyfin
    fi
    
    # Remove Jellyfin packages
    print_status "Removing Jellyfin packages..."
    sudo apt remove --purge -y jellyfin jellyfin-server jellyfin-web jellyfin-ffmpeg* 2>/dev/null || true
    
    # Remove Jellyfin repository
    print_status "Removing Jellyfin repository..."
    sudo rm -f /etc/apt/sources.list.d/jellyfin.list
    sudo rm -f /etc/apt/trusted.gpg.d/jellyfin.gpg
    sudo rm -f /usr/share/keyrings/jellyfin-archive-keyring.gpg
    
    # Remove Jellyfin directories and data
    print_status "Removing Jellyfin directories..."
    sudo rm -rf /etc/jellyfin
    sudo rm -rf /var/lib/jellyfin
    sudo rm -rf /var/cache/jellyfin
    sudo rm -rf /var/log/jellyfin
    sudo rm -rf /usr/lib/jellyfin
    sudo rm -rf /usr/share/jellyfin
    
    # Remove user directories
    rm -rf ~/jellyfin* 2>/dev/null || true
    rm -rf ~/.config/jellyfin* 2>/dev/null || true
    rm -rf ~/.local/share/jellyfin* 2>/dev/null || true
    
    # Remove any Flask/Python upload projects
    print_status "Removing old upload projects..."
    rm -rf ~/Project/movie-upload 2>/dev/null || true
    rm -rf ~/Project 2>/dev/null || true
    
    # Remove Jellyfin firewall rules
    print_status "Removing Jellyfin firewall rules..."
    sudo ufw delete allow 8096/tcp 2>/dev/null || true
    
    # Remove Jellyfin user and group
    if id "jellyfin" &>/dev/null; then
        print_status "Removing Jellyfin user..."
        sudo userdel jellyfin 2>/dev/null || true
    fi
    if getent group jellyfin >/dev/null; then
        sudo groupdel jellyfin 2>/dev/null || true
    fi
    
    # Clean package cache
    print_status "Cleaning package cache..."
    sudo apt autoremove -y
    sudo apt autoclean
    sudo apt update
    
    # Remove any systemd service files
    sudo rm -f /etc/systemd/system/jellyfin* 2>/dev/null || true
    sudo rm -f /lib/systemd/system/jellyfin* 2>/dev/null || true
    sudo systemctl daemon-reload
    
    # Clean up old media directories if they exist and are empty
    if [ -d ~/media ] && [ -z "$(ls -A ~/media 2>/dev/null)" ]; then
        print_status "Removing empty old media directory..."
        rm -rf ~/media
    fi
    
    # Reset nginx to default configuration
    print_status "Resetting nginx to defaults..."
    sudo rm -f /etc/nginx/sites-enabled/jellyfin* 2>/dev/null || true
    sudo rm -f /etc/nginx/sites-available/jellyfin* 2>/dev/null || true
    
    print_success "Jellyfin removal and OS reset completed"
    print_warning "System is now clean and ready for Pi Media Server installation"
    echo
}

# Main installation function
main() {
    echo "=========================================="
    echo "    Pi Media Server Installation"
    echo "=========================================="
    echo
    
    check_user
    check_platform
    remove_jellyfin
    
    print_status "Starting installation process..."
    
    update_system
    install_dependencies
    install_nodejs
    setup_project
    setup_storage
    configure_redis
    setup_services
    configure_nginx
    init_database
    start_services
    create_test_info
    
    echo
    echo "=========================================="
    print_success "Installation completed successfully!"
    echo "=========================================="
    echo
    print_status "Next steps:"
    echo "1. Check server status: sudo systemctl status pi-media-*"
    echo "2. Visit http://$(hostname -I | awk '{print $1}'):3000 to access the upload interface"
    echo "3. Read $INSTALL_DIR/SERVER_INFO.txt for detailed information"
    echo
    print_warning "Remember to:"
    echo "- Set up static IP on your Pi"
    echo "- Update router settings to reserve the IP"
    echo "- Configure your actual network settings in config/default.js"
}

# Run main function
main "$@"