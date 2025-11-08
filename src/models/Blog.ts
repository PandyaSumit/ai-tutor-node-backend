// src/models/Blog.ts
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBlog {
    _id?: string;
    slug: string;
    title: string;
    description: string;
    content: string;
    excerpt: string;
    author: string;
    authorId?: string; // Reference to User model
    publishedAt: Date;
    updatedAt?: Date;
    tags: string[];
    category: string;
    coverImage?: string;
    featured: boolean;
    readingTime: string;
    tableOfContents?: ITOCItem[];
    published: boolean; // false = draft, true = published
    series?: {
        name: string;
        order: number;
    };
    seo?: {
        metaTitle?: string;
        metaDescription?: string;
        keywords?: string[];
        canonicalUrl?: string;
    };
    views: number;
    likes: number;
    createdAt?: Date;
}

export interface ITOCItem {
    id: string;
    title: string;
    level: number; // 2, 3, or 4 (h2, h3, h4)
    children?: ITOCItem[];
}

export interface IBlogDocument extends Omit<IBlog, '_id'>, Document {
    generateSlug(): void;
    calculateReadingTime(): string;
    generateExcerpt(): string;
}

interface IBlogModel extends Model<IBlogDocument> {
    findBySlug(slug: string): Promise<IBlogDocument | null>;
    findPublished(filters?: any): Promise<IBlogDocument[]>;
}

const tocItemSchema = new Schema<ITOCItem>(
    {
        id: { type: String, required: true },
        title: { type: String, required: true },
        level: { type: Number, required: true, min: 2, max: 4 },
        children: [{ type: Schema.Types.Mixed }],
    },
    { _id: false }
);

const blogSchema = new Schema<IBlogDocument>(
    {
        slug: {
            type: String,
            required: [true, 'Slug is required'],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            minlength: [5, 'Title must be at least 5 characters'],
            maxlength: [200, 'Title cannot exceed 200 characters'],
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            trim: true,
            minlength: [20, 'Description must be at least 20 characters'],
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        content: {
            type: String,
            required: [true, 'Content is required'],
        },
        excerpt: {
            type: String,
            trim: true,
            maxlength: [300, 'Excerpt cannot exceed 300 characters'],
        },
        author: {
            type: String,
            required: [true, 'Author is required'],
            trim: true,
        },
        authorId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        publishedAt: {
            type: Date,
            required: true,
            index: true,
        },
        tags: {
            type: [String],
            default: [],
            index: true,
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            trim: true,
            lowercase: true,
            index: true,
        },
        coverImage: {
            type: String,
            trim: true,
        },
        featured: {
            type: Boolean,
            default: false,
            index: true,
        },
        readingTime: {
            type: String,
            default: '1 min read',
        },
        tableOfContents: {
            type: [tocItemSchema],
            default: [],
        },
        published: {
            type: Boolean,
            default: false, // Default to draft
            index: true,
        },
        series: {
            name: { type: String, trim: true },
            order: { type: Number, default: 1 },
        },
        seo: {
            metaTitle: { type: String, trim: true },
            metaDescription: { type: String, trim: true },
            keywords: [{ type: String, trim: true }],
            canonicalUrl: { type: String, trim: true },
        },
        views: {
            type: Number,
            default: 0,
        },
        likes: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_, ret) => {
                if ('__v' in ret) delete (ret as any).__v;
                return ret;
            },
        },
    }
);

// Index for search functionality
blogSchema.index({ title: 'text', description: 'text', content: 'text' });

// Method to generate slug from title
blogSchema.methods.generateSlug = function (): void {
    if (!this.slug && this.title) {
        this.slug = this.title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
};

// Method to calculate reading time
blogSchema.methods.calculateReadingTime = function (): string {
    const wordsPerMinute = 200;
    const wordCount = this.content.trim().split(/\s+/).length;
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    return `${minutes} min read`;
};

// Method to generate excerpt from content
blogSchema.methods.generateExcerpt = function (): string {
    if (this.excerpt) return this.excerpt;

    // Remove markdown formatting and get first 150 characters
    const plainText = this.content
        .replace(/#{1,6}\s/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim();

    return plainText.substring(0, 150) + (plainText.length > 150 ? '...' : '');
};

// Pre-save hooks
blogSchema.pre('save', function (next) {
    // Generate slug if not provided
    this.generateSlug();

    // Calculate reading time
    this.readingTime = this.calculateReadingTime();

    // Generate excerpt if not provided
    if (!this.excerpt) {
        this.excerpt = this.generateExcerpt();
    }

    next();
});

// Static methods
blogSchema.statics.findBySlug = function (slug: string) {
    return this.findOne({ slug: slug.toLowerCase(), published: true });
};

blogSchema.statics.findPublished = function (filters: any = {}) {
    return this.find({ ...filters, published: true }).sort({ publishedAt: -1 });
};

const Blog = mongoose.model<IBlogDocument, IBlogModel>('Blog', blogSchema);

export default Blog;
