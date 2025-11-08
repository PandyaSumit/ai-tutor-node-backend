import { Request, Response, NextFunction } from 'express';
import passport from '@/config/passport';
import jwtService from '@/services/jwtService';
import cookieHelper from '@/utils/cookieHelper';
import config from '@/config/env';
import { IUserDocument } from '@/models/User';

class GoogleAuthController {
    googleAuth = passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
    });

    googleCallback = (req: Request, res: Response, next: NextFunction) => {
        passport.authenticate('google', { session: false }, async (err, user: IUserDocument) => {
            try {
                if (err || !user) {
                    return res.redirect(
                        `${config.frontendUrl}/auth/error?message=${encodeURIComponent(err?.message || 'Authentication failed')}`
                    );
                }

                const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
                const ipAddress = req.ip || 'Unknown IP';
                const tokens = await jwtService.generateTokenPair(
                    String(user._id),
                    user.email,
                    user.role,
                    deviceInfo,
                    ipAddress
                );

                cookieHelper.setTokens(res, tokens.accessToken, tokens.refreshToken);

                res.redirect(`${config.frontendUrl}/auth/success`);
            } catch (error) {
                logger.error('Token generation error:', error);
                res.redirect(
                    `${config.frontendUrl}/auth/error?message=Authentication%20failed`
                );
            }
        })(req, res, next);
    };
}

export default new GoogleAuthController();