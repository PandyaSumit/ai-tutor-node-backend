// src/controllers/blogController.ts
import { Request, Response } from 'express';
import blogService from '@/services/blogService';
import apiResponse from '@/utils/apiResponse';
import { asyncHandler } from '@/middlewares/errorMiddleware';
import { AuthRequest } from '@/types';

class BlogController {
    /**
     * GET /api/blog/posts
     * Get all blog posts with pagination and filters
     */
    getAllPosts = asyncHandler(async (req: Request, res: Response) => {
        const { page, limit, tag, category, featured, search } = req.query;

        const pagination = {
            page: parseInt(page as string) || 1,
            limit: Math.min(parseInt(limit as string) || 10, 50),
        };

        const filters: any = {};
        if (tag) filters.tag = tag as string;
        if (category) filters.category = category as string;
        if (featured !== undefined) {
            filters.featured = featured === 'true';
        }
        if (search) filters.search = search as string;

        const result = await blogService.getAllPosts(pagination, filters);

        apiResponse.success(res, 'Posts retrieved successfully', result);
    });

    /**
     * GET /api/blog/posts/:slug
     * Get a single blog post by slug
     */
    getPostBySlug = asyncHandler(async (req: Request, res: Response) => {
        const { slug } = req.params;

        const post = await blogService.getPostBySlug(slug);

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        apiResponse.success(res, 'Post retrieved successfully', { post });
    });

    /**
     * GET /api/blog/tags
     * Get all unique tags with post counts
     */
    getAllTags = asyncHandler(async (_req: Request, res: Response) => {
        const tags = await blogService.getAllTags();

        apiResponse.success(res, 'Tags retrieved successfully', { tags });
    });

    /**
     * GET /api/blog/categories
     * Get all categories with post counts
     */
    getAllCategories = asyncHandler(async (_req: Request, res: Response) => {
        const categories = await blogService.getAllCategories();

        apiResponse.success(res, 'Categories retrieved successfully', { categories });
    });

    /**
     * GET /api/blog/search
     * Search posts by query
     */
    searchPosts = asyncHandler(async (req: Request, res: Response) => {
        const { q, limit } = req.query;

        if (!q) {
            return apiResponse.badRequest(res, 'Search query is required');
        }

        const searchLimit = Math.min(parseInt(limit as string) || 10, 50);
        const results = await blogService.searchPosts(q as string, searchLimit);

        apiResponse.success(res, 'Search completed successfully', { results });
    });

    /**
     * GET /api/blog/featured
     * Get featured posts
     */
    getFeaturedPosts = asyncHandler(async (req: Request, res: Response) => {
        const { limit } = req.query;
        const featuredLimit = Math.min(parseInt(limit as string) || 5, 20);

        const posts = await blogService.getFeaturedPosts(featuredLimit);

        apiResponse.success(res, 'Featured posts retrieved successfully', { posts });
    });

    /**
     * GET /api/blog/recent
     * Get recent posts
     */
    getRecentPosts = asyncHandler(async (req: Request, res: Response) => {
        const { limit } = req.query;
        const recentLimit = Math.min(parseInt(limit as string) || 5, 20);

        const posts = await blogService.getRecentPosts(recentLimit);

        apiResponse.success(res, 'Recent posts retrieved successfully', { posts });
    });

    /**
     * GET /api/blog/posts/:slug/related
     * Get related posts for a specific post
     */
    getRelatedPosts = asyncHandler(async (req: Request, res: Response) => {
        const { slug } = req.params;
        const { limit } = req.query;
        const relatedLimit = Math.min(parseInt(limit as string) || 4, 10);

        const posts = await blogService.getRelatedPosts(slug, relatedLimit);

        apiResponse.success(res, 'Related posts retrieved successfully', { posts });
    });

    /**
     * POST /api/blog/posts
     * Create a new blog post (Admin only)
     */
    createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const postData = req.body;

        const post = await blogService.createPost(postData);

        apiResponse.created(res, 'Post created successfully', { post });
    });

    /**
     * PUT /api/blog/posts/:slug
     * Update a blog post (Admin only)
     */
    updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;
        const postData = req.body;

        const post = await blogService.updatePost(slug, postData);

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        apiResponse.success(res, 'Post updated successfully', { post });
    });

    /**
     * DELETE /api/blog/posts/:slug
     * Delete a blog post (Admin only)
     */
    deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const deleted = await blogService.deletePost(slug);

        if (!deleted) {
            return apiResponse.notFound(res, 'Post not found');
        }

        apiResponse.success(res, 'Post deleted successfully');
    });
}

export default new BlogController();
