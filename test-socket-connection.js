// test-socket-connection.js
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:5000';
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_TOKEN_HERE'; // Replace this!

console.log('==========================================');
console.log('🧪 Socket.IO Connection Test');
console.log('==========================================');
console.log(`Server: ${SERVER_URL}`);
console.log('==========================================\n');

const socket = io(SERVER_URL, {
    auth: {
        token: ACCESS_TOKEN
    },
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('✅ Connected to server!');
    console.log(`   Socket ID: ${socket.id}`);
    console.log('==========================================\n');
});

socket.on('connected', (data) => {
    console.log('✅ Server confirmed connection!');
    console.log('   Data:', JSON.stringify(data, null, 2));
    console.log('==========================================\n');

    console.log('✅ All tests passed!');
    setTimeout(() => {
        socket.disconnect();
        process.exit(0);
    }, 1000);
});

socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
});

setTimeout(() => {
    if (!socket.connected) {
        console.error('⏰ Connection timeout');
        process.exit(1);
    }
}, 10000);