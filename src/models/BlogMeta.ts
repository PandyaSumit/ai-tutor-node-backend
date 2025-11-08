// src/models/BlogMeta.ts
import mongoose, { Schema, Document } from 'mongoose';

/**
 * Blog Category Model
 * Stores predefined categories with metadata
 */
export interface IBlogCategory extends Document {
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    order: number;
    postCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const categorySchema = new Schema<IBlogCategory>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        icon: {
            type: String,
            trim: true,
        },
        color: {
            type: String,
            trim: true,
            default: '#3B82F6',
        },
        order: {
            type: Number,
            default: 0,
        },
        postCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

/**
 * Blog Tag Model
 * Stores tags with metadata
 */
export interface IBlogTag extends Document {
    slug: string;
    name: string;
    description?: string;
    postCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const tagSchema = new Schema<IBlogTag>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        postCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

/**
 * Blog Series Model
 * Stores series information
 */
export interface IBlogSeries extends Document {
    slug: string;
    name: string;
    description?: string;
    coverImage?: string;
    postCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const seriesSchema = new Schema<IBlogSeries>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        coverImage: {
            type: String,
            trim: true,
        },
        postCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

export const BlogCategory = mongoose.model<IBlogCategory>('BlogCategory', categorySchema);
export const BlogTag = mongoose.model<IBlogTag>('BlogTag', tagSchema);
export const BlogSeries = mongoose.model<IBlogSeries>('BlogSeries', seriesSchema);
