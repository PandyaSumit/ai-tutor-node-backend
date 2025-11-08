# Blog Admin Panel - Complete Backend Integration Guide

**Version:** 1.0
**Last Updated:** 2025-01-08
**Author:** Backend Team
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication System](#authentication-system)
3. [Admin User Management](#admin-user-management)
4. [Security Architecture](#security-architecture)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Data Flow & Request/Response Examples](#data-flow--requestresponse-examples)
7. [Image Upload & Storage](#image-upload--storage)
8. [Draft vs Published Workflow](#draft-vs-published-workflow)
9. [Backend Folder Structure](#backend-folder-structure)
10. [Implementation Checklist](#implementation-checklist)
11. [Testing Guide](#testing-guide)
12. [Production Deployment](#production-deployment)

---

## Overview

This document describes the **Blog Admin Panel Backend API** - a secure, production-ready system for managing blog content. The API implements enterprise-grade security with JWT authentication, CSRF protection, role-based access control, and comprehensive input validation.

### Key Features

- ✅ **Secure Authentication** - JWT + HTTP-only cookies + CSRF protection
- ✅ **Role-Based Access Control** - Only users with `admin` role can access
- ✅ **Blog Management** - Full CRUD for posts, categories, tags, series
- ✅ **Draft/Publish Workflow** - Save drafts, preview, then publish
- ✅ **Image Upload** - Cover images, inline images, with auto-optimization
- ✅ **SEO Support** - Meta tags, canonical URLs, keywords
- ✅ **Analytics** - View counts, like counts, statistics dashboard
- ✅ **Input Validation** - Zod schemas validate all inputs
- ✅ **Rate Limiting** - Prevent brute-force attacks

### Technology Stack

- **Runtime:** Node.js + Express + TypeScript
- **Database:** MongoDB + Mongoose
- **Authentication:** JWT (jsonwebtoken) + bcrypt
- **Validation:** Zod
- **Image Processing:** Multer + Sharp
- **Security:** Helmet, express-rate-limit, express-mongo-sanitize

---

## Authentication System

### How Authentication Works

The system uses **dual-token authentication**:

1. **Access Token** (JWT)
   - Short-lived (15 minutes)
   - Stored in HTTP-only cookie `accessToken`
   - Also returned in response body for SPA use
   - Contains: `userId`, `email`, `role`

2. **Refresh Token** (Random string)
   - Long-lived (7 days)
   - Stored in database
   - Stored in HTTP-only cookie `refreshToken`
   - Used to rotate and get new access tokens

### Authentication Flow Diagram

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. POST /api/auth/login
       │    { email, password }
       ▼
┌─────────────────────────────────────┐
│          Backend Server             │
│                                     │
│  2. Verify credentials (bcrypt)     │
│  3. Check user.role === 'admin'     │
│  4. Generate JWT access token       │
│  5. Generate refresh token          │
│  6. Store refresh token in DB       │
│  7. Set HTTP-only cookies           │
│                                     │
└──────┬──────────────────────────────┘
       │
       │ 8. Response:
       │    {
       │      success: true,
       │      data: {
       │        user: { id, email, name, role },
       │        accessToken: "jwt..."
       │      }
       │    }
       │    Set-Cookie: accessToken=...; HttpOnly; Secure
       │    Set-Cookie: refreshToken=...; HttpOnly; Secure
       │
       ▼
┌─────────────┐
│   Client    │
│  Logged In  │
└─────────────┘
```

### Admin Validation Process

Every protected endpoint follows this validation chain:

```
Request → Middleware Chain → Controller
   │           │                  │
   │           ▼                  │
   │     1. authenticate()        │
   │        - Extract JWT         │
   │        - Verify signature    │
   │        - Check expiry        │
   │        - Attach user to req  │
   │           │                  │
   │           ▼                  │
   │     2. authorize('admin')    │
   │        - Check req.user.role │
   │        - Reject if not admin │
   │           │                  │
   │           ▼                  │
   │     3. verifyCsrfToken()     │
   │        - Check x-csrf-token  │
   │        - Validate against DB │
   │           │                  │
   │           ▼                  │
   └──────────────────────────────▶ Execute Controller
```

### Login Endpoint Implementation

**Endpoint:** `POST /api/auth/login`

**Request:**
```http
POST /api/auth/login HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "SecureP@ss123"
}
```

**Backend Processing:**
```typescript
// src/controllers/authController.ts
login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // 1. Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })
        .select('+password');

    if (!user) {
        return apiResponse.unauthorized(res, 'Invalid email or password');
    }

    // 2. Verify password (bcrypt)
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        return apiResponse.unauthorized(res, 'Invalid email or password');
    }

    // 3. Generate tokens
    const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || 'Unknown IP';

    const tokens = await jwtService.generateTokenPair(
        String(user._id),
        user.email,
        user.role,
        deviceInfo,
        ipAddress
    );

    // 4. Set HTTP-only cookies
    cookieHelper.setTokens(res, tokens.accessToken, tokens.refreshToken);

    // 5. Return response
    apiResponse.success(res, 'Login successful', {
        user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            profileImage: user.profileImage,
        },
        accessToken: tokens.accessToken,
    });
});
```

**Success Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "admin",
      "profileImage": "https://example.com/avatar.jpg"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Cookies Set:**
```
Set-Cookie: accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900
Set-Cookie: refreshToken=abc123def456...; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

### Logout Endpoint Implementation

**Endpoint:** `POST /api/auth/logout`

**Request:**
```http
POST /api/auth/logout HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Cookie: accessToken=...; refreshToken=...
```

**Backend Processing:**
```typescript
logout = asyncHandler(async (req: AuthRequest, res: Response) => {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    if (refreshToken) {
        // Revoke refresh token in database
        await jwtService.revokeToken(refreshToken);
    }

    // Clear cookies
    cookieHelper.clearTokens(res);

    apiResponse.success(res, 'Logout successful');
});
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Cookies Cleared:**
```
Set-Cookie: accessToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
Set-Cookie: refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

---

## Admin User Management

### Creating First Admin User

**Method 1: Database Direct Insert**

```javascript
// MongoDB Shell
db.users.insertOne({
  email: "admin@example.com",
  name: "Admin User",
  // Password: "Admin@123" (hashed with bcrypt)
  password: "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7sJ5jnVe1m",
  role: "admin",
  isActive: true,
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

**Method 2: Using Signup API + Manual Update**

```bash
# 1. Sign up normally
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123",
    "name": "Admin User",
    "role": "student"
  }'

# 2. Update role in database
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

**Method 3: Admin Creation Script** (Recommended)

```typescript
// scripts/createAdmin.ts
import mongoose from 'mongoose';
import User from './src/models/User';
import bcrypt from 'bcryptjs';

async function createAdmin() {
    await mongoose.connect(process.env.MONGODB_URI!);

    const hashedPassword = await bcrypt.hash('Admin@123', 12);

    const admin = await User.create({
        email: 'admin@example.com',
        name: 'Admin User',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true,
    });

    console.log('Admin created:', admin.email);
    process.exit(0);
}

createAdmin();
```

Run with: `ts-node scripts/createAdmin.ts`

### Adding More Admin Users

**Endpoint:** `POST /api/admin/users/create-admin` (To be implemented)

**Request:**
```http
POST /api/admin/users/create-admin HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: abc123...
Content-Type: application/json

{
  "email": "newadmin@example.com",
  "name": "New Admin",
  "password": "SecureP@ss456"
}
```

**Implementation:**
```typescript
// src/controllers/adminUserController.ts
createAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
    // Only existing admins can create new admins
    if (req.user?.role !== 'admin') {
        return apiResponse.forbidden(res);
    }

    const { email, name, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
        return apiResponse.conflict(res, 'User already exists');
    }

    // Create admin user
    const admin = await User.create({
        email,
        name,
        password,
        role: 'admin',
        isEmailVerified: true,
    });

    apiResponse.created(res, 'Admin created successfully', {
        admin: {
            id: admin._id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
        },
    });
});
```

### Validating Admin Users

**Method 1: Check on Every Request** (Current Implementation)

```typescript
// src/middlewares/authMiddleware.ts
export const authorize = (...allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;

        if (!authReq.user) {
            return apiResponse.unauthorized(res, 'User not authenticated');
        }

        // Check if user's role is in allowed roles
        if (!allowedRoles.includes(authReq.user.role)) {
            return apiResponse.forbidden(
                res,
                'You do not have permission to access this resource'
            );
        }

        next();
    };
};

// Usage in routes
router.use(authenticate);
router.use(authorize(UserRole.ADMIN));
```

**Method 2: Database Validation** (Additional Security)

```typescript
// Enhanced validation
export const validateAdminRole = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user) {
        return apiResponse.unauthorized(res);
    }

    // Re-fetch user from database to ensure role hasn't changed
    const user = await User.findById(req.user.userId);

    if (!user || user.role !== 'admin' || !user.isActive) {
        return apiResponse.forbidden(res, 'Admin access required');
    }

    next();
};
```

---

## Security Architecture

### Security Layers Overview

```
┌──────────────────────────────────────────────────────┐
│                  Request from Client                  │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 1: HELMET.JS - Secure HTTP Headers            │
│  - X-Frame-Options: DENY                             │
│  - X-Content-Type-Options: nosniff                   │
│  - Strict-Transport-Security                         │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 2: CORS - Cross-Origin Protection             │
│  - Only allow specified origins                      │
│  - Credentials: true (for cookies)                   │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 3: RATE LIMITING - Brute Force Protection     │
│  - Max 100 requests per 15 min (general)             │
│  - Max 5 login attempts per 15 min (auth)            │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 4: AUTHENTICATION - JWT Validation            │
│  - Verify JWT signature                              │
│  - Check token expiry                                │
│  - Extract user info                                 │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 5: AUTHORIZATION - Role Check                 │
│  - Verify user.role === 'admin'                      │
│  - Reject if not admin                               │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 6: CSRF PROTECTION - Token Validation         │
│  - Check x-csrf-token header (POST/PUT/DELETE)       │
│  - Validate against stored token                     │
│  - Check token expiry (24h)                          │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 7: INPUT VALIDATION - Zod Schema              │
│  - Validate request body                             │
│  - Validate query params                             │
│  - Validate URL params                               │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│  Layer 8: MONGODB SANITIZATION - NoSQL Injection     │
│  - Remove $ operators from input                     │
│  - Prevent query injection                           │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│         Controller Executes → Database Query          │
└──────────────────────────────────────────────────────┘
```

### CSRF Protection Implementation

**How CSRF Works:**

1. **Client requests CSRF token** (authenticated)
   ```http
   GET /api/admin/blog/csrf-token
   Authorization: Bearer <jwt>
   ```

2. **Server generates and stores token**
   ```typescript
   const token = crypto.randomBytes(32).toString('hex');
   csrfTokens.set(userId, { token, createdAt: Date.now() });
   return token;
   ```

3. **Client receives token**
   ```json
   {
     "success": true,
     "data": {
       "csrfToken": "a1b2c3d4e5f6..."
     }
   }
   ```

4. **Client includes token in mutation requests**
   ```http
   POST /api/admin/blog/posts
   Authorization: Bearer <jwt>
   x-csrf-token: a1b2c3d4e5f6...
   ```

5. **Server validates token**
   ```typescript
   const csrfToken = req.headers['x-csrf-token'];
   const stored = csrfTokens.get(req.user.userId);

   if (!stored || stored.token !== csrfToken) {
       return apiResponse.forbidden(res, 'Invalid CSRF token');
   }

   if (Date.now() - stored.createdAt > 24 * 60 * 60 * 1000) {
       return apiResponse.forbidden(res, 'CSRF token expired');
   }
   ```

**CSRF Token Lifecycle:**

```
Token Generation → Storage (in-memory Map) → Client Storage (React state)
                        │                            │
                        │                            │
                    24 hours                     Per request
                        │                            │
                        ▼                            ▼
                   Auto cleanup              Included in header
```

### Security Rules Backend MUST Follow

#### ✅ **Rule 1: Never Trust Client Data**

```typescript
// ❌ WRONG - Trusting client role
const user = await User.findById(req.body.userId);
if (req.body.isAdmin) {  // Client can manipulate this!
    // Grant admin access
}

// ✅ CORRECT - Verify from JWT and database
const user = await User.findById(req.user.userId);  // From JWT
if (user.role === 'admin') {  // From database
    // Grant admin access
}
```

#### ✅ **Rule 2: Always Validate Input**

```typescript
// ❌ WRONG - No validation
const post = await Blog.create(req.body);

// ✅ CORRECT - Zod validation
const validated = createPostSchema.parse(req.body);
const post = await Blog.create(validated);
```

#### ✅ **Rule 3: Sanitize Database Queries**

```typescript
// ❌ WRONG - SQL/NoSQL injection risk
const user = await User.findOne({ email: req.query.email });

// ✅ CORRECT - Sanitized
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize());  // Removes $ and . from req.body, req.query, req.params
```

#### ✅ **Rule 4: Use HTTP-Only Cookies for Tokens**

```typescript
// ❌ WRONG - Token in response body only (XSS risk)
res.json({ token: accessToken });

// ✅ CORRECT - HTTP-only cookie + response body
res.cookie('accessToken', accessToken, {
    httpOnly: true,  // JavaScript cannot access
    secure: true,    // HTTPS only
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000  // 15 minutes
});
res.json({ accessToken });  // Also in body for mobile apps
```

#### ✅ **Rule 5: Rate Limit All Endpoints**

```typescript
// General API rate limit
const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,  // 100 requests per window
    message: 'Too many requests, please try again later',
});

// Strict rate limit for auth endpoints
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,  // Only 5 login attempts
    message: 'Too many login attempts, please try again later',
});

app.use('/api', generalRateLimiter);
app.use('/api/auth/login', authRateLimiter);
```

#### ✅ **Rule 6: Hash Passwords Properly**

```typescript
// ❌ WRONG - Plain text or weak hashing
user.password = req.body.password;
user.password = md5(req.body.password);

// ✅ CORRECT - bcrypt with high salt rounds
const salt = await bcrypt.genSalt(12);  // 12 rounds
user.password = await bcrypt.hash(req.body.password, salt);
```

#### ✅ **Rule 7: Verify File Uploads**

```typescript
// File upload validation
const fileFilter = (req, file, cb) => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Invalid file type'));
    }

    // Check file size (handled by multer limits)
    cb(null, true);
};

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,  // 5MB max
        files: 1,  // One file at a time
    },
});
```

#### ✅ **Rule 8: Set Secure Headers**

```typescript
import helmet from 'helmet';

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,  // 1 year
        includeSubDomains: true,
    },
}));
```

#### ✅ **Rule 9: Implement Proper Error Handling**

```typescript
// ❌ WRONG - Exposing internal errors
catch (error) {
    res.status(500).json({ error: error.stack });
}

// ✅ CORRECT - Generic error messages
catch (error) {
    logger.error('Database error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
    });
}
```

#### ✅ **Rule 10: Log Security Events**

```typescript
// Log all authentication events
logger.info('Login attempt', {
    email: req.body.email,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    success: true,
});

// Log admin actions
logger.info('Admin action', {
    userId: req.user.userId,
    action: 'DELETE_POST',
    resource: req.params.slug,
    ip: req.ip,
});
```

---

## API Endpoints Reference

### Base URL

```
Development: http://localhost:5000
Production: https://api.yourdomain.com
```

### Admin Blog Endpoints

**Base Path:** `/api/admin/blog`

**Authentication Required:** All endpoints require:
- Valid JWT token (in `Authorization: Bearer <token>` header OR `accessToken` cookie)
- User role: `admin`
- CSRF token (for POST/PUT/DELETE in `x-csrf-token` header)

---

### 1. Get CSRF Token

**Endpoint:** `GET /api/admin/blog/csrf-token`

**Description:** Get CSRF token for subsequent mutation requests.

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "CSRF token generated",
  "data": {
    "csrfToken": "a1b2c3d4e5f6789012345678901234567890abcdef"
  }
}
```

**Frontend Usage:**
```javascript
// 1. Get CSRF token
const { data } = await axios.get('/api/admin/blog/csrf-token');
const csrfToken = data.data.csrfToken;

// 2. Store in state
setCsrfToken(csrfToken);

// 3. Use in mutations
await axios.post('/api/admin/blog/posts', postData, {
  headers: { 'x-csrf-token': csrfToken }
});
```

---

### 2. List All Posts (Admin View)

**Endpoint:** `GET /api/admin/blog/posts`

**Description:** Get all posts including drafts. Supports pagination and filtering.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 10 | Posts per page (max: 50) |
| `published` | boolean | No | - | Filter by published status |
| `search` | string | No | - | Full-text search |
| `category` | string | No | - | Filter by category |
| `tag` | string | No | - | Filter by tag |
| `featured` | boolean | No | - | Filter featured posts |

**Request Example:**
```http
GET /api/admin/blog/posts?page=1&limit=10&published=false HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": {
    "data": [
      {
        "_id": "65a1b2c3d4e5f6789012345",
        "slug": "my-first-blog-post",
        "title": "My First Blog Post",
        "description": "This is a description of my first blog post that explains what readers will learn.",
        "excerpt": "This is a description of my first blog post that explains what...",
        "author": "John Doe",
        "authorId": "507f1f77bcf86cd799439011",
        "publishedAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T14:20:00.000Z",
        "tags": ["javascript", "tutorial", "beginners"],
        "category": "programming",
        "coverImage": "/uploads/blog/covers/1234567890-abc123.webp",
        "featured": false,
        "published": false,
        "readingTime": "5 min read",
        "views": 0,
        "likes": 0,
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

**Note:** Content field is excluded from list view for performance.

---

### 3. Get Single Post

**Endpoint:** `GET /api/admin/blog/posts/:slug`

**Description:** Get full post details including content.

**Request:**
```http
GET /api/admin/blog/posts/my-first-blog-post HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "success": true,
  "message": "Post retrieved successfully",
  "data": {
    "post": {
      "_id": "65a1b2c3d4e5f6789012345",
      "slug": "my-first-blog-post",
      "title": "My First Blog Post",
      "description": "This is a description of my first blog post that explains what readers will learn.",
      "content": "# Introduction\n\nThis is the full content of my blog post written in markdown...\n\n## Section 1\n\nMore content here...",
      "excerpt": "This is a description of my first blog post that explains what...",
      "author": "John Doe",
      "authorId": "507f1f77bcf86cd799439011",
      "publishedAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T14:20:00.000Z",
      "tags": ["javascript", "tutorial", "beginners"],
      "category": "programming",
      "coverImage": "/uploads/blog/covers/1234567890-abc123.webp",
      "featured": false,
      "published": false,
      "readingTime": "5 min read",
      "series": {
        "name": "JavaScript Fundamentals",
        "order": 1
      },
      "seo": {
        "metaTitle": "Learn JavaScript Basics - Complete Tutorial",
        "metaDescription": "A comprehensive guide to JavaScript fundamentals for beginners.",
        "keywords": ["javascript", "programming", "web development"],
        "canonicalUrl": "https://yourdomain.com/blog/my-first-blog-post"
      },
      "tableOfContents": [
        {
          "id": "introduction",
          "title": "Introduction",
          "level": 2
        },
        {
          "id": "section-1",
          "title": "Section 1",
          "level": 2
        }
      ],
      "views": 0,
      "likes": 0,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

---

### 4. Create New Post

**Endpoint:** `POST /api/admin/blog/posts`

**Description:** Create a new blog post (draft or published).

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: a1b2c3d4e5f6789012345678901234567890abcdef
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Advanced TypeScript Patterns",
  "description": "Learn advanced TypeScript patterns and best practices for building scalable applications.",
  "content": "# Introduction\n\nIn this post, we'll explore advanced TypeScript patterns...\n\n## Generics\n\nGenerics allow you to create reusable components...",
  "excerpt": "Learn advanced TypeScript patterns including generics, decorators, and utility types.",
  "author": "Jane Smith",
  "tags": ["typescript", "programming", "advanced"],
  "category": "programming",
  "coverImage": "/uploads/blog/covers/1705330800-xyz789.webp",
  "featured": true,
  "published": false,
  "series": {
    "name": "TypeScript Mastery",
    "order": 3
  },
  "seo": {
    "metaTitle": "Advanced TypeScript Patterns - Complete Guide",
    "metaDescription": "Master advanced TypeScript patterns with practical examples and best practices.",
    "keywords": ["typescript", "generics", "decorators", "utility types"],
    "canonicalUrl": "https://yourdomain.com/blog/advanced-typescript-patterns"
  }
}
```

**Field Validation:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `title` | string | ✅ | 5-200 chars |
| `description` | string | ✅ | 20-500 chars |
| `content` | string | ✅ | min 50 chars |
| `author` | string | ✅ | min 2 chars |
| `tags` | string[] | ✅ | 1-10 tags |
| `category` | string | ✅ | min 2 chars |
| `excerpt` | string | ❌ | max 300 chars |
| `coverImage` | string | ❌ | valid URL |
| `featured` | boolean | ❌ | default: false |
| `published` | boolean | ❌ | default: false |
| `series` | object | ❌ | {name, order} |
| `seo` | object | ❌ | meta fields |

**Success Response:**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "_id": "65a1b2c3d4e5f6789012346",
      "slug": "advanced-typescript-patterns",
      "title": "Advanced TypeScript Patterns",
      "description": "Learn advanced TypeScript patterns and best practices...",
      "content": "# Introduction\n\nIn this post, we'll explore...",
      "author": "Jane Smith",
      "authorId": "507f1f77bcf86cd799439011",
      "publishedAt": "2025-01-16T09:00:00.000Z",
      "tags": ["typescript", "programming", "advanced"],
      "category": "programming",
      "featured": true,
      "published": false,
      "readingTime": "12 min read",
      "createdAt": "2025-01-16T09:00:00.000Z",
      "updatedAt": "2025-01-16T09:00:00.000Z"
    }
  }
}
```

**Backend Processing:**

1. **Validate Input** (Zod schema)
2. **Auto-generate Slug** (from title if not provided)
3. **Calculate Reading Time** (word count ÷ 200 wpm)
4. **Generate Excerpt** (from content if not provided)
5. **Set Author ID** (from authenticated user)
6. **Save to Database**
7. **Return Created Post**

---

### 5. Update Post

**Endpoint:** `PUT /api/admin/blog/posts/:slug`

**Description:** Update existing blog post. Only provided fields are updated.

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: a1b2c3d4e5f6789012345678901234567890abcdef
Content-Type: application/json
```

**Request:**
```http
PUT /api/admin/blog/posts/advanced-typescript-patterns HTTP/1.1

{
  "title": "Advanced TypeScript Patterns (Updated)",
  "featured": true,
  "tags": ["typescript", "programming", "advanced", "design-patterns"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Post updated successfully",
  "data": {
    "post": {
      "_id": "65a1b2c3d4e5f6789012346",
      "slug": "advanced-typescript-patterns",
      "title": "Advanced TypeScript Patterns (Updated)",
      "featured": true,
      "tags": ["typescript", "programming", "advanced", "design-patterns"],
      "updatedAt": "2025-01-16T10:30:00.000Z"
    }
  }
}
```

---

### 6. Delete Post

**Endpoint:** `DELETE /api/admin/blog/posts/:slug`

**Description:** Permanently delete a blog post and its cover image.

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: a1b2c3d4e5f6789012345678901234567890abcdef
```

**Request:**
```http
DELETE /api/admin/blog/posts/old-post HTTP/1.1
```

**Backend Processing:**
1. Find post by slug
2. Delete cover image from filesystem (if exists)
3. Delete post from database
4. Return success

**Response:**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

---

### 7. Publish Post

**Endpoint:** `POST /api/admin/blog/posts/:slug/publish`

**Description:** Publish a draft post (set `published: true`, update `publishedAt`).

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: a1b2c3d4e5f6789012345678901234567890abcdef
```

**Request:**
```http
POST /api/admin/blog/posts/my-first-blog-post/publish HTTP/1.1
```

**Response:**
```json
{
  "success": true,
  "message": "Post published successfully",
  "data": {
    "post": {
      "_id": "65a1b2c3d4e5f6789012345",
      "slug": "my-first-blog-post",
      "published": true,
      "publishedAt": "2025-01-16T11:00:00.000Z"
    }
  }
}
```

---

### 8. Unpublish Post

**Endpoint:** `POST /api/admin/blog/posts/:slug/unpublish`

**Description:** Convert published post back to draft (set `published: false`).

**Request:**
```http
POST /api/admin/blog/posts/my-first-blog-post/unpublish HTTP/1.1
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Post unpublished successfully",
  "data": {
    "post": {
      "_id": "65a1b2c3d4e5f6789012345",
      "slug": "my-first-blog-post",
      "published": false
    }
  }
}
```

---

### 9. Upload Cover Image

**Endpoint:** `POST /api/admin/blog/upload/cover`

**Description:** Upload and process cover image for blog post.

**Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-csrf-token: a1b2c3d4e5f6789012345678901234567890abcdef
Content-Type: multipart/form-data
```

**Request Body:** (multipart/form-data)
```
image: <binary file data>
```

**Constraints:**
- **Max Size:** 5 MB
- **Allowed Types:** JPEG, PNG, WebP
- **Min Dimensions:** 800x400 pixels
- **Processing:** Auto-resize to 1200x630, convert to WebP

**cURL Example:**
```bash
curl -X POST http://localhost:5000/api/admin/blog/upload/cover \
  -H "Authorization: Bearer <token>" \
  -H "x-csrf-token: <csrf-token>" \
  -F "image=@/path/to/cover.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Cover image uploaded successfully",
  "data": {
    "url": "/uploads/blog/covers/1705330800-abc123def456.webp"
  }
}
```

**Backend Processing:**
1. Validate file type (JPEG/PNG/WebP only)
2. Validate file size (max 5MB)
3. Validate dimensions (min 800x400)
4. Process with Sharp:
   - Resize to 1200x630 (cover fit)
   - Convert to WebP (quality: 85)
5. Save to `/public/uploads/blog/covers/`
6. Return URL

**Error Responses:**
```json
// File too large
{
  "success": false,
  "message": "Cover image size exceeds 5MB limit"
}

