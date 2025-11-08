import { Router } from 'express';
import {
    loginSchema,
    signupSchema,
    updateProfileSchema,
    changePasswordSchema,
} from '@/validators/authValidator';
import {
    authRateLimiter,
    passwordResetRateLimiter,
    sensitiveOperationRateLimiter
} from '@/middlewares/securityMiddleware';
import authController from '@/controllers/authController';
import { validateBody } from '@/middlewares/validationMiddleware';
import googleAuthController from '@/controllers/googleAuthController';
import { authenticate } from '@/middlewares/authMiddleware';

const router = Router();

// ========================================
// Public Auth Routes (with strict rate limiting)
// ========================================
router.post(
    '/signup',
    authRateLimiter,
    validateBody(signupSchema),
    authController.signup
);

router.post(
    '/login',
    authRateLimiter,
    validateBody(loginSchema),
    authController.login
);

// Refresh token - slightly less strict (users need this frequently)
router.post('/refresh', authController.refreshToken);

// ========================================
// Password Reset Routes (strict rate limiting)
// ========================================
router.post(
    '/request-password-reset',
    passwordResetRateLimiter, // ✅ 3 attempts per hour
    authController.requestPasswordReset
);

router.post(
    '/reset-password',
    passwordResetRateLimiter, // ✅ 3 attempts per hour
    authController.resetPassword
);

// ========================================
// Email Verification (moderate rate limiting)
// ========================================
router.post(
    '/verify-email',
    authRateLimiter, // ✅ 10 attempts per 15 min
    authController.verifyEmail
);

// ========================================
// Google OAuth Routes (no rate limit - handled by Google)
// ========================================
router.get('/google', googleAuthController.googleAuth);
router.get('/google/callback', googleAuthController.googleCallback);

// ========================================
// Protected Routes (require authentication)
// ========================================
router.post('/logout', authenticate, authController.logout);

router.post('/logout-all', authenticate, authController.logoutAll);

router.get('/profile', authenticate, authController.getProfile);

router.put(
    '/profile',
    authenticate,
    validateBody(updateProfileSchema),
    authController.updateProfile
);

// Change password - sensitive operation
router.put(
    '/change-password',
    authenticate,
    sensitiveOperationRateLimiter, // ✅ 5 attempts per hour
    validateBody(changePasswordSchema),
    authController.changePassword
);

// Auth verification - no rate limit (needed frequently)
router.get('/verify', authenticate, authController.verifyAuth);

export default router;