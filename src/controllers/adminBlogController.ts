// src/controllers/adminBlogController.ts
import { Response } from 'express';
import blogService from '@/services/blogService';
import uploadService from '@/services/uploadService';
import apiResponse from '@/utils/apiResponse';
import { asyncHandler } from '@/middlewares/errorMiddleware';
import { AuthRequest } from '@/types';
import Blog from '@/models/Blog';

class AdminBlogController {
    /**
     * GET /api/admin/blog/posts
     * Get all posts including drafts (Admin only)
     */
    getAllPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { page, limit, tag, category, featured, search, published } = req.query;

        const pagination = {
            page: parseInt(page as string) || 1,
            limit: Math.min(parseInt(limit as string) || 10, 50),
        };

        const filters: any = {};
        if (tag) filters.tag = tag as string;
        if (category) filters.category = category as string;
        if (featured !== undefined) filters.featured = featured === 'true';
        if (search) filters.search = search as string;

        // Admin can filter by published status
        if (published !== undefined) {
            const query: any = { ...filters };
            if (published === 'true') {
                query.published = true;
            } else if (published === 'false') {
                query.published = false;
            }
            // If not specified, show all (both published and draft)
        }

        // For admin, modify service to show all posts
        const allPostsQuery = Blog.find(filters.search ? { $text: { $search: filters.search } } : {});

        if (filters.tag) allPostsQuery.where('tags').in([filters.tag]);
        if (filters.category) allPostsQuery.where('category', filters.category);
        if (filters.featured !== undefined) allPostsQuery.where('featured', filters.featured);
        if (published === 'true') allPostsQuery.where('published', true);
        if (published === 'false') allPostsQuery.where('published', false);

        const skip = (pagination.page - 1) * pagination.limit;

        const [posts, total] = await Promise.all([
            allPostsQuery
                .sort({ updatedAt: -1 }) // Sort by last updated
                .skip(skip)
                .limit(pagination.limit)
                .select('-content') // Exclude content for list view
                .lean(),
            Blog.countDocuments(allPostsQuery.getQuery()),
        ]);

        const totalPages = Math.ceil(total / pagination.limit);

        apiResponse.success(res, 'Posts retrieved successfully', {
            data: posts,
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total,
                totalPages,
                hasNext: pagination.page < totalPages,
                hasPrev: pagination.page > 1,
            },
        });
    });

    /**
     * GET /api/admin/blog/posts/:slug
     * Get single post including drafts (Admin only)
     */
    getPost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const post = await Blog.findOne({ slug });

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        apiResponse.success(res, 'Post retrieved successfully', { post });
    });

    /**
     * POST /api/admin/blog/posts
     * Create new blog post (Admin only)
     */
    createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const postData = {
            ...req.body,
            authorId: req.user?.userId,
        };

        const post = await blogService.createPost(postData);

        apiResponse.created(res, 'Post created successfully', { post });
    });

    /**
     * PUT /api/admin/blog/posts/:slug
     * Update blog post (Admin only)
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
     * DELETE /api/admin/blog/posts/:slug
     * Delete blog post (Admin only)
     */
    deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const post = await Blog.findOne({ slug });

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        // Delete cover image if exists
        if (post.coverImage) {
            await uploadService.deleteImage(post.coverImage);
        }

        const deleted = await blogService.deletePost(slug);

        if (!deleted) {
            return apiResponse.notFound(res, 'Post not found');
        }

        apiResponse.success(res, 'Post deleted successfully');
    });

    /**
     * POST /api/admin/blog/posts/:slug/publish
     * Publish a draft post (Admin only)
     */
    publishPost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const post = await Blog.findOne({ slug });

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        post.published = true;
        post.publishedAt = new Date();
        await post.save();

        apiResponse.success(res, 'Post published successfully', { post });
    });

    /**
     * POST /api/admin/blog/posts/:slug/unpublish
     * Unpublish a post (make it draft) (Admin only)
     */
    unpublishPost = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const post = await Blog.findOne({ slug });

        if (!post) {
            return apiResponse.notFound(res, 'Post not found');
        }

        post.published = false;
        await post.save();

        apiResponse.success(res, 'Post unpublished successfully', { post });
    });

    /**
     * POST /api/admin/blog/upload/cover
     * Upload cover image (Admin only)
     */
    uploadCoverImage = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.file) {
            return apiResponse.badRequest(res, 'No file uploaded');
        }

        try {
            const url = await uploadService.uploadCoverImage(req.file);

            apiResponse.success(res, 'Cover image uploaded successfully', { url });
        } catch (error: any) {
            return apiResponse.badRequest(res, error.message);
        }
    });

    /**
     * POST /api/admin/blog/upload/inline
     * Upload inline image (Admin only)
     */
    uploadInlineImage = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.file) {
            return apiResponse.badRequest(res, 'No file uploaded');
        }

        try {
            const url = await uploadService.uploadInlineImage(req.file);

            apiResponse.success(res, 'Image uploaded successfully', { url });
        } catch (error: any) {
            return apiResponse.badRequest(res, error.message);
        }
    });

    /**
     * POST /api/admin/blog/upload/multiple
     * Upload multiple images (Admin only)
     */
    uploadMultipleImages = asyncHandler(async (req: AuthRequest, res: Response) => {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            return apiResponse.badRequest(res, 'No files uploaded');
        }

        try {
            const urls = await uploadService.uploadMultipleImages(req.files);

            apiResponse.success(res, 'Images uploaded successfully', { urls });
        } catch (error: any) {
            return apiResponse.badRequest(res, error.message);
        }
    });

    /**
     * DELETE /api/admin/blog/upload
     * Delete image (Admin only)
     */
    deleteImage = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { url } = req.body;

        if (!url) {
            return apiResponse.badRequest(res, 'Image URL is required');
        }

        const deleted = await uploadService.deleteImage(url);

        if (!deleted) {
            return apiResponse.badRequest(res, 'Failed to delete image');
        }

        apiResponse.success(res, 'Image deleted successfully');
    });

    /**
     * GET /api/admin/blog/stats
     * Get blog statistics (Admin only)
     */
    getStats = asyncHandler(async (_req: AuthRequest, res: Response) => {
        const [
            totalPosts,
            publishedPosts,
            draftPosts,
            totalViews,
            totalLikes,
            categoriesCount,
            tagsCount,
        ] = await Promise.all([
            Blog.countDocuments(),
            Blog.countDocuments({ published: true }),
            Blog.countDocuments({ published: false }),
            Blog.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
            Blog.aggregate([{ $group: { _id: null, total: { $sum: '$likes' } } }]),
            Blog.distinct('category'),
            Blog.aggregate([
                { $unwind: '$tags' },
                { $group: { _id: '$tags' } },
                { $count: 'total' },
            ]),
        ]);

        const stats = {
            totalPosts,
            publishedPosts,
            draftPosts,
            totalViews: totalViews[0]?.total || 0,
            totalLikes: totalLikes[0]?.total || 0,
            totalCategories: categoriesCount.length,
            totalTags: tagsCount[0]?.total || 0,
        };

        apiResponse.success(res, 'Stats retrieved successfully', stats);
    });
}

export default new AdminBlogController();