// Invalid dimensions
{
  "success": false,
  "message": "Cover image must be at least 800x400 pixels"
}

// Invalid type
{
  "success": false,
  "message": "Invalid file type. Only JPEG, PNG, and WebP images are allowed."
}
```

---

### 10. Upload Inline Image

**Endpoint:** `POST /api/admin/blog/upload/inline`

**Description:** Upload inline image for use within blog post content.

**Headers:**
```http
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
Content-Type: multipart/form-data
```

**Request Body:**
```
image: <binary file data>
```

**Constraints:**
- **Max Size:** 10 MB
- **Allowed Types:** JPEG, PNG, WebP
- **Processing:** Max width 1000px, convert to WebP

**Response:**
```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "url": "/uploads/blog/inline/1705331000-xyz789.webp"
  }
}
```

**Usage in Markdown:**
```markdown
![Image description](/uploads/blog/inline/1705331000-xyz789.webp)
```

---

### 11. Upload Multiple Images

**Endpoint:** `POST /api/admin/blog/upload/multiple`

**Description:** Upload multiple inline images at once (max 10).

**Headers:**
```http
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
Content-Type: multipart/form-data
```

**Request Body:**
```
images[]: <binary file data>
images[]: <binary file data>
images[]: <binary file data>
```

**Response:**
```json
{
  "success": true,
  "message": "Images uploaded successfully",
  "data": {
    "urls": [
      "/uploads/blog/inline/1705331100-img1.webp",
      "/uploads/blog/inline/1705331101-img2.webp",
      "/uploads/blog/inline/1705331102-img3.webp"
    ]
  }
}
```

---

### 12. Delete Image

**Endpoint:** `DELETE /api/admin/blog/upload`

**Description:** Delete uploaded image from server.

**Headers:**
```http
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "/uploads/blog/inline/1705331000-xyz789.webp"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

