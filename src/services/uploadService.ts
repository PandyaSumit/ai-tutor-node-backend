// src/services/uploadService.ts
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

/**
 * Allowed image types
 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * File size limits
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Upload directories
 */
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const BLOG_DIR = path.join(UPLOAD_DIR, 'blog');
const COVER_DIR = path.join(UPLOAD_DIR, 'blog', 'covers');
const INLINE_DIR = path.join(UPLOAD_DIR, 'blog', 'inline');

/**
 * Ensure upload directories exist
 */
export async function ensureUploadDirectories(): Promise<void> {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(BLOG_DIR, { recursive: true });
        await fs.mkdir(COVER_DIR, { recursive: true });
        await fs.mkdir(INLINE_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating upload directories:', error);
    }
}

/**
 * Generate unique filename
 */
function generateFilename(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${Date.now()}-${randomName}${ext}`;
}

/**
 * Validate file type
 */
function validateFileType(mimetype: string): boolean {
    return ALLOWED_IMAGE_TYPES.includes(mimetype);
}

/**
 * Configure multer storage for memory storage (we'll process with sharp)
 */
const storage = multer.memoryStorage();

/**
 * File filter for multer
 */
const fileFilter = (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (validateFileType(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
    }
};

/**
 * Multer upload instance for blog images
 */
export const blogImageUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
});

/**
 * Process and save cover image
 */
export async function processCoverImage(
    file: Express.Multer.File
): Promise<{ url: string; filename: string }> {
    await ensureUploadDirectories();

    const filename = generateFilename(file.originalname);
    const filepath = path.join(COVER_DIR, filename);

    // Process image: resize and optimize
    await sharp(file.buffer)
        .resize(1200, 630, {
            fit: 'cover',
            position: 'center',
        })
        .webp({ quality: 85 })
        .toFile(filepath.replace(path.extname(filepath), '.webp'));

    const webpFilename = filename.replace(path.extname(filename), '.webp');
    const url = `/uploads/blog/covers/${webpFilename}`;

    return { url, filename: webpFilename };
}

/**
 * Process and save inline image
 */
export async function processInlineImage(
    file: Express.Multer.File
): Promise<{ url: string; filename: string }> {
    await ensureUploadDirectories();

    const filename = generateFilename(file.originalname);
    const filepath = path.join(INLINE_DIR, filename);

    // Process image: resize and optimize (max width 1000px)
    await sharp(file.buffer)
        .resize(1000, null, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(filepath.replace(path.extname(filepath), '.webp'));

    const webpFilename = filename.replace(path.extname(filename), '.webp');
    const url = `/uploads/blog/inline/${webpFilename}`;

    return { url, filename: webpFilename };
}

/**
 * Delete image file
 */
export async function deleteImage(url: string): Promise<boolean> {
    try {
        // Extract relative path from URL
        const relativePath = url.replace(/^\//, '');
        const filepath = path.join(process.cwd(), 'public', relativePath);

        await fs.unlink(filepath);
        return true;
    } catch (error) {
        console.error('Error deleting image:', error);
        return false;
    }
}

/**
 * Validate image dimensions
 */
export async function validateImageDimensions(
    buffer: Buffer,
    minWidth?: number,
    minHeight?: number
): Promise<{ valid: boolean; width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();

    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const valid =
        (!minWidth || width >= minWidth) &&
        (!minHeight || height >= minHeight);

    return { valid, width, height };
}

/**
 * Get image metadata
 */
export async function getImageMetadata(file: Express.Multer.File): Promise<{
    width: number;
    height: number;
    format: string;
    size: number;
}> {
    const metadata = await sharp(file.buffer).metadata();

    return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'unknown',
        size: file.size,
    };
}

class UploadService {
    /**
     * Upload and process cover image
     */
    async uploadCoverImage(file: Express.Multer.File): Promise<string> {
        // Validate file size
        if (file.size > MAX_COVER_SIZE) {
            throw new Error('Cover image size exceeds 5MB limit');
        }

        // Validate dimensions (min 800x400)
        const dimensions = await validateImageDimensions(file.buffer, 800, 400);
        if (!dimensions.valid) {
            throw new Error('Cover image must be at least 800x400 pixels');
        }

        const { url } = await processCoverImage(file);
        return url;
    }

    /**
     * Upload and process inline image
     */
    async uploadInlineImage(file: Express.Multer.File): Promise<string> {
        const { url } = await processInlineImage(file);
        return url;
    }

    /**
     * Upload multiple images
     */
    async uploadMultipleImages(files: Express.Multer.File[]): Promise<string[]> {
        const urls: string[] = [];

        for (const file of files) {
            const { url } = await processInlineImage(file);
            urls.push(url);
        }

        return urls;
    }

    /**
     * Delete image by URL
     */
    async deleteImage(url: string): Promise<boolean> {
        return deleteImage(url);
    }
}

export default new UploadService();
