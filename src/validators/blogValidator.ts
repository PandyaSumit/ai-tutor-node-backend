// src/validators/blogValidator.ts
import { z } from 'zod';

// Validation schema for TOC item
const tocItemSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        id: z.string().min(1, 'TOC item ID is required'),
        title: z.string().min(1, 'TOC item title is required'),
        level: z.number().min(2).max(4),
        children: z.array(tocItemSchema).optional(),
    })
);

// Schema for getting all posts with pagination and filters
export const getPostsSchema = z.object({
    page: z
        .string()
        .optional()
        .default('1')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val > 0, { message: 'Page must be greater than 0' }),
    limit: z
        .string()
        .optional()
        .default('10')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val > 0 && val <= 50, {
            message: 'Limit must be between 1 and 50',
        }),
    tag: z.string().optional(),
    category: z.string().optional(),
    featured: z
        .string()
        .optional()
        .transform((val) => {
            if (val === 'true') return true;
            if (val === 'false') return false;
            return undefined;
        }),
    search: z.string().optional(),
});

// Schema for getting post by slug
export const getPostBySlugSchema = z.object({
    slug: z
        .string()
        .min(1, 'Slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
});

// Schema for search posts
export const searchPostsSchema = z.object({
    q: z.string().min(1, 'Search query is required'),
    limit: z
        .string()
        .optional()
        .default('10')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val > 0 && val <= 50, {
            message: 'Limit must be between 1 and 50',
        }),
});

// Schema for creating a blog post
export const createPostSchema = z.object({
    slug: z
        .string()
        .min(1, 'Slug is required')
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
        .optional(),
    title: z
        .string()
        .min(5, 'Title must be at least 5 characters')
        .max(200, 'Title cannot exceed 200 characters'),
    description: z
        .string()
        .min(20, 'Description must be at least 20 characters')
        .max(500, 'Description cannot exceed 500 characters'),
    content: z.string().min(50, 'Content must be at least 50 characters'),
    excerpt: z.string().max(300, 'Excerpt cannot exceed 300 characters').optional(),
    author: z.string().min(2, 'Author name must be at least 2 characters'),
    publishedAt: z
        .string()
        .optional()
        .default(new Date().toISOString())
        .refine((val) => !isNaN(Date.parse(val)), {
            message: 'Invalid date format',
        }),
    tags: z
        .array(z.string().min(1))
        .min(1, 'At least one tag is required')
        .max(10, 'Cannot have more than 10 tags'),
    category: z.string().min(2, 'Category is required'),
    coverImage: z.string().url('Invalid URL format').optional(),
    featured: z.boolean().optional().default(false),
    tableOfContents: z.array(tocItemSchema).optional(),
    published: z.boolean().optional().default(true),
});

// Schema for updating a blog post
export const updatePostSchema = z.object({
    title: z
        .string()
        .min(5, 'Title must be at least 5 characters')
        .max(200, 'Title cannot exceed 200 characters')
        .optional(),
    description: z
        .string()
        .min(20, 'Description must be at least 20 characters')
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
    content: z.string().min(50, 'Content must be at least 50 characters').optional(),
    excerpt: z.string().max(300, 'Excerpt cannot exceed 300 characters').optional(),
    author: z.string().min(2, 'Author name must be at least 2 characters').optional(),
    publishedAt: z
        .string()
        .optional()
        .refine((val) => !val || !isNaN(Date.parse(val)), {
            message: 'Invalid date format',
        }),
    tags: z
        .array(z.string().min(1))
        .min(1, 'At least one tag is required')
        .max(10, 'Cannot have more than 10 tags')
        .optional(),
    category: z.string().min(2, 'Category is required').optional(),
    coverImage: z.string().url('Invalid URL format').optional(),
    featured: z.boolean().optional(),
    tableOfContents: z.array(tocItemSchema).optional(),
    published: z.boolean().optional(),
});

// Type exports
export type GetPostsInput = z.infer<typeof getPostsSchema>;
export type GetPostBySlugInput = z.infer<typeof getPostBySlugSchema>;
export type SearchPostsInput = z.infer<typeof searchPostsSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