---

### 13. Get Statistics

**Endpoint:** `GET /api/admin/blog/stats`

**Description:** Get blog statistics for admin dashboard.

**Request:**
```http
GET /api/admin/blog/stats HTTP/1.1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Stats retrieved successfully",
  "data": {
    "totalPosts": 45,
    "publishedPosts": 32,
    "draftPosts": 13,
    "totalViews": 125678,
    "totalLikes": 8945,
    "totalCategories": 7,
    "totalTags": 42
  }
}
```

---

### 14. Category Management

**Get All Categories:**
```http
GET /api/admin/blog/categories
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "_id": "65a1b2c3d4e5f6789012347",
        "slug": "programming",
        "name": "Programming",
        "description": "Programming tutorials and guides",
        "icon": "💻",
        "color": "#3B82F6",
        "order": 1,
        "postCount": 25
      }
    ]
  }
}
```

**Create Category:**
```http
POST /api/admin/blog/categories
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
Content-Type: application/json

{
  "slug": "web-development",
  "name": "Web Development",
  "description": "Frontend and backend web development",
  "icon": "🌐",
  "color": "#10B981",
  "order": 2
}
```

**Update Category:**
```http
PUT /api/admin/blog/categories/programming
Authorization: Bearer <token>
x-csrf-token: <csrf-token>

{
  "name": "Programming & Software",
  "order": 1
}
```

