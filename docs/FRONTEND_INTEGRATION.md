# Frontend Integration Guide - Blog Admin Panel

This guide helps you integrate the secure admin blog panel into your **Next.js** application.

---

## 🎯 Overview

You'll build:
- **Admin Dashboard** (`/admin/blog`) - Manage all posts
- **Post Editor** (`/admin/blog/new`, `/admin/blog/edit/[slug]`) - Create/edit posts
- **Category/Tag Manager** (`/admin/blog/categories`, `/admin/blog/tags`)
- **Media Library** - Upload and manage images
- **Preview Mode** - Preview before publishing

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install axios
npm install react-hook-form zod @hookform/resolvers
npm install react-markdown rehype-highlight rehype-raw remark-gfm
npm install react-dropzone
npm install @tanstack/react-query
```

### 2. Set Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 3. Create API Client

Create `lib/api/client.ts`:

```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Store access token in memory (NOT localStorage!)
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

// Request interceptor to add token
apiClient.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Attempt to refresh token
        const response = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newToken = response.data.data.accessToken;
        setAccessToken(newToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

---

## 🔐 Authentication Setup

### Create Auth Service

Create `lib/api/auth.ts`:

```typescript
import { apiClient, setAccessToken } from './client';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student' | 'tutor';
}

export const authAPI = {
  // Login
  async login(credentials: LoginCredentials) {
    const response = await apiClient.post('/api/auth/login', credentials);
    const { user, accessToken } = response.data.data;

    // Store token in memory
    setAccessToken(accessToken);

    return { user, accessToken };
  },

  // Logout
  async logout() {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      setAccessToken(null);
    }
  },

  // Get current user
  async getProfile() {
    const response = await apiClient.get('/api/auth/profile');
    return response.data.data.user as User;
  },

  // Verify authentication
  async verifyAuth() {
    const response = await apiClient.get('/api/auth/verify');
    return response.data.data.user as User;
  },
};
```

### Create Auth Context

Create `contexts/AuthContext.tsx`:

```typescript
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '@/lib/api/auth';
import type { User } from '@/lib/api/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await authAPI.verifyAuth();
      setUser(user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const { user } = await authAPI.login({ email, password });
    setUser(user);
  };

  const logout = async () => {
    await authAPI.logout();
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### Protect Admin Routes

Create `components/AdminRoute.tsx`:

```typescript
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/login');
    }
  }, [user, loading, isAdmin, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
```

---

## 📝 Blog API Service

Create `lib/api/blog.ts`:

```typescript
import { apiClient } from './client';

let csrfToken: string | null = null;

// Get CSRF token
export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;

  const response = await apiClient.get('/api/admin/blog/csrf-token');
  csrfToken = response.data.data.csrfToken;
  return csrfToken;
}

// Clear CSRF token (call on 403 errors)
export function clearCsrfToken() {
  csrfToken = null;
}

export interface BlogPost {
  _id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  excerpt: string;
  author: string;
  authorId?: string;
  publishedAt: string;
  updatedAt?: string;
  tags: string[];
  category: string;
  coverImage?: string;
  featured: boolean;
  published: boolean;
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
  createdAt: string;
}

export interface CreatePostData {
  title: string;
  description: string;
  content: string;
  excerpt?: string;
  author: string;
  tags: string[];
  category: string;
  coverImage?: string;
  featured?: boolean;
  published?: boolean;
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
}

