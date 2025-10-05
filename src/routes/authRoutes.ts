import { Router } from 'express';
import {
    loginSchema,
    signupSchema,
    updateProfileSchema,
    changePasswordSchema,
} from '@/validators/authValidator';
import { authRateLimiter } from '@/middlewares/securityMiddleware';
import authController from '@/controllers/authController';
import { validateBody } from '@/middlewares/validationMiddleware';
import googleAuthController from '@/controllers/googleAuthController';
import { authenticate } from '@/middlewares/authMiddleware';

const router = Router();

// Public routes (with rate limiting)
router.post('/signup', authRateLimiter, validateBody(signupSchema), authController.signup);
router.post('/login', authRateLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);

// Password reset / email verification
router.post('/request-password-reset', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);
router.post('/verify-email', authController.verifyEmail);

// Google OAuth routes
router.get('/google', googleAuthController.googleAuth);
router.get('/google/callback', googleAuthController.googleCallback);

// Protected routes (require authentication)
router.post('/logout', authenticate, authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, validateBody(updateProfileSchema), authController.updateProfile);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), authController.changePassword);
router.get('/verify', authenticate, authController.verifyAuth);

export default router;