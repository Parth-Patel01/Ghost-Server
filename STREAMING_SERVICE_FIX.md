# Streaming Service Fix 🔧

## Issue Resolved: Streaming Service Failed to Start

### Problem:
The streaming service (`pi-media-stream.service`) was failing to start due to **port conflicts** and **architecture mismatches**.

### Root Cause:
1. **Port Conflict**: Media server configured to use port 80, which conflicts with nginx
2. **Architecture Mismatch**: nginx proxy expects media server on port 8080, but config had port 80
3. **Service Configuration**: Missing proper port configurations

### Solution Applied:

#### 1. **Fixed Port Configuration**
```javascript
// config/default.js - BEFORE
media: {
    port: 80,  // ❌ Conflicts with nginx
    host: '0.0.0.0',
    staticRoot: '/media/movies'
}

// config/default.js - AFTER
media: {
    port: 8080,  // ✅ No conflict with nginx
    host: '0.0.0.0',
    staticRoot: '/media/movies'
}
```

#### 2. **Updated Service Configuration**
```ini
# scripts/services/pi-media-stream.service - BEFORE
Environment=PORT=80

# scripts/services/pi-media-stream.service - AFTER
Environment=PORT=8080
```

#### 3. **Removed Unnecessary Capabilities**
- Removed `CAP_NET_BIND_SERVICE` capabilities (no longer needed for port 8080)
- Cleaned up service file configuration

#### 4. **Enhanced Install Script**
- Added port 8080 conflict checking
- Added service health checks with curl
- Added detailed logging for troubleshooting
- Added verification that services are responding

#### 5. **Updated Network Configuration**
```javascript
// config/default.js - Network URLs
network: {
    piIp: '192.168.1.50',
    uploadUrl: 'http://192.168.1.50:3000',
    streamingUrl: 'http://192.168.1.50:8080'  // ✅ Updated
}
```

### Architecture Overview:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Browser   │───▶│   nginx     │───▶│   Services  │
│             │    │   (port 80) │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
                         │                    │
                         │                    ├─ Upload: 3000
                         │                    ├─ Stream: 8080
                         │                    └─ Worker: (no port)
                         │
                    ┌─────────────┐
                    │   Routes    │
                    │             │
                    │ /api/*  ──▶ 3000 │
                    │ /media/* ──▶ 8080 │
                    │ /*      ──▶ 3000 │
                    └─────────────┘
```

### Testing:
The install script now includes health checks:
- ✅ Upload service health: `curl http://localhost:3000/health`
- ✅ Streaming service health: `curl http://localhost:8080/health`
- ✅ Port availability checks for 3000, 8080, and 80

### Benefits:
1. **No Port Conflicts**: nginx (80) ↔ media server (8080) ↔ upload server (3000)
2. **Proper Service Separation**: Each service has its own dedicated port
3. **Better Error Handling**: Detailed logging and health checks
4. **Easier Troubleshooting**: Clear service status and logs

### Files Modified:
- ✅ `config/default.js` - Updated media server port
- ✅ `scripts/services/pi-media-stream.service` - Updated service configuration
- ✅ `scripts/install.sh` - Enhanced with health checks and port verification

### Next Steps:
1. Run the updated install script: `./scripts/install.sh`
2. Check service status: `sudo systemctl status pi-media-*`
3. Test endpoints:
   - Upload UI: `http://your-pi-ip:3000`
   - Media streaming: `http://your-pi-ip:80` (nginx proxy)
   - Direct media API: `http://your-pi-ip:8080`

🎉 **Streaming service should now start successfully!**