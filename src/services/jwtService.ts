// src/services/jwtService.ts - Updated with session support
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '@/config/env';
import { IJWTPayload, TokenPair, UserRole } from '@/types';
import RefreshToken from '@/models/RefreshToken';
import mongoose from 'mongoose';

class JWTService {

    generateAccessToken(userId: string, email: string, role: UserRole): string {
        const payload: IJWTPayload = {
            userId,
            email,
            role,
        };

        // ensure types match jsonwebtoken overloads
        const secret: jwt.Secret = config.jwt.accessSecret as unknown as jwt.Secret;
        const options: jwt.SignOptions = {
            expiresIn: config.jwt.accessExpiry as unknown as jwt.SignOptions['expiresIn'],
            issuer: 'ai-tutor-platform',
            audience: 'ai-tutor-users',
        };

        // jwt.sign has multiple overloads; pass explicitly typed secret and options to select the correct overload
        return jwt.sign(payload as jwt.JwtPayload, secret, options);
    }

    generateRefreshToken(): string {
        // Use Node's crypto.randomUUID() to avoid importing ESM-only `uuid` package at runtime
        return crypto.randomUUID();
    }

    verifyAccessToken(token: string): IJWTPayload {
        try {
            const decoded = jwt.verify(token, config.jwt.accessSecret, {
                issuer: 'ai-tutor-platform',
                audience: 'ai-tutor-users',
            }) as IJWTPayload;

            return decoded;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Access token expired');
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid access token');
            }
            throw new Error('Token verification failed');
        }
    }

    async createRefreshToken(
        userId: string,
        deviceInfo: string,
        ipAddress: string,
        session?: mongoose.ClientSession // ✅ Added session support
    ): Promise<string> {
        const token = this.generateRefreshToken();
        const expiresAt = new Date();

        const expiryValue = parseInt(config.jwt.refreshExpiry);
        const expiryUnit = config.jwt.refreshExpiry.slice(-1);

        if (expiryUnit === 'd') {
            expiresAt.setDate(expiresAt.getDate() + expiryValue);
        } else if (expiryUnit === 'h') {
            expiresAt.setHours(expiresAt.getHours() + expiryValue);
        }

        // ✅ Create with session if provided
        await RefreshToken.create(
            [
                {
                    userId,
                    token,
                    deviceInfo,
                    ipAddress,
                    expiresAt,
                    isRevoked: false,
                }
            ],
            session ? { session } : {}
        );

        return token;
    }

    async verifyRefreshToken(
        token: string,
        session?: mongoose.ClientSession // ✅ Added session support
    ): Promise<string> {
        // ✅ Pass session to findByToken
        const refreshToken = await RefreshToken.findByToken(token, session);

        if (!refreshToken) {
            throw new Error('Invalid refresh token');
        }

        if (refreshToken.isRevoked) {
            throw new Error('Refresh token has been revoked');
        }

        if (refreshToken.isExpired()) {
            throw new Error('Refresh token expired');
        }

        return refreshToken.userId;
    }

    async rotateRefreshToken(
        oldToken: string,
        deviceInfo: string,
        ipAddress: string,
        session?: mongoose.ClientSession // ✅ Added session support
    ): Promise<string> {
        // ✅ Verify with session
        const userId = await this.verifyRefreshToken(oldToken, session);

        // ✅ Revoke with session
        await RefreshToken.revokeToken(oldToken, session);

        // ✅ Create new token with session
        const newToken = await this.createRefreshToken(userId, deviceInfo, ipAddress, session);

        return newToken;
    }

    async revokeAllUserTokens(
        userId: string,
        session?: mongoose.ClientSession // ✅ Added session support
    ): Promise<void> {
        await RefreshToken.revokeAllUserTokens(userId, session);
    }

    async revokeToken(
        token: string,
        session?: mongoose.ClientSession // ✅ Added session support
    ): Promise<void> {
        await RefreshToken.revokeToken(token, session);
    }

    async generateTokenPair(
        userId: string,
        email: string,
        role: UserRole,
        deviceInfo: string,
        ipAddress: string
    ): Promise<TokenPair> {
        const accessToken = this.generateAccessToken(userId, email, role);
        const refreshToken = await this.createRefreshToken(userId, deviceInfo, ipAddress);

        return { accessToken, refreshToken };
    }

    /**
     * ✅ NEW: Get all active sessions for a user
     */
    async getUserSessions(userId: string): Promise<any[]> {
        return await RefreshToken.find({
            userId,
            isRevoked: false,
            expiresAt: { $gt: new Date() },
        })
            .select('deviceInfo ipAddress createdAt')
            .sort({ createdAt: -1 })
            .lean();
    }

    /**
     * ✅ NEW: Revoke specific session
     */
    async revokeSession(userId: string, sessionId: string): Promise<void> {
        await RefreshToken.updateOne(
            { _id: sessionId, userId },
            { isRevoked: true }
        );
    }

    /**
     * ✅ NEW: Decode token without verification (use cautiously)
     */
    decodeToken(token: string): IJWTPayload | null {
        try {
            const decoded = jwt.decode(token) as IJWTPayload;
            return decoded;
        } catch {
            return null;
        }
    }
}

export default new JWTService();