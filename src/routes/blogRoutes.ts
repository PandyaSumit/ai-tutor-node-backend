// src/routes/blogRoutes.ts
import { Router } from 'express';
import blogController from '@/controllers/blogController';
import {
    getPostsSchema,
    getPostBySlugSchema,
    searchPostsSchema,
    createPostSchema,
    updatePostSchema,
} from '@/validators/blogValidator';
import { validateQuery, validateParams, validateBody } from '@/middlewares/validationMiddleware';
import { authenticate, authorize } from '@/middlewares/authMiddleware';
import { UserRole } from '@/types';

const router = Router();

// Public routes - Read operations
router.get('/posts', validateQuery(getPostsSchema), blogController.getAllPosts);
router.get('/posts/:slug', validateParams(getPostBySlugSchema), blogController.getPostBySlug);
router.get('/tags', blogController.getAllTags);
router.get('/categories', blogController.getAllCategories);
router.get('/search', validateQuery(searchPostsSchema), blogController.searchPosts);
router.get('/featured', blogController.getFeaturedPosts);
router.get('/recent', blogController.getRecentPosts);
router.get('/posts/:slug/related', validateParams(getPostBySlugSchema), blogController.getRelatedPosts);

// Protected routes - Admin only (Create, Update, Delete)
router.post(
    '/posts',
    authenticate,
    authorize(UserRole.ADMIN),
    validateBody(createPostSchema),
    blogController.createPost
);

router.put(
    '/posts/:slug',
    authenticate,
    authorize(UserRole.ADMIN),
    validateParams(getPostBySlugSchema),
    validateBody(updatePostSchema),
    blogController.updatePost
);

router.delete(
    '/posts/:slug',
    authenticate,
    authorize(UserRole.ADMIN),
    validateParams(getPostBySlugSchema),
    blogController.deletePost
);

export default router;
