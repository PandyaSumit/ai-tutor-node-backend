# Blog API Documentation

## Overview

This document describes the Blog API endpoints, data structures, and implementation guidelines. The API is currently implemented using file-based MDX content but is designed to be easily replaced with a database-backed implementation.

## Base URL

```
Development: http://localhost:3000/api/blog
Production: https://yourdomain.com/api/blog
```

## Architecture

The API follows a **service layer pattern**:
- **API Routes** (`/app/api/blog/`): Handle HTTP requests/responses
- **Service Layer** (`/lib/services/blog.service.ts`): Business logic and data access
- **Data Layer** (`/content/blog/`): MDX files (to be replaced with database)

This separation allows easy migration from file-based to database-backed storage.

---

## API Endpoints

### 1. Get All Posts

Retrieve a paginated list of blog posts.

**Endpoint:** `GET /api/blog/posts`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 10 | Posts per page (max: 50) |
| `tag` | string | No | - | Filter by tag slug |
| `category` | string | No | - | Filter by category |
| `featured` | boolean | No | - | Filter featured posts |
| `search` | string | No | - | Search in title/description |

**Example Request:**
```bash
GET /api/blog/posts?page=1&limit=10&tag=nextjs
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "slug": "building-scalable-nextjs-api",
      "title": "Building Scalable APIs with Next.js App Router",
      "description": "Learn how to design and implement production-ready API routes...",
      "excerpt": "Building robust APIs is crucial for modern web applications...",
      "author": "Your Name",
      "publishedAt": "2025-01-23T00:00:00.000Z",
      "updatedAt": "2025-01-23T00:00:00.000Z",
      "tags": ["nextjs", "api", "typescript", "backend"],
      "category": "engineering",
      "coverImage": "https://images.unsplash.com/photo-...",
      "featured": true,
      "readingTime": "8 min read"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### 2. Get Post by Slug

Retrieve a single blog post by its slug, including full MDX content.

**Endpoint:** `GET /api/blog/posts/:slug`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | string | Yes | Unique post identifier |

**Example Request:**
```bash
GET /api/blog/posts/building-scalable-nextjs-api
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "slug": "building-scalable-nextjs-api",
    "title": "Building Scalable APIs with Next.js App Router",
    "description": "Learn how to design and implement production-ready API routes...",
    "content": "## Introduction\n\nBuilding robust APIs...",
    "mdxContent": "<compiled MDX>",
    "author": "Your Name",
    "publishedAt": "2025-01-23T00:00:00.000Z",
    "updatedAt": "2025-01-23T00:00:00.000Z",
    "tags": ["nextjs", "api", "typescript", "backend"],
    "category": "engineering",
    "coverImage": "https://images.unsplash.com/photo-...",
    "featured": true,
    "readingTime": "8 min read",
    "tableOfContents": [
      {
        "id": "introduction",
        "title": "Introduction",
        "level": 2
      },
      {
        "id": "setting-up-the-project",
        "title": "Setting Up the Project",
        "level": 2
      }
    ]
  }
}
```

---

### 3. Get All Tags

Retrieve all unique tags with post counts.

**Endpoint:** `GET /api/blog/tags`

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "slug": "nextjs",
      "name": "Next.js",
      "count": 12
    },
    {
      "slug": "typescript",
      "name": "TypeScript",
      "count": 8
    }
  ]
}
```

---

### 4. Search Posts

Search posts by title, description, or content.

**Endpoint:** `GET /api/blog/search`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `limit` | number | No | Max results (default: 10) |

**Example Request:**
```bash
GET /api/blog/search?q=nextjs&limit=5
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "slug": "building-scalable-nextjs-api",
      "title": "Building Scalable APIs with Next.js App Router",
      "excerpt": "Building robust APIs is crucial...",
      "relevance": 0.95
    }
  ]
}
```

---

## Data Models

### Post (Full)
```typescript
interface Post {
  slug: string;
  title: string;
  description: string;
  content: string;              // Raw markdown/MDX
  mdxContent?: string;           // Compiled MDX (for frontend)
  author: string;
  publishedAt: string;           // ISO 8601
  updatedAt?: string;            // ISO 8601
  tags: string[];
  category: string;
  coverImage?: string;
  featured: boolean;
  readingTime: string;
  tableOfContents?: TOCItem[];
}
```

### Post (List Item)
```typescript
interface PostListItem {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  category: string;
  coverImage?: string;
  featured: boolean;
  readingTime: string;
}
```

### Table of Contents Item
```typescript
interface TOCItem {
  id: string;
  title: string;
  level: number;              // 2, 3, or 4 (h2, h3, h4)
  children?: TOCItem[];
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Post not found",
    "code": "NOT_FOUND",
    "statusCode": 404
  }
}
```

