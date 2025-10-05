import { z } from 'zod';
import { UserRole } from '@/types';

export const emailSchema = z
    .string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email cannot exceed 255 characters')
    .toLowerCase()
    .trim();

export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const nameSchema = z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters')
    .trim()
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces');

export const roleSchema = z.nativeEnum(UserRole);

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
    role: roleSchema.optional().default(UserRole.STUDENT),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Email only validation (for forgot password, etc.)
export const emailOnlySchema = z.object({
    email: emailSchema,
});

// Password reset validation
export const passwordResetSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    password: passwordSchema,
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

// Update profile validation
export const updateProfileSchema = z.object({
    name: nameSchema.optional(),
    profileImage: z.string().url('Invalid URL format').optional(),
});

// Change password validation
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ['newPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;