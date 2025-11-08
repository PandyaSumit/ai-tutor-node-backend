// src/routes/adminBlogRoutes.ts
import { Router } from 'express';
import adminBlogController from '@/controllers/adminBlogController';
import adminMetaController from '@/controllers/adminMetaController';
import { authenticate, authorize } from '@/middlewares/authMiddleware';
import { verifyCsrfToken, getCsrfToken } from '@/middlewares/csrfMiddleware';
import { UserRole } from '@/types';
import { blogImageUpload } from '@/services/uploadService';
import {
    createPostSchema,
    updatePostSchema,
    getPostBySlugSchema,
} from '@/validators/blogValidator';
import { validateBody, validateParams } from '@/middlewares/validationMiddleware';

const router = Router();

/**
 * All routes require:
 * 1. Authentication (valid JWT)
 * 2. Admin role
 * 3. CSRF token (for state-changing operations)
 */

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize(UserRole.ADMIN));

// CSRF token endpoint (GET - no CSRF required)
router.get('/csrf-token', getCsrfToken);

// Blog post management
router.get('/posts', adminBlogController.getAllPosts);
router.get('/posts/:slug', validateParams(getPostBySlugSchema), adminBlogController.getPost);

router.post(
    '/posts',
    verifyCsrfToken,
    validateBody(createPostSchema),
    adminBlogController.createPost
);

router.put(
    '/posts/:slug',
    verifyCsrfToken,
    validateParams(getPostBySlugSchema),
    validateBody(updatePostSchema),
    adminBlogController.updatePost
);

router.delete(
    '/posts/:slug',
    verifyCsrfToken,
    validateParams(getPostBySlugSchema),
    adminBlogController.deletePost
);

// Publish/Unpublish
router.post(
    '/posts/:slug/publish',
    verifyCsrfToken,
    validateParams(getPostBySlugSchema),
    adminBlogController.publishPost
);

router.post(
    '/posts/:slug/unpublish',
    verifyCsrfToken,
    validateParams(getPostBySlugSchema),
    adminBlogController.unpublishPost
);

// Image upload endpoints
router.post(
    '/upload/cover',
    verifyCsrfToken,
    blogImageUpload.single('image'),
    adminBlogController.uploadCoverImage
);

router.post(
    '/upload/inline',
    verifyCsrfToken,
    blogImageUpload.single('image'),
    adminBlogController.uploadInlineImage
);

router.post(
    '/upload/multiple',
    verifyCsrfToken,
    blogImageUpload.array('images', 10), // Max 10 images
    adminBlogController.uploadMultipleImages
);

router.delete('/upload', verifyCsrfToken, adminBlogController.deleteImage);

// Statistics
router.get('/stats', adminBlogController.getStats);

// ==================== CATEGORIES ====================
router.get('/categories', adminMetaController.getCategories);
router.post('/categories', verifyCsrfToken, adminMetaController.createCategory);
router.put('/categories/:slug', verifyCsrfToken, adminMetaController.updateCategory);
router.delete('/categories/:slug', verifyCsrfToken, adminMetaController.deleteCategory);

// ==================== TAGS ====================
router.get('/tags', adminMetaController.getTags);
router.post('/tags', verifyCsrfToken, adminMetaController.createTag);
router.put('/tags/:slug', verifyCsrfToken, adminMetaController.updateTag);
router.delete('/tags/:slug', verifyCsrfToken, adminMetaController.deleteTag);

// ==================== SERIES ====================
router.get('/series', adminMetaController.getSeries);
router.post('/series', verifyCsrfToken, adminMetaController.createSeries);
router.put('/series/:slug', verifyCsrfToken, adminMetaController.updateSeries);
router.delete('/series/:slug', verifyCsrfToken, adminMetaController.deleteSeries);

export default router;