**Common Error Codes:**
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (post doesn't exist)
- `500` - Internal Server Error

---

## Frontend Integration

### React Query Example
```typescript
import { useQuery } from '@tanstack/react-query';

export function usePosts(page: number = 1) {
  return useQuery({
    queryKey: ['posts', page],
    queryFn: async () => {
      const res = await fetch(`/api/blog/posts?page=${page}`);
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
  });
}
```

### Server Component Example
```typescript
export default async function BlogPage() {
  const res = await fetch('http://localhost:3000/api/blog/posts', {
    cache: 'no-store', // or use Next.js revalidation
  });
  const { data: posts } = await res.json();

  return <PostsList posts={posts} />;
}
```

---

## Migration to Database

When migrating to a database-backed API:

### 1. Update Service Layer

Replace file reading in `/lib/services/blog.service.ts` with database queries:

```typescript
// Before (File-based)
const posts = await fs.readdir('./content/blog');

// After (Database)
const posts = await prisma.post.findMany({
  where: { published: true },
  orderBy: { publishedAt: 'desc' },
});
```

### 2. Keep API Routes Unchanged

API routes in `/app/api/blog/` should remain the same. They call the service layer, which handles data access.

### 3. Database Schema Example

```prisma
model Post {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  description String
  content     String   @db.Text
  author      String
  publishedAt DateTime
  updatedAt   DateTime @updatedAt
  tags        String[]
  category    String
  coverImage  String?
  featured    Boolean  @default(false)

  @@index([slug])
  @@index([publishedAt])
  @@index([category])
}
```

---

## Content Management

### Adding a New Post

1. Create a new MDX file in `/content/blog/`:
```bash
content/blog/my-new-post.mdx
```

2. Add frontmatter:
```mdx
---
title: "My New Post"
description: "A great description"
publishedAt: "2025-01-23"
author: "Your Name"
tags: ["nextjs", "tutorial"]
category: "tutorial"
featured: false
---

Your content here...
```

3. The post will automatically appear in the API and on the blog.

### Organizing Images

Store blog images in `/public/blog-images/`:
```
public/
└── blog-images/
    ├── hero-image.jpg
    └── diagram.png
```

Reference them in MDX:
```mdx
![Alt text](/blog-images/hero-image.jpg)
```

---

## Backend Implementation Checklist

For backend developers implementing this API with a real database:

- [ ] Set up database (PostgreSQL, MySQL, MongoDB, etc.)
- [ ] Create Post schema/model
- [ ] Implement GET /api/blog/posts with pagination
- [ ] Implement GET /api/blog/posts/:slug
- [ ] Implement GET /api/blog/tags
- [ ] Implement GET /api/blog/search
- [ ] Add database indexes for performance
- [ ] Implement caching layer (Redis recommended)
- [ ] Add authentication for admin endpoints
- [ ] Set up automated backups
- [ ] Add monitoring and logging
- [ ] Write unit tests for all endpoints
- [ ] Deploy to production environment

---

## Performance Considerations

- **Caching**: Implement Redis or similar for frequently accessed posts
- **ISR**: Use Next.js Incremental Static Regeneration for blog pages
- **CDN**: Serve images through CDN (Cloudflare, Vercel, etc.)
- **Database Indexes**: Index frequently queried fields (slug, category, publishedAt)
- **Pagination**: Always paginate list endpoints
- **Search**: Use dedicated search service (Algolia, Elasticsearch) for large blogs

---

## Adaptation for Node.js/Express Backend

This documentation describes a Next.js-based blog API. To adapt it for this Node.js/Express backend:

### Express Implementation Structure

```
src/
├── models/
│   └── blog.model.ts          # Mongoose/Sequelize Post model
├── controllers/
│   └── blog.controller.ts     # Request handlers
├── services/
│   └── blog.service.ts        # Business logic
├── routes/
│   └── blog.routes.ts         # Route definitions
└── validators/
    └── blog.validator.ts      # Input validation
```

### Example Express Route Setup

```typescript
// src/routes/blog.routes.ts
import { Router } from 'express';
import * as blogController from '../controllers/blog.controller';
import { validatePagination, validateSlug } from '../validators/blog.validator';

const router = Router();

router.get('/posts', validatePagination, blogController.getAllPosts);
router.get('/posts/:slug', validateSlug, blogController.getPostBySlug);
router.get('/tags', blogController.getAllTags);
router.get('/search', blogController.searchPosts);

export default router;
```

### Integration in server.ts

```typescript
// Add to src/server.ts
import blogRoutes from './routes/blog.routes';

app.use('/api/blog', blogRoutes);
```

---

## Notes

- **Framework Mismatch**: This documentation was originally written for Next.js but has been adapted for Node.js/Express
- **Next Steps**: Implement the Express controllers, services, and models based on the API specifications above
- **Database**: Choose MongoDB (with Mongoose) or PostgreSQL (with Sequelize/Prisma) based on project requirements
