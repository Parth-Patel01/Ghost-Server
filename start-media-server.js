#!/usr/bin/env node

const MediaOnlyServer = require('./src/media-only-server');

console.log('🎬 Starting Media-Only Server...');
console.log('📺 This server only serves movies - no upload functionality');
console.log('🌐 Access your movies at: http://localhost:8080');

const server = new MediaOnlyServer();
server.start(); 