**Delete Category:**
```http
DELETE /api/admin/blog/categories/old-category
Authorization: Bearer <token>
x-csrf-token: <csrf-token>
```

**Note:** Cannot delete categories with existing posts.

---

### 15. Tag Management

**Get All Tags:**
```http
GET /api/admin/blog/tags
```

**Create Tag:**
```http
POST /api/admin/blog/tags
Authorization: Bearer <token>
x-csrf-token: <csrf-token>

{
  "slug": "react",
  "name": "React",
  "description": "React.js library and ecosystem"
}
```

**Update Tag:**
```http
PUT /api/admin/blog/tags/react

{
  "name": "React.js",
  "description": "React.js library, hooks, and ecosystem"
}
```

**Delete Tag:**
```http
DELETE /api/admin/blog/tags/old-tag
```

---

### 16. Series Management

**Get All Series:**
```http
GET /api/admin/blog/series
```

**Create Series:**
```http
POST /api/admin/blog/series
Authorization: Bearer <token>
x-csrf-token: <csrf-token>

{
  "slug": "typescript-mastery",
  "name": "TypeScript Mastery",
  "description": "Complete TypeScript tutorial series",
  "coverImage": "/uploads/blog/covers/series-ts.webp"
}
```

**Update Series:**
```http
PUT /api/admin/blog/series/typescript-mastery

{
  "description": "Complete TypeScript tutorial series from basics to advanced"
}
```

