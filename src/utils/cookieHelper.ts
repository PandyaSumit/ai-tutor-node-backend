import { Response } from 'express';
import config from '@/config/env';

export const COOKIE_NAMES = {
    ACCESS_TOKEN: 'accessToken',
    REFRESH_TOKEN: 'refreshToken',
} as const;

class CookieHelper {
    private getAccessTokenOptions() {
        const isProduction = config.nodeEnv === 'production';

        return {
            httpOnly: false,
            secure: config.cookie.secure,
            sameSite: config.cookie.sameSite as 'strict' | 'lax' | 'none',
            domain: isProduction ? config.cookie.domain : undefined,
            maxAge: 15 * 60 * 1000,
            path: '/',
        };
    }

    private getRefreshTokenOptions() {
        const isProduction = config.nodeEnv === 'production';

        return {
            httpOnly: true,
            secure: config.cookie.secure,
            sameSite: config.cookie.sameSite as 'strict' | 'lax' | 'none',
            domain: isProduction ? config.cookie.domain : undefined,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        };
    }

    setAccessToken(res: Response, token: string): void {
        res.cookie(COOKIE_NAMES.ACCESS_TOKEN, token, this.getAccessTokenOptions());
    }

    setRefreshToken(res: Response, token: string): void {
        res.cookie(COOKIE_NAMES.REFRESH_TOKEN, token, this.getRefreshTokenOptions());
    }

    setTokens(res: Response, accessToken: string, refreshToken: string): void {
        this.setAccessToken(res, accessToken);
        this.setRefreshToken(res, refreshToken);
    }

    clearAccessToken(res: Response): void {
        const isProduction = config.nodeEnv === 'production';

        res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, {
            httpOnly: true,
            secure: config.cookie.secure,
            sameSite: config.cookie.sameSite as 'strict' | 'lax' | 'none',
            domain: isProduction ? config.cookie.domain : undefined,
            path: '/',
        });
    }

    clearRefreshToken(res: Response): void {
        const isProduction = config.nodeEnv === 'production';

        res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, {
            httpOnly: true,
            secure: config.cookie.secure,
            sameSite: config.cookie.sameSite as 'strict' | 'lax' | 'none',
            domain: isProduction ? config.cookie.domain : undefined,
            path: '/',
        });
    }

    clearTokens(res: Response): void {
        this.clearAccessToken(res);
        this.clearRefreshToken(res);
    }
}

export default new CookieHelper();