export const blogAPI = {
  // Get all posts (admin)
  async getAdminPosts(params?: {
    page?: number;
    limit?: number;
    published?: boolean;
    search?: string;
  }) {
    const response = await apiClient.get('/api/admin/blog/posts', { params });
    return response.data;
  },

  // Get single post
  async getPost(slug: string) {
    const response = await apiClient.get(`/api/admin/blog/posts/${slug}`);
    return response.data.data.post as BlogPost;
  },

  // Create post
  async createPost(data: CreatePostData) {
    const token = await getCsrfToken();
    const response = await apiClient.post('/api/admin/blog/posts', data, {
      headers: { 'x-csrf-token': token },
    });
    return response.data.data.post as BlogPost;
  },

  // Update post
  async updatePost(slug: string, data: Partial<CreatePostData>) {
    const token = await getCsrfToken();
    const response = await apiClient.put(`/api/admin/blog/posts/${slug}`, data, {
      headers: { 'x-csrf-token': token },
    });
    return response.data.data.post as BlogPost;
  },

  // Delete post
  async deletePost(slug: string) {
    const token = await getCsrfToken();
    await apiClient.delete(`/api/admin/blog/posts/${slug}`, {
      headers: { 'x-csrf-token': token },
    });
  },

  // Publish post
  async publishPost(slug: string) {
    const token = await getCsrfToken();
    const response = await apiClient.post(
      `/api/admin/blog/posts/${slug}/publish`,
      {},
      { headers: { 'x-csrf-token': token } }
    );
    return response.data.data.post as BlogPost;
  },

  // Unpublish post
  async unpublishPost(slug: string) {
    const token = await getCsrfToken();
    const response = await apiClient.post(
      `/api/admin/blog/posts/${slug}/unpublish`,
      {},
      { headers: { 'x-csrf-token': token } }
    );
    return response.data.data.post as BlogPost;
  },

  // Upload cover image
  async uploadCoverImage(file: File) {
    const token = await getCsrfToken();
    const formData = new FormData();
    formData.append('image', file);

    const response = await apiClient.post('/api/admin/blog/upload/cover', formData, {
      headers: {
        'x-csrf-token': token,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data.url as string;
  },

  // Upload inline image
  async uploadInlineImage(file: File) {
    const token = await getCsrfToken();
    const formData = new FormData();
    formData.append('image', file);

    const response = await apiClient.post('/api/admin/blog/upload/inline', formData, {
      headers: {
        'x-csrf-token': token,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data.url as string;
  },

  // Get stats
  async getStats() {
    const response = await apiClient.get('/api/admin/blog/stats');
    return response.data.data;
  },

  // Get categories
  async getCategories() {
    const response = await apiClient.get('/api/admin/blog/categories');
    return response.data.data.categories;
  },

  // Get tags
  async getTags() {
    const response = await apiClient.get('/api/admin/blog/tags');
    return response.data.data.tags;
  },
};
```

---

## 🎨 Admin Pages

### Dashboard Page

Create `app/admin/blog/page.tsx`:

```typescript
'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { useQuery } from '@tanstack/react-query';
import { blogAPI } from '@/lib/api/blog';
import Link from 'next/link';

export default function AdminBlogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-posts'],
    queryFn: () => blogAPI.getAdminPosts(),
  });

  const { data: stats } = useQuery({
    queryKey: ['blog-stats'],
    queryFn: () => blogAPI.getStats(),
  });

  return (
    <AdminRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Blog Management</h1>
          <Link
            href="/admin/blog/new"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create New Post
          </Link>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-600">Total Posts</div>
              <div className="text-2xl font-bold">{stats.totalPosts}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-600">Published</div>
              <div className="text-2xl font-bold">{stats.publishedPosts}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-600">Drafts</div>
              <div className="text-2xl font-bold">{stats.draftPosts}</div>
            </div>
            <div className="bg-white p-4 rounded shadow">
              <div className="text-gray-600">Total Views</div>
              <div className="text-2xl font-bold">{stats.totalViews}</div>
            </div>
          </div>
        )}

        {/* Posts List */}
        <div className="bg-white rounded shadow">
          {isLoading ? (
            <div className="p-8 text-center">Loading...</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Views
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data?.data.data.map((post: any) => (
                  <tr key={post._id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{post.title}</div>
                      <div className="text-sm text-gray-500">{post.slug}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          post.published
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{post.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{post.views}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/blog/edit/${post.slug}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminRoute>
  );
}
```

### Post Editor Page

Create `app/admin/blog/new/page.tsx`:

```typescript
'use client';

import { AdminRoute } from '@/components/AdminRoute';
import { PostEditor } from '@/components/admin/PostEditor';

export default function NewPostPage() {
  return (
    <AdminRoute>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Create New Post</h1>
        <PostEditor />
      </div>
    </AdminRoute>
  );
}
```

### Post Editor Component

Create `components/admin/PostEditor.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { blogAPI } from '@/lib/api/blog';
import { useRouter } from 'next/navigation';
import { ImageUploader } from './ImageUploader';

const postSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(500),
  content: z.string().min(50),
  author: z.string().min(2),
  tags: z.array(z.string()),
  category: z.string(),
  featured: z.boolean(),
  published: z.boolean(),
});

type PostFormData = z.infer<typeof postSchema>;

interface PostEditorProps {
  initialData?: any;
  slug?: string;
}

export function PostEditor({ initialData, slug }: PostEditorProps) {
  const router = useRouter();
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || '');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: initialData || {
      published: false,
      featured: false,
      tags: [],
    },
  });

  const onSubmit = async (data: PostFormData) => {
    try {
      setLoading(true);

      const postData = {
        ...data,
        coverImage,
      };

      if (slug) {
        await blogAPI.updatePost(slug, postData);
      } else {
        await blogAPI.createPost(postData);
      }

      router.push('/admin/blog');
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Failed to save post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Title</label>
        <input
          {...register('title')}
          className="w-full border rounded px-3 py-2"
          placeholder="Enter post title"
        />
        {errors.title && (
          <p className="text-red-600 text-sm mt-1">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
        <textarea
          {...register('description')}
          className="w-full border rounded px-3 py-2"
          rows={3}
          placeholder="Brief description (min 20 chars)"
        />
        {errors.description && (
          <p className="text-red-600 text-sm mt-1">{errors.description.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Cover Image</label>
        <ImageUploader
          type="cover"
          value={coverImage}
          onChange={setCoverImage}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Content (Markdown)</label>
        <textarea
          {...register('content')}
          className="w-full border rounded px-3 py-2 font-mono"
          rows={20}
          placeholder="Write your post content in markdown..."
        />
        {errors.content && (
          <p className="text-red-600 text-sm mt-1">{errors.content.message}</p>
        )}
      </div>

      {/* Add more fields: author, tags, category, etc. */}

      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <input {...register('featured')} type="checkbox" className="mr-2" />
          <span className="text-sm font-medium">Featured Post</span>
        </label>

        <label className="flex items-center">
          <input {...register('published')} type="checkbox" className="mr-2" />
          <span className="text-sm font-medium">Publish Immediately</span>
        </label>
      </div>

      <div className="flex space-x-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : slug ? 'Update Post' : 'Create Post'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### Image Uploader Component

Create `components/admin/ImageUploader.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { blogAPI } from '@/lib/api/blog';

interface ImageUploaderProps {
  type: 'cover' | 'inline';
  value: string;
  onChange: (url: string) => void;
}

export function ImageUploader({ type, value, onChange }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    try {
      setUploading(true);
      const file = acceptedFiles[0];

      const url =
        type === 'cover'
          ? await blogAPI.uploadCoverImage(file)
          : await blogAPI.uploadInlineImage(file);

      onChange(url);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    maxSize: type === 'cover' ? 5 * 1024 * 1024 : 10 * 1024 * 1024,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded p-6 text-center cursor-pointer ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <p>Uploading...</p>
        ) : value ? (
          <div>
            <img src={value} alt="Preview" className="max-h-40 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Click or drag to replace</p>
          </div>
        ) : (
          <p>Drag & drop an image here, or click to select</p>
        )}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 text-red-600 text-sm hover:underline"
        >
          Remove Image
        </button>
      )}
    </div>
  );
}
```

---

## 🎯 Key Features to Implement

1. **Markdown Editor** - Use a library like `react-markdown-editor-lite` or `@uiw/react-md-editor`
2. **Preview Mode** - Render markdown in real-time
3. **Auto-save Drafts** - Save to localStorage every 30 seconds
4. **Tag Input** - Use a tag input component like `react-tag-input`
5. **Rich Text Toolbar** - Add shortcuts for markdown formatting
6. **Image Paste** - Handle paste events to upload images
7. **Series Selector** - Dropdown to select/create series
8. **SEO Fields** - Meta title, description, keywords
9. **Slug Editor** - Auto-generate slug from title, allow manual edit
10. **Publish Scheduler** - Set future publish date

---

## 🔒 Security Checklist

- [✓] Store tokens in memory, not localStorage
- [✓] Use HTTP-only cookies for refresh tokens
- [✓] Implement CSRF protection for all mutations
- [✓] Validate all inputs on frontend and backend
- [✓] Limit file upload sizes
- [✓] Validate image types and dimensions
- [✓] Use HTTPS in production
- [✓] Implement rate limiting
- [✓] Protect admin routes with authentication checks
- [✓] Never expose admin functionality to non-admins

---

## 🚀 Deployment

### Production Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### Backend Environment (Production)

```env
NODE_ENV=production
COOKIE_SECURE=true
CORS_ORIGIN=https://yourdomain.com
```

---

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Validation](https://zod.dev/)
- [Axios Documentation](https://axios-http.com/)
- [TanStack Query](https://tanstack.com/query/latest)
- [React Markdown](https://github.com/remarkjs/react-markdown)

---

## 🐛 Troubleshooting

### CSRF Token Errors

If you get 403 errors with "Invalid CSRF token":
1. Make sure you're calling `getCsrfToken()` before mutations
2. Check that the token is being sent in `x-csrf-token` header
3. Try clearing the token cache with `clearCsrfToken()`

### Image Upload Fails

1. Check file size (max 5MB for covers, 10MB for inline)
2. Verify file type (JPEG, PNG, WebP only)
3. Check cover image dimensions (min 800x400px)

### Authentication Issues

1. Ensure `withCredentials: true` is set in axios
2. Check CORS configuration on backend
3. Verify cookies are being set (check browser DevTools)
4. Check if token is expired (refresh flow should handle this)

---

## 💡 Best Practices

1. **Always use HTTPS** in production
2. **Never store tokens** in localStorage
3. **Validate on both** frontend and backend
4. **Implement proper error** handling
5. **Show loading states** for better UX
6. **Use optimistic updates** for instant feedback
7. **Implement auto-save** to prevent data loss
8. **Test thoroughly** before deployment
9. **Monitor errors** with tools like Sentry
10. **Keep dependencies** updated

---

## 🎉 You're Ready!

You now have everything you need to build a secure, production-ready admin blog panel. Start with authentication, then build out the post editor, and finally add category/tag management.

For API reference, see [ADMIN_BLOG_PANEL.md](./ADMIN_BLOG_PANEL.md)