**Delete Series:**
```http
DELETE /api/admin/blog/series/old-series
```

---

## Data Flow & Request/Response Examples

### Complete Flow: Create and Publish Blog Post

```
┌────────────────────────────────────────────────────────────┐
│                   Frontend Admin Panel                      │
└───────────────────────────┬────────────────────────────────┘
                            │
                            │ Step 1: Get CSRF Token
                            ▼
                    ┌───────────────┐
                    │ GET /csrf-token│
                    └───────┬───────┘
                            │
                    ┌───────▼────────────────────┐
                    │  Store CSRF in state       │
                    │  csrfToken = "abc123..."   │
                    └───────┬────────────────────┘
                            │
                            │ Step 2: Upload Cover Image
                            ▼
              ┌─────────────────────────────┐
              │ POST /upload/cover          │
              │ FormData: { image: File }   │
              │ Headers: { x-csrf-token }   │
              └─────────┬───────────────────┘
                        │
              ┌─────────▼────────────────────┐
              │ Backend processes image:     │
              │ - Validate type/size/dims    │
              │ - Resize to 1200x630         │
              │ - Convert to WebP            │
              │ - Save to filesystem         │
              └─────────┬────────────────────┘
                        │
              ┌─────────▼──────────────────┐
              │ Response:                  │
              │ { url: "/uploads/..." }    │
              └─────────┬──────────────────┘
                        │
              ┌─────────▼────────────────────┐
              │ Store coverImage in form     │
              │ coverImage = url             │
              └─────────┬────────────────────┘
                        │
                        │ Step 3: User Writes Content
                        ▼
              ┌──────────────────────────────┐
              │ User fills form:             │
              │ - Title                      │
              │ - Description                │
              │ - Content (markdown)         │
              │ - Tags                       │
              │ - Category                   │
              │ - Keep as draft ☑            │
              └──────────┬───────────────────┘
                         │
                         │ Step 4: Save as Draft
                         ▼
              ┌──────────────────────────────┐
              │ POST /posts                  │
              │ Body: {                      │
              │   title,                     │
              │   description,               │
              │   content,                   │
              │   tags,                      │
              │   category,                  │
              │   coverImage,                │
              │   published: false // Draft  │
              │ }                            │
              │ Headers: { x-csrf-token }    │
              └──────────┬───────────────────┘
                         │
              ┌──────────▼───────────────────────┐
              │ Backend validates & saves:       │
              │ - Validate with Zod              │
              │ - Auto-generate slug             │
              │ - Calculate reading time         │
              │ - Generate excerpt               │
              │ - Set authorId                   │
              │ - Save to database               │
              └──────────┬───────────────────────┘
                         │
              ┌──────────▼─────────────┐
              │ Response:              │
              │ { post: {...} }        │
              │ Status: 201 Created    │
              └──────────┬─────────────┘
                         │
              ┌──────────▼────────────────────┐
              │ Show success message          │
              │ "Draft saved successfully"    │
              └──────────┬────────────────────┘
                         │
                         │ Step 5: Preview (Optional)
                         ▼
              ┌────────────────────────────────┐
              │ GET /posts/:slug               │
              │ Render markdown in preview UI  │
              └────────────┬───────────────────┘
                           │
                           │ Step 6: Publish
                           ▼
              ┌────────────────────────────────┐
              │ POST /posts/:slug/publish      │
              │ Headers: { x-csrf-token }      │
              └────────────┬───────────────────┘
                           │
              ┌────────────▼─────────────────────┐
              │ Backend:                         │
              │ - Set published = true           │
              │ - Update publishedAt = now       │
              │ - Save to database               │
              └────────────┬─────────────────────┘
                           │
              ┌────────────▼─────────────────┐
              │ Response:                    │
              │ { post: { published: true }} │
              └────────────┬─────────────────┘
                           │
              ┌────────────▼──────────────────┐
              │ Show success message          │
              │ "Post published successfully" │
              │ Redirect to blog list         │
              └───────────────────────────────┘
```

### Form Data Structure

**Frontend Form State:**
```typescript
interface BlogPostFormData {
  // Basic Info
  title: string;
  description: string;
  content: string;  // Markdown
  excerpt?: string;
  author: string;

  // Taxonomy
  tags: string[];
  category: string;

  // Media
  coverImage?: string;  // URL from upload endpoint

  // Options
  featured: boolean;
  published: boolean;  // false = draft, true = published

  // Series (Optional)
  series?: {
    name: string;
    order: number;
  };

  // SEO (Optional)
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };
}
```

**How Form Data is Sent:**

```javascript
// 1. Collect form data
const formData = {
  title: "My Blog Post",
  description: "A great blog post...",
  content: "# Introduction\n\nThis is my content...",
  author: "John Doe",
  tags: ["javascript", "tutorial"],
  category: "programming",
  coverImage: "/uploads/blog/covers/123.webp",  // From upload
  featured: false,
  published: false,  // Save as draft
};

// 2. Send as JSON (NOT FormData for post creation)
const response = await axios.post('/api/admin/blog/posts', formData, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'x-csrf-token': csrfToken,
  },
});

// 3. Handle response
if (response.data.success) {
  const post = response.data.data.post;
  console.log('Post created:', post.slug);
  router.push(`/admin/blog/edit/${post.slug}`);
}
```

**Important:**
- Image upload uses `multipart/form-data`
- Post creation/update uses `application/json`
- Never mix the two!

---

## Image Upload & Storage

### Image Storage Architecture

