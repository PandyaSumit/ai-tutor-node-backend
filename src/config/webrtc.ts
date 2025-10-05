
// src/config/webrtc.ts
export interface ICEServerConfig {
    urls: string | string[];
    username?: string;
    credential?: string;
}

export interface WebRTCConfig {
    iceServers: ICEServerConfig[];
    iceTransportPolicy: 'all' | 'relay';
    bundlePolicy: 'balanced' | 'max-bundle' | 'max-compat';
    rtcpMuxPolicy: 'negotiate' | 'require';
}

// WebRTC configuration with STUN/TURN servers
export const webrtcConfig: WebRTCConfig = {
    iceServers: [
        // Google's public STUN servers
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302',
                'stun:stun3.l.google.com:19302',
                'stun:stun4.l.google.com:19302'
            ]
        },
        // Add your TURN server here for production
        // TURN servers are needed for NAT traversal when STUN fails
        ...(process.env.TURN_SERVER_URL ? [{
            urls: process.env.TURN_SERVER_URL,
            username: process.env.TURN_USERNAME || '',
            credential: process.env.TURN_CREDENTIAL || ''
        }] : [])
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// Audio constraints for voice chat
export const audioConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
    },
    video: false
};

// Video constraints (if needed later)
export const videoConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
    }
};

export default webrtcConfig;