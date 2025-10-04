import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/env';
import { IJWTPayload, TokenPair, UserRole } from '../types';
import RefreshToken from '../models/RefreshToken';

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
        return uuidv4();
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
        ipAddress: string
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

        await RefreshToken.create({
            userId,
            token,
            deviceInfo,
            ipAddress,
            expiresAt,
            isRevoked: false,
        });

        return token;
    }

    async verifyRefreshToken(token: string): Promise<string> {
        const refreshToken = await RefreshToken.findByToken(token);

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
        ipAddress: string
    ): Promise<string> {
        const userId = await this.verifyRefreshToken(oldToken);

        await RefreshToken.revokeToken(oldToken);

        const newToken = await this.createRefreshToken(userId, deviceInfo, ipAddress);

        return newToken;
    }

    async revokeAllUserTokens(userId: string): Promise<void> {
        await RefreshToken.revokeAllUserTokens(userId);
    }

    async revokeToken(token: string): Promise<void> {
        await RefreshToken.revokeToken(token);
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
}

export default new JWTService();