```
project-root/
├── public/
│   └── uploads/
│       └── blog/
│           ├── covers/           # Cover images (1200x630)
│           │   ├── 1705330800-abc123.webp
│           │   └── 1705330900-def456.webp
│           └── inline/           # Inline images (max 1000px width)
│               ├── 1705331000-xyz789.webp
│               └── 1705331100-img123.webp
└── src/
    └── services/
        └── uploadService.ts      # Image processing logic
```

### Image Processing Pipeline

```
┌─────────────────┐
│  Client uploads │
│  image file     │
└────────┬────────┘
         │
         ▼
┌────────────────────────────────┐
│  Multer Middleware             │
│  - Receive file in memory      │
│  - Validate file type          │
│  - Check file size             │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Sharp Image Processing        │
│                                │
│  For Cover Images:             │
│  - Validate min 800x400        │
│  - Resize to 1200x630 (cover)  │
│  - Convert to WebP (q: 85)     │
│                                │
│  For Inline Images:            │
│  - Resize max width 1000px     │
│  - Convert to WebP (q: 80)     │
│  - Maintain aspect ratio       │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Filesystem Storage            │
│  - Generate unique filename    │
│  - Save to public/uploads/     │
│  - Return URL path             │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Response to Client            │
│  { url: "/uploads/..." }       │
└────────────────────────────────┘
```

### Image Upload Implementation

**Upload Service:**
```typescript
// src/services/uploadService.ts

import sharp from 'sharp';
import multer from 'multer';

// Process cover image
export async function processCoverImage(file: Express.Multer.File) {
    const filename = generateFilename(file.originalname);
    const filepath = path.join(COVER_DIR, filename);

    // Resize and optimize
    await sharp(file.buffer)
        .resize(1200, 630, {
            fit: 'cover',      // Crop to exact dimensions
            position: 'center',
        })
        .webp({ quality: 85 })
        .toFile(filepath.replace(path.extname(filepath), '.webp'));

    return {
        url: `/uploads/blog/covers/${filename.replace(/\.[^.]+$/, '.webp')}`,
        filename,
    };
}

// Process inline image
export async function processInlineImage(file: Express.Multer.File) {
    const filename = generateFilename(file.originalname);
    const filepath = path.join(INLINE_DIR, filename);

    // Resize and optimize
    await sharp(file.buffer)
        .resize(1000, null, {
            fit: 'inside',              // Max width 1000px
            withoutEnlargement: true,   // Don't upscale small images
        })
        .webp({ quality: 80 })
        .toFile(filepath.replace(path.extname(filepath), '.webp'));

    return {
        url: `/uploads/blog/inline/${filename.replace(/\.[^.]+$/, '.webp')}`,
        filename,
    };
}

// Generate unique filename
function generateFilename(originalName: string): string {
    const ext = path.extname(originalName);
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${Date.now()}-${randomName}${ext}`;
}
```

### Frontend Image Upload Component

```typescript
// components/ImageUploader.tsx
import { useDropzone } from 'react-dropzone';
import { blogAPI } from '@/lib/api/blog';

export function ImageUploader({ type, value, onChange }) {
  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    setUploading(true);

    try {
      const file = acceptedFiles[0];

      // Upload to backend
      const url = type === 'cover'
        ? await blogAPI.uploadCoverImage(file)
        : await blogAPI.uploadInlineImage(file);

      // Update form state
      onChange(url);
    } catch (error) {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
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
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {uploading ? (
        <p>Uploading...</p>
      ) : value ? (
        <img src={value} alt="Preview" />
      ) : (
        <p>Drag & drop image here</p>
      )}
    </div>
  );
}
```

### Image URL Management

**Storing URLs:**
```typescript
// Frontend form state
const [coverImage, setCoverImage] = useState('');

// After upload
setCoverImage('/uploads/blog/covers/123.webp');

// Include in post data
const postData = {
  ...formData,
  coverImage,  // Store relative URL
};
```

**Displaying Images:**
```typescript
// In frontend (Next.js)
<Image
  src={post.coverImage}
  alt={post.title}
  width={1200}
  height={630}
/>

// Browser resolves to:
// http://localhost:3000/uploads/blog/covers/123.webp

// But backend serves from:
// http://localhost:5000/uploads/blog/covers/123.webp
```

**Production Setup:**
```typescript
// Serve static files in Express
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// OR use CDN
// Upload to S3/Cloudflare and store CDN URLs
const cdnUrl = `https://cdn.yourdomain.com/blog/covers/123.webp`;
```

---

## Draft vs Published Workflow

### Post Status States

```
┌─────────────┐
│   Created   │ ← POST /posts (published: false)
│   (Draft)   │
└──────┬──────┘
       │
       │ Edit allowed
       │ ↓
       │
       │ POST /posts/:slug/publish
       ▼
┌─────────────┐
│  Published  │
│(Public view)│
└──────┬──────┘
       │
       │ POST /posts/:slug/unpublish
       ▼
┌─────────────┐
│Back to Draft│
│(Hidden from │
│  public)    │
└─────────────┘
```

### Database Schema

```typescript
// src/models/Blog.ts
{
  published: {
    type: Boolean,
    default: false,  // New posts are drafts by default
    index: true,
  },
  publishedAt: {
    type: Date,
    required: true,
    index: true,
  },
}
```

### Backend Logic

**Create as Draft:**
```typescript
// POST /api/admin/blog/posts
const post = await Blog.create({
  ...postData,
  published: false,  // Draft
  publishedAt: new Date(),  // Still set for sorting
  authorId: req.user.userId,
});
```

**Publish Draft:**
```typescript
// POST /api/admin/blog/posts/:slug/publish
const post = await Blog.findOne({ slug });
post.published = true;
post.publishedAt = new Date();  // Update to current time
await post.save();
```

**Unpublish:**
```typescript
// POST /api/admin/blog/posts/:slug/unpublish
const post = await Blog.findOne({ slug });
post.published = false;
await post.save();
// publishedAt remains for sorting purposes
```

### Public API vs Admin API

**Public API** (`/api/blog/posts`):
```typescript
// Only shows published posts
const posts = await Blog.find({ published: true })
  .sort({ publishedAt: -1 });
```

**Admin API** (`/api/admin/blog/posts`):
```typescript
// Shows all posts (drafts + published)
const query = {};

// Optional filter
if (req.query.published === 'true') {
  query.published = true;
} else if (req.query.published === 'false') {
  query.published = false;
}
// If not specified, show all

const posts = await Blog.find(query)
  .sort({ updatedAt: -1 });  // Sort by last updated for admin
```

### Frontend Implementation

**Draft Indicator:**
```tsx
// PostsList.tsx
{post.published ? (
  <span className="badge badge-success">Published</span>
) : (
  <span className="badge badge-warning">Draft</span>
)}
```

**Publish Button:**
```tsx
// PostEditor.tsx
{!post.published && (
  <button onClick={handlePublish}>
    Publish Now
  </button>
)}

const handlePublish = async () => {
  await blogAPI.publishPost(post.slug);
  alert('Post published!');
  router.push('/admin/blog');
};
```

### Preview Mode Implementation

**Option 1: Client-Side Preview**
```tsx
// PostEditor.tsx
const [previewMode, setPreviewMode] = useState(false);

{previewMode ? (
  <div className="preview">
    <ReactMarkdown>{formData.content}</ReactMarkdown>
  </div>
) : (
  <textarea
    value={formData.content}
    onChange={(e) => setFormData({...formData, content: e.target.value})}
  />
)}

<button onClick={() => setPreviewMode(!previewMode)}>
  {previewMode ? 'Edit' : 'Preview'}
