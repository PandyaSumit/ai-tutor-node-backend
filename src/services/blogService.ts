// src/services/blogService.ts
import Blog, { IBlogDocument } from '@/models/Blog';

export interface PaginationParams {
    page: number;
    limit: number;
}

export interface BlogFilters {
    tag?: string;
    category?: string;
    featured?: boolean;
    search?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface TagWithCount {
    slug: string;
    name: string;
    count: number;
}

export interface SearchResult {
    slug: string;
    title: string;
    excerpt: string;
    relevance: number;
}

class BlogService {
    /**
     * Get all posts with pagination and filters
     */
    async getAllPosts(
        pagination: PaginationParams,
        filters: BlogFilters = {}
    ): Promise<PaginatedResult<IBlogDocument>> {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query: any = { published: true };

        if (filters.tag) {
            query.tags = { $in: [filters.tag.toLowerCase()] };
        }

        if (filters.category) {
            query.category = filters.category.toLowerCase();
        }

        if (filters.featured !== undefined) {
            query.featured = filters.featured;
        }

        if (filters.search) {
            query.$text = { $search: filters.search };
        }

        // Execute query
        const [posts, total] = await Promise.all([
            Blog.find(query)
                .sort({ publishedAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-content -tableOfContents') // Exclude heavy fields for list view
                .lean(),
            Blog.countDocuments(query),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: posts as unknown as IBlogDocument[],
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }

    /**
     * Get a single post by slug
     */
    async getPostBySlug(slug: string): Promise<IBlogDocument | null> {
        const post = await Blog.findBySlug(slug);
        return post;
    }

    /**
     * Get all unique tags with post counts
     */
    async getAllTags(): Promise<TagWithCount[]> {
        const result = await Blog.aggregate([
            { $match: { published: true } },
            { $unwind: '$tags' },
            {
                $group: {
                    _id: '$tags',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]);

        return result.map((item) => ({
            slug: item._id,
            name: this.formatTagName(item._id),
            count: item.count,
        }));
    }

    /**
     * Search posts by query
     */
    async searchPosts(query: string, limit: number = 10): Promise<SearchResult[]> {
        const posts = await Blog.find(
            {
                $text: { $search: query },
                published: true,
            },
            {
                score: { $meta: 'textScore' },
            }
        )
            .sort({ score: { $meta: 'textScore' } })
            .limit(limit)
            .select('slug title excerpt')
            .lean();

        return posts.map((post: any) => ({
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            relevance: post.score ? Math.min(post.score / 10, 1) : 0.5,
        }));
    }

    /**
     * Get all categories with post counts
     */
    async getAllCategories(): Promise<{ category: string; count: number }[]> {
        const result = await Blog.aggregate([
            { $match: { published: true } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]);

        return result.map((item) => ({
            category: item._id,
            count: item.count,
        }));
    }

    /**
     * Get featured posts
     */
    async getFeaturedPosts(limit: number = 5): Promise<IBlogDocument[]> {
        const posts = await Blog.find({ published: true, featured: true })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .select('-content -tableOfContents')
            .lean();

        return posts as unknown as IBlogDocument[];
    }

    /**
     * Get recent posts
     */
    async getRecentPosts(limit: number = 5): Promise<IBlogDocument[]> {
        const posts = await Blog.find({ published: true })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .select('-content -tableOfContents')
            .lean();

        return posts as unknown as IBlogDocument[];
    }

    /**
     * Get related posts by tags and category
     */
    async getRelatedPosts(slug: string, limit: number = 4): Promise<IBlogDocument[]> {
        const currentPost = await Blog.findOne({ slug, published: true });

        if (!currentPost) {
            return [];
        }

        const posts = await Blog.find({
            published: true,
            slug: { $ne: slug },
            $or: [
                { tags: { $in: currentPost.tags } },
                { category: currentPost.category },
            ],
        })
            .sort({ publishedAt: -1 })
            .limit(limit)
            .select('-content -tableOfContents')
            .lean();

        return posts as unknown as IBlogDocument[];
    }

    /**
     * Create a new blog post
     */
    async createPost(postData: Partial<IBlogDocument>): Promise<IBlogDocument> {
        const post = await Blog.create(postData);
        return post;
    }

    /**
     * Update a blog post
     */
    async updatePost(
        slug: string,
        postData: Partial<IBlogDocument>
    ): Promise<IBlogDocument | null> {
        const post = await Blog.findOneAndUpdate(
            { slug },
            { $set: postData },
            { new: true, runValidators: true }
        );

        return post;
    }

    /**
     * Delete a blog post
     */
    async deletePost(slug: string): Promise<boolean> {
        const result = await Blog.deleteOne({ slug });
        return result.deletedCount > 0;
    }

    /**
     * Helper: Format tag name (capitalize first letter)
     */
    private formatTagName(tag: string): string {
        return tag
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

export default new BlogService();
