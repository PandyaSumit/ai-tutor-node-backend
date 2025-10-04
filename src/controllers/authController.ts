import { Request, Response } from 'express';
import User from '../models/User';
import jwtService from '../services/jwtService';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailerService';
import cookieHelper, { COOKIE_NAMES } from '../utils/cookieHelper';
import apiResponse from '../utils/apiResponse';
import { AuthRequest, UserRole } from '../types';
import crypto from 'crypto';
import { asyncHandler } from '../middlewares/errorMiddleware';

class AuthController {
    signup = asyncHandler(async (req: Request, res: Response) => {
        const { email, password, name, role } = req.body;

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return apiResponse.conflict(res, 'User with this email already exists');
        }

        // Create new user
        const user = await User.create({
            email,
            password,
            name,
            role: role || UserRole.STUDENT,
            isEmailVerified: false,
        });

        // Generate email verification token
        const verificationToken = crypto.randomUUID();
        const verificationExpires = new Date();
        verificationExpires.setHours(verificationExpires.getHours() + 24); // 24 hours

        user.verificationToken = verificationToken;
        user.verificationExpires = verificationExpires;
        await user.save();

        // Send verification email
        try {
            await sendVerificationEmail(user.email, verificationToken);
        } catch (err) {
            console.error('Error sending verification email:', err);
        }

        // Generate tokens
        const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
        const ipAddress = req.ip || 'Unknown IP';

        const tokens = await jwtService.generateTokenPair(
            String(user._id),
            user.email,
            user.role,
            deviceInfo,
            ipAddress
        );

        // Set cookies
        cookieHelper.setTokens(res, tokens.accessToken, tokens.refreshToken);

        apiResponse.created(res, 'User registered successfully', {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            accessToken: tokens.accessToken,
        });
    });

    login = asyncHandler(async (req: Request, res: Response) => {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return apiResponse.unauthorized(res, 'Invalid email or password');
        }

        if (!user.password) {
            return apiResponse.badRequest(res, 'Please login with Google');
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return apiResponse.unauthorized(res, 'Invalid email or password');
        }

        // Generate tokens
        const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
        const ipAddress = req.ip || 'Unknown IP';

        const tokens = await jwtService.generateTokenPair(
            String(user._id),
            user.email,
            user.role,
            deviceInfo,
            ipAddress
        );

        // Set cookies
        cookieHelper.setTokens(res, tokens.accessToken, tokens.refreshToken);

        apiResponse.success(res, 'Login successful', {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                profileImage: user.profileImage,
            },
            accessToken: tokens.accessToken,
        });
    });

    refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

        if (!refreshToken) {
            return apiResponse.unauthorized(res, 'Refresh token not found');
        }

        try {
            const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
            const ipAddress = req.ip || 'Unknown IP';

            // Rotate refresh token
            const newRefreshToken = await jwtService.rotateRefreshToken(
                refreshToken,
                deviceInfo,
                ipAddress
            );

            // Get user info
            const userId = await jwtService.verifyRefreshToken(newRefreshToken);
            const user = await User.findById(userId);

            if (!user) {
                return apiResponse.unauthorized(res, 'User not found');
            }

            // Generate new access token
            const accessToken = jwtService.generateAccessToken(
                String(user._id),
                user.email,
                user.role
            );

            // Set new cookies
            cookieHelper.setTokens(res, accessToken, newRefreshToken);

            apiResponse.success(res, 'Token refreshed successfully', {
                accessToken,
            });
        } catch (error: any) {
            cookieHelper.clearTokens(res);
            return apiResponse.unauthorized(res, error.message || 'Invalid refresh token');
        }
    });

    logout = asyncHandler(async (req: AuthRequest, res: Response) => {
        const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

        if (refreshToken) {
            try {
                await jwtService.revokeToken(refreshToken);
            } catch (error) {
                console.error('Error revoking token:', error);
            }
        }

        // Clear cookies
        cookieHelper.clearTokens(res);

        apiResponse.success(res, 'Logout successful');
    });

    logoutAll = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.user) {
            return apiResponse.unauthorized(res, 'User not authenticated');
        }

        await jwtService.revokeAllUserTokens(req.user.userId);

        // Clear cookies
        cookieHelper.clearTokens(res);

        apiResponse.success(res, 'Logged out from all devices successfully');
    });

    getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.user) {
            return apiResponse.unauthorized(res, 'User not authenticated');
        }

        const user = await User.findById(req.user.userId);

        if (!user) {
            return apiResponse.notFound(res, 'User not found');
        }

        apiResponse.success(res, 'Profile retrieved successfully', {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                profileImage: user.profileImage,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt,
            },
        });
    });

    updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.user) {
            return apiResponse.unauthorized(res, 'User not authenticated');
        }

        const { name, profileImage } = req.body;

        const user = await User.findById(req.user.userId);

        if (!user) {
            return apiResponse.notFound(res, 'User not found');
        }

        if (name) user.name = name;
        if (profileImage) user.profileImage = profileImage;

        await user.save();

        apiResponse.success(res, 'Profile updated successfully', {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                profileImage: user.profileImage,
            },
        });
    });

    changePassword = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.user) {
            return apiResponse.unauthorized(res, 'User not authenticated');
        }

        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.user.userId).select('+password');

        if (!user) {
            return apiResponse.notFound(res, 'User not found');
        }

        if (!user.password) {
            return apiResponse.badRequest(res, 'Cannot change password for OAuth accounts');
        }

        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            return apiResponse.unauthorized(res, 'Current password is incorrect');
        }

        user.password = newPassword;
        await user.save();

        await jwtService.revokeAllUserTokens(req.user.userId);
        cookieHelper.clearTokens(res);

        apiResponse.success(res, 'Password changed successfully. Please login again.');
    });

    // Request password reset
    requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.body;
        const user = await User.findByEmail(email);
        if (!user) return apiResponse.notFound(res, 'User not found');

        const token = crypto.randomUUID();
        const expires = new Date();
        expires.setHours(expires.getHours() + 2); // 2 hours

        user.passwordResetToken = token;
        user.passwordResetExpires = expires;
        await user.save();

        try {
            await sendPasswordResetEmail(user.email, token);
        } catch (err) {
            console.error('Error sending password reset email:', err);
        }

        apiResponse.success(res, 'Password reset email sent');
    });

    // Reset password
    resetPassword = asyncHandler(async (req: Request, res: Response) => {
        const { token, password, confirmPassword } = req.body;
        if (!token) return apiResponse.badRequest(res, 'Token is required');
        if (!password || !confirmPassword) return apiResponse.badRequest(res, 'Password and confirmPassword are required');
        if (password !== confirmPassword) return apiResponse.badRequest(res, 'Passwords do not match');

        const user = await User.findOne({ passwordResetToken: token }).select('+passwordResetToken +passwordResetExpires');
        if (!user) return apiResponse.notFound(res, 'Invalid token');
        if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) return apiResponse.badRequest(res, 'Token expired');

        user.password = password;
        user.passwordResetToken = undefined as any;
        user.passwordResetExpires = undefined as any;
        await user.save();

        apiResponse.success(res, 'Password reset successful');
    });

    // Verify email
    verifyEmail = asyncHandler(async (req: Request, res: Response) => {
        const { token } = req.body;
        if (!token) return apiResponse.badRequest(res, 'Token is required');

        const user = await User.findOne({ verificationToken: token }).select('+verificationToken +verificationExpires');
        if (!user) return apiResponse.notFound(res, 'Invalid verification token');
        if (!user.verificationExpires || user.verificationExpires < new Date()) return apiResponse.badRequest(res, 'Verification token expired');

        user.isEmailVerified = true;
        user.verificationToken = undefined as any;
        user.verificationExpires = undefined as any;
        await user.save();

        apiResponse.success(res, 'Email verified successfully');
    });

    verifyAuth = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.user) {
            return apiResponse.unauthorized(res, 'Not authenticated');
        }

        const user = await User.findById(req.user.userId);

        if (!user) {
            return apiResponse.unauthorized(res, 'User not found');
        }

        apiResponse.success(res, 'Authenticated', {
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                profileImage: user.profileImage,
            },
        });
    });
}

export default new AuthController();