</button>
```

**Option 2: Server-Side Preview Endpoint**
```typescript
// Backend: GET /api/admin/blog/posts/:slug/preview
preview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { slug } = req.params;

  // Fetch draft post
  const post = await Blog.findOne({ slug });

  if (!post) {
    return apiResponse.notFound(res, 'Post not found');
  }

  // Return full post data including content
  apiResponse.success(res, 'Preview retrieved', { post });
});

// Frontend: Show in preview UI
const { data } = await blogAPI.getPreview(slug);
const post = data.data.post;

// Render with same component as public blog
<BlogPostView post={post} isPreview={true} />
```

**Option 3: Preview Link (Recommended)**
```typescript
// Generate preview token
const previewToken = crypto.randomBytes(16).toString('hex');
await Blog.updateOne(
  { slug },
  { previewToken, previewExpires: Date.now() + 3600000 } // 1 hour
);

// Preview URL
const previewUrl = `https://yourdomain.com/blog/preview/${slug}?token=${previewToken}`;

// Public preview endpoint (no auth required, but token validated)
// GET /blog/preview/:slug?token=...
const post = await Blog.findOne({
  slug,
  previewToken: req.query.token,
  previewExpires: { $gt: Date.now() },
});

if (!post) {
  return res.status(404).send('Preview expired or invalid');
}

// Render post
```

---

## Backend Folder Structure

```
ai-tutor-node-backend/
├── src/
│   ├── config/
│   │   ├── database.ts           # MongoDB connection
│   │   ├── env.ts                # Environment variables
│   │   ├── logger.ts             # Winston logger
│   │   └── passport.ts           # OAuth config
│   │
│   ├── controllers/
│   │   ├── authController.ts            # Auth endpoints
│   │   ├── adminBlogController.ts       # Blog CRUD (Admin)
│   │   ├── adminMetaController.ts       # Tags/Categories/Series
│   │   └── blogController.ts            # Public blog endpoints
│   │
│   ├── middlewares/
│   │   ├── authMiddleware.ts            # JWT authentication
│   │   ├── csrfMiddleware.ts            # CSRF protection
│   │   ├── errorMiddleware.ts           # Error handling
│   │   ├── securityMiddleware.ts        # Helmet, CORS, rate limit
│   │   └── validationMiddleware.ts      # Zod validation
│   │
│   ├── models/
│   │   ├── User.ts                      # User model (with role)
│   │   ├── Blog.ts                      # Blog post model
│   │   ├── BlogMeta.ts                  # Category, Tag, Series models
│   │   └── RefreshToken.ts              # Refresh token model
│   │
│   ├── routes/
│   │   ├── authRoutes.ts                # Auth routes
│   │   ├── blogRoutes.ts                # Public blog routes
│   │   └── adminBlogRoutes.ts           # Admin blog routes
│   │
│   ├── services/
│   │   ├── jwtService.ts                # JWT generation/validation
│   │   ├── blogService.ts               # Blog business logic
│   │   └── uploadService.ts             # Image upload/processing
│   │
│   ├── types/
│   │   └── index.ts                     # TypeScript types
│   │
│   ├── utils/
│   │   ├── apiResponse.ts               # Standardized responses
│   │   └── cookieHelper.ts              # Cookie management
│   │
│   ├── validators/
│   │   ├── authValidator.ts             # Auth Zod schemas
│   │   └── blogValidator.ts             # Blog Zod schemas
│   │
│   └── server.ts                        # Express app entry point
│
├── public/
│   └── uploads/
│       └── blog/
│           ├── covers/                  # Cover images
│           └── inline/                  # Inline images
│
├── docs/
│   ├── ADMIN_BLOG_PANEL.md             # API documentation
│   ├── FRONTEND_INTEGRATION.md          # Frontend guide
│   └── BLOG_API.md                      # Public API docs
│
├── .env                                 # Environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

### Key Files Explained

#### `src/controllers/adminBlogController.ts`
- Handles all admin blog operations
- Methods: getAllPosts, getPost, createPost, updatePost, deletePost, publishPost, unpublishPost, uploadCoverImage, uploadInlineImage, deleteImage, getStats

#### `src/middlewares/csrfMiddleware.ts`
- Generates CSRF tokens
- Validates CSRF tokens on mutations
- Stores tokens in-memory (use Redis in production for multi-instance)

#### `src/services/uploadService.ts`
- Image upload configuration (Multer)
- Image processing (Sharp)
- Methods: processCoverImage, processInlineImage, deleteImage

#### `src/models/Blog.ts`
- Blog post schema
- Auto-generates slug from title
- Calculates reading time
- Generates excerpt from content

#### `src/routes/adminBlogRoutes.ts`
- All admin routes with security middleware
- Applies: authenticate → authorize(admin) → verifyCsrfToken

---

## Implementation Checklist

### ✅ Backend Setup

- [ ] Install dependencies
  ```bash
  npm install multer sharp mongoose bcryptjs jsonwebtoken zod
  npm install express-rate-limit helmet express-mongo-sanitize
  npm install @types/multer --save-dev
  ```

- [ ] Set environment variables
  ```env
  MONGODB_URI=mongodb://localhost:27017/blog
  JWT_ACCESS_SECRET=<your-secret>
  JWT_REFRESH_SECRET=<your-secret>
  JWT_ACCESS_EXPIRY=15m
  JWT_REFRESH_EXPIRY=7d
  COOKIE_SECURE=false  # true in production
  CORS_ORIGIN=http://localhost:3000
  NODE_ENV=development
  ```

- [ ] Create admin user in database

- [ ] Test authentication flow
  ```bash
  # Login
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"Admin@123"}'
  ```

- [ ] Test CSRF token generation
  ```bash
  curl -X GET http://localhost:5000/api/admin/blog/csrf-token \
    -H "Authorization: Bearer <token>"
  ```

- [ ] Test post creation
  ```bash
  curl -X POST http://localhost:5000/api/admin/blog/posts \
    -H "Authorization: Bearer <token>" \
    -H "x-csrf-token: <csrf-token>" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test Post","description":"A test post...",...}'
  ```

- [ ] Test image upload
  ```bash
  curl -X POST http://localhost:5000/api/admin/blog/upload/cover \
    -H "Authorization: Bearer <token>" \
    -H "x-csrf-token: <csrf-token>" \
    -F "image=@cover.jpg"
  ```

### ✅ Security Verification

- [ ] Verify admin-only access (try with non-admin user)
- [ ] Verify CSRF protection (try without CSRF token)
- [ ] Verify rate limiting (make 100+ requests quickly)
- [ ] Verify input validation (send invalid data)
- [ ] Verify file upload restrictions (try large file, wrong type)
- [ ] Check HTTP-only cookies are set
- [ ] Verify tokens expire correctly

### ✅ Frontend Integration

- [ ] Set up axios client with interceptors
- [ ] Implement authentication context
- [ ] Create admin route protection
- [ ] Build post editor component
- [ ] Build image upload component
- [ ] Test complete workflow (login → create → upload → publish)

---

## Testing Guide

### Manual Testing Scenarios

