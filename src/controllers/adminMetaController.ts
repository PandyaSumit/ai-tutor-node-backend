// src/controllers/adminMetaController.ts
import { Response } from 'express';
import { BlogCategory, BlogTag, BlogSeries } from '@/models/BlogMeta';
import apiResponse from '@/utils/apiResponse';
import { asyncHandler } from '@/middlewares/errorMiddleware';
import { AuthRequest } from '@/types';

class AdminMetaController {
    // ==================== CATEGORIES ====================

    /**
     * GET /api/admin/blog/categories
     */
    getCategories = asyncHandler(async (_req: AuthRequest, res: Response) => {
        const categories = await BlogCategory.find().sort({ order: 1, name: 1 });
        apiResponse.success(res, 'Categories retrieved successfully', { categories });
    });

    /**
     * POST /api/admin/blog/categories
     */
    createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug, name, description, icon, color, order } = req.body;

        const existingCategory = await BlogCategory.findOne({ slug });
        if (existingCategory) {
            return apiResponse.conflict(res, 'Category with this slug already exists');
        }

        const category = await BlogCategory.create({
            slug,
            name,
            description,
            icon,
            color,
            order,
        });

        apiResponse.created(res, 'Category created successfully', { category });
    });

    /**
     * PUT /api/admin/blog/categories/:slug
     */
    updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;
        const { name, description, icon, color, order } = req.body;

        const category = await BlogCategory.findOneAndUpdate(
            { slug },
            { name, description, icon, color, order },
            { new: true, runValidators: true }
        );

        if (!category) {
            return apiResponse.notFound(res, 'Category not found');
        }

        apiResponse.success(res, 'Category updated successfully', { category });
    });

    /**
     * DELETE /api/admin/blog/categories/:slug
     */
    deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const category = await BlogCategory.findOne({ slug });

        if (!category) {
            return apiResponse.notFound(res, 'Category not found');
        }

        if (category.postCount > 0) {
            return apiResponse.badRequest(
                res,
                'Cannot delete category with existing posts'
            );
        }

        await BlogCategory.deleteOne({ slug });

        apiResponse.success(res, 'Category deleted successfully');
    });

    // ==================== TAGS ====================

    /**
     * GET /api/admin/blog/tags
     */
    getTags = asyncHandler(async (_req: AuthRequest, res: Response) => {
        const tags = await BlogTag.find().sort({ name: 1 });
        apiResponse.success(res, 'Tags retrieved successfully', { tags });
    });

    /**
     * POST /api/admin/blog/tags
     */
    createTag = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug, name, description } = req.body;

        const existingTag = await BlogTag.findOne({ slug });
        if (existingTag) {
            return apiResponse.conflict(res, 'Tag with this slug already exists');
        }

        const tag = await BlogTag.create({ slug, name, description });

        apiResponse.created(res, 'Tag created successfully', { tag });
    });

    /**
     * PUT /api/admin/blog/tags/:slug
     */
    updateTag = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;
        const { name, description } = req.body;

        const tag = await BlogTag.findOneAndUpdate(
            { slug },
            { name, description },
            { new: true, runValidators: true }
        );

        if (!tag) {
            return apiResponse.notFound(res, 'Tag not found');
        }

        apiResponse.success(res, 'Tag updated successfully', { tag });
    });

    /**
     * DELETE /api/admin/blog/tags/:slug
     */
    deleteTag = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const tag = await BlogTag.findOne({ slug });

        if (!tag) {
            return apiResponse.notFound(res, 'Tag not found');
        }

        if (tag.postCount > 0) {
            return apiResponse.badRequest(
                res,
                'Cannot delete tag with existing posts'
            );
        }

        await BlogTag.deleteOne({ slug });

        apiResponse.success(res, 'Tag deleted successfully');
    });

    // ==================== SERIES ====================

    /**
     * GET /api/admin/blog/series
     */
    getSeries = asyncHandler(async (_req: AuthRequest, res: Response) => {
        const series = await BlogSeries.find().sort({ name: 1 });
        apiResponse.success(res, 'Series retrieved successfully', { series });
    });

    /**
     * POST /api/admin/blog/series
     */
    createSeries = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug, name, description, coverImage } = req.body;

        const existingSeries = await BlogSeries.findOne({ slug });
        if (existingSeries) {
            return apiResponse.conflict(res, 'Series with this slug already exists');
        }

        const series = await BlogSeries.create({
            slug,
            name,
            description,
            coverImage,
        });

        apiResponse.created(res, 'Series created successfully', { series });
    });

    /**
     * PUT /api/admin/blog/series/:slug
     */
    updateSeries = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;
        const { name, description, coverImage } = req.body;

        const series = await BlogSeries.findOneAndUpdate(
            { slug },
            { name, description, coverImage },
            { new: true, runValidators: true }
        );

        if (!series) {
            return apiResponse.notFound(res, 'Series not found');
        }

        apiResponse.success(res, 'Series updated successfully', { series });
    });

    /**
     * DELETE /api/admin/blog/series/:slug
     */
    deleteSeries = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { slug } = req.params;

        const series = await BlogSeries.findOne({ slug });

        if (!series) {
            return apiResponse.notFound(res, 'Series not found');
        }

        if (series.postCount > 0) {
            return apiResponse.badRequest(
                res,
                'Cannot delete series with existing posts'
            );
        }

        await BlogSeries.deleteOne({ slug });

        apiResponse.success(res, 'Series deleted successfully');
    });
}

export default new AdminMetaController();