**1. Authentication Flow**
```bash
# Login
POST /api/auth/login
{
  "email": "admin@example.com",
  "password": "Admin@123"
}

# Expected: 200 OK, cookies set, accessToken in response

# Get CSRF
GET /api/admin/blog/csrf-token
Authorization: Bearer <token>

# Expected: 200 OK, csrfToken in response

# Access protected endpoint without token
GET /api/admin/blog/posts

# Expected: 401 Unauthorized

# Access with non-admin user
GET /api/admin/blog/posts
Authorization: Bearer <student-token>

# Expected: 403 Forbidden
```

**2. Blog Post CRUD**
```bash
# Create draft
POST /api/admin/blog/posts
{
  "title": "Test Post",
  "description": "This is a test post description...",
  "content": "# Test\n\nContent here...",
  "author": "Admin",
  "tags": ["test"],
  "category": "test",
  "published": false
}

# Expected: 201 Created

# Get post
GET /api/admin/blog/posts/test-post

# Expected: 200 OK, full post data

# Update post
PUT /api/admin/blog/posts/test-post
{
  "title": "Updated Test Post"
}

# Expected: 200 OK

# Publish post
POST /api/admin/blog/posts/test-post/publish

# Expected: 200 OK, published: true

# Verify public can see it
GET /api/blog/posts

# Expected: Post appears in list

# Unpublish
POST /api/admin/blog/posts/test-post/unpublish

# Expected: 200 OK, published: false

# Verify public cannot see it
GET /api/blog/posts

# Expected: Post not in list

# Delete
DELETE /api/admin/blog/posts/test-post

# Expected: 200 OK
```

**3. Image Upload**
```bash
# Upload cover
POST /api/admin/blog/upload/cover
[multipart/form-data with image file]

# Expected: 200 OK, URL in response

# Verify image exists
curl http://localhost:5000<returned-url>

# Expected: Image data

# Upload invalid file (too large, wrong type)
# Expected: 400 Bad Request with error message
```

**4. Security Tests**
```bash
# Try CSRF attack (without token)
POST /api/admin/blog/posts
{...data}
# NO x-csrf-token header

# Expected: 403 Forbidden

# Try with expired token
# Wait 24+ hours or manually expire token
POST /api/admin/blog/posts
# With old CSRF token

# Expected: 403 Forbidden

# Try SQL injection
POST /api/admin/blog/posts
{
  "title": "Test'; DROP TABLE blogs; --"
}

# Expected: Input validated, no injection

# Try NoSQL injection
GET /api/admin/blog/posts?category[$ne]=null

# Expected: Sanitized, safe query

# Rate limiting test
# Make 101+ requests rapidly

# Expected: 429 Too Many Requests
```

### Automated Testing (Jest)

```typescript
// tests/admin-blog.test.ts
describe('Admin Blog API', () => {
  let adminToken: string;
  let csrfToken: string;

  beforeAll(async () => {
    // Login as admin
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Admin@123',
      });

    adminToken = response.body.data.accessToken;
  });

  describe('POST /api/admin/blog/posts', () => {
    beforeEach(async () => {
      // Get fresh CSRF token
      const response = await request(app)
        .get('/api/admin/blog/csrf-token')
        .set('Authorization', `Bearer ${adminToken}`);

      csrfToken = response.body.data.csrfToken;
    });

    it('should create draft post with valid data', async () => {
      const response = await request(app)
        .post('/api/admin/blog/posts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Test Post',
          description: 'Test description...',
          content: '# Test\n\nContent...',
          author: 'Admin',
          tags: ['test'],
          category: 'test',
          published: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.post.published).toBe(false);
    });

    it('should reject without CSRF token', async () => {
      const response = await request(app)
        .post('/api/admin/blog/posts')
        .set('Authorization', `Bearer ${adminToken}`)
        // No CSRF token
        .send({...postData});

      expect(response.status).toBe(403);
    });

    it('should reject non-admin user', async () => {
      const studentToken = await getStudentToken();

      const response = await request(app)
        .post('/api/admin/blog/posts')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('x-csrf-token', csrfToken)
        .send({...postData});

      expect(response.status).toBe(403);
    });

    it('should validate input', async () => {
      const response = await request(app)
        .post('/api/admin/blog/posts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .send({
          title: 'Too', // Too short (min 5)
          description: 'Short', // Too short (min 20)
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });
  });
});
```

---

## Production Deployment

### Environment Configuration

**Production .env:**
```env
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/blog?retryWrites=true&w=majority

# JWT (Generate strong secrets!)
JWT_ACCESS_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cookies
COOKIE_SECURE=true  # ⚠️ MUST be true in production (requires HTTPS)
COOKIE_DOMAIN=yourdomain.com

# CORS
CORS_ORIGIN=https://yourdomain.com

# Server
PORT=5000
API_URL=https://api.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### Security Checklist for Production

- [ ] Set `NODE_ENV=production`
- [ ] Set `COOKIE_SECURE=true`
- [ ] Use HTTPS for all traffic
- [ ] Generate strong JWT secrets (64+ random characters)
- [ ] Set proper CORS origin (not `*`)
- [ ] Enable rate limiting
- [ ] Set up monitoring (logs, error tracking)
- [ ] Use environment variables (never hardcode secrets)
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Use Redis for CSRF tokens (multi-instance)
- [ ] Set up CDN for image serving
- [ ] Enable database connection pooling
- [ ] Set proper file upload limits
- [ ] Configure reverse proxy (nginx)
- [ ] Set up SSL certificates

### Deployment Steps

**1. Build TypeScript:**
```bash
npm run build
```

**2. Set up PM2 (Process Manager):**
```bash
npm install -g pm2

# Start server
pm2 start dist/server.js --name blog-api

# Save PM2 config
pm2 save

# Auto-restart on reboot
pm2 startup
```

**3. Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Upload size limit
    client_max_body_size 10M;

    # Proxy to Node.js
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve uploaded images
    location /uploads/ {
        alias /var/www/blog-api/public/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**4. SSL with Let's Encrypt:**
```bash
sudo certbot --nginx -d api.yourdomain.com
```

**5. Database Indexes:**
```javascript
// Run in MongoDB shell
db.blogs.createIndex({ slug: 1 }, { unique: true });
db.blogs.createIndex({ published: 1, publishedAt: -1 });
db.blogs.createIndex({ category: 1 });
db.blogs.createIndex({ tags: 1 });
db.blogs.createIndex({ title: "text", description: "text", content: "text" });
```

**6. Monitoring:**
```bash
# PM2 monitoring
pm2 monitor

# Or use services like:
# - Datadog
# - New Relic
# - Sentry (for error tracking)
```

---

## Summary

This backend implementation provides:

✅ **Enterprise-Grade Security**
- JWT + CSRF + RBAC + Rate Limiting + Input Validation

✅ **Complete Blog Management**
- Full CRUD with drafts, publishing, images, SEO

✅ **Production Ready**
- Error handling, logging, monitoring, scalability

✅ **Developer Friendly**
- Clean architecture, TypeScript, comprehensive docs

✅ **Frontend Ready**
- RESTful API, clear contracts, CORS configured

**Next Steps for Frontend Team:**
1. Read `FRONTEND_INTEGRATION.md` for setup guide
2. Implement authentication flow with JWT
3. Build admin dashboard with post management
4. Integrate image upload components
5. Test all workflows thoroughly
6. Deploy to production

**For Questions or Issues:**
- Check the troubleshooting section in docs
- Review API response error messages
- Check server logs for details
- Contact backend team with specific error codes

---

**Document Version:** 1.0
**Last Updated:** 2025-01-08
**Maintained By:** Backend Development Team
