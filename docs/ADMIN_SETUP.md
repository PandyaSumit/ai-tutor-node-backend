# Admin Configuration Guide

Complete guide to setting up and configuring admin users in the AI Tutor backend.

## Table of Contents

1. [Overview](#overview)
2. [Admin User Structure](#admin-user-structure)
3. [Creating Admin Users](#creating-admin-users)
4. [Authentication Flow](#authentication-flow)
5. [Authorization & Middleware](#authorization--middleware)
6. [API Endpoints](#api-endpoints)
7. [Testing Admin Access](#testing-admin-access)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The admin system uses:
- **MongoDB** for user storage
- **bcrypt** for password hashing (12 rounds)
- **JWT tokens** for authentication (access + refresh tokens)
- **Role-Based Access Control (RBAC)** for authorization
- **HTTP-only cookies** for token storage
- **CSRF protection** for admin routes

---

## Admin User Structure

### User Model Schema

```typescript
{
  email: string;           // Unique, lowercase email
  name: string;            // Admin's display name
  password: string;        // Hashed password (bcrypt, 12 rounds)
  role: 'admin';          // Role must be 'admin' (not 'student' or 'tutor')
  isActive: boolean;      // Must be true
  isEmailVerified: boolean; // Should be true for admins
  createdAt: Date;
  updatedAt: Date;
}
```

### Important Notes

1. **Password Hashing**: The User model has a `pre-save` hook that automatically hashes passwords. Always pass plain text passwords to `User.create()` or when setting `user.password`.

2. **Password Field**: The password field has `select: false` in the schema. You must use `.select('+password')` when you need to access it.

3. **Role Validation**: Only users with `role: 'admin'` can access admin endpoints.

---

## Creating Admin Users

### Method 1: Using the Admin Creation Script (Recommended)

```bash
npm run create-admin
```

This creates an admin user with:
- Email: `admin@example.com`
- Password: `Admin@123`
- Role: `admin`

**How it works:**

```typescript
// scripts/createAdmin.ts
const admin = await User.create({
  email: 'admin@example.com',
  name: 'Admin User',
  password: 'Admin@123',  // Plain text - model will hash it
  role: 'admin',
  isActive: true,
  isEmailVerified: true,
});
```

### Method 2: Using MongoDB Directly

```javascript
// Connect to MongoDB
use ai-tutor

// Create admin user (password will be hashed by application)
// DO NOT use this method - use the script instead
// This is for reference only
```

### Method 3: Fix/Recreate Admin User

If you have issues with the admin user (e.g., password not working):

```bash
npm run fix-admin
```

This will:
1. Check if admin exists
2. Verify the password works
3. Delete and recreate if password is wrong
4. Verify the new password immediately

---

## Authentication Flow

### 1. User Login Request

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```

### 2. Server Processing

```typescript
// src/controllers/authController.ts - login method

// 1. Find user by email (with password field)
const user = await User.findOne({
  email: email.toLowerCase()
}).select('+password');

// 2. Verify password exists
if (!user || !user.password) {
  return apiResponse.unauthorized(res, 'Invalid email or password');
}

// 3. Compare password using bcrypt
const isPasswordValid = await user.comparePassword(password);
if (!isPasswordValid) {
  return apiResponse.unauthorized(res, 'Invalid email or password');
}

// 4. Generate JWT tokens
const tokens = await jwtService.generateTokenPair(
  String(user._id),
  user.email,
  user.role,
  deviceInfo,
  ipAddress
);

// 5. Set HTTP-only cookies
cookieHelper.setTokens(res, tokens.accessToken, tokens.refreshToken);

// 6. Return user data and access token
return {
  user: {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role  // 'admin'
  },
  accessToken: tokens.accessToken
};
```

### 3. Password Comparison

```typescript
// src/models/User.ts - comparePassword method

userSchema.methods.comparePassword = async function(
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};
```

### 4. Token Storage

Tokens are stored in two ways:

1. **HTTP-only cookies** (for browser requests):
   - `accessToken` - expires in 15 minutes
   - `refreshToken` - expires in 7 days
   - Secure, HttpOnly, SameSite attributes

2. **Response body** (for mobile/API clients):
   - `accessToken` included in JSON response
   - Client stores it securely

---

## Authorization & Middleware

### Admin Authentication Middleware

```typescript
// src/middlewares/authMiddleware.ts

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  // 1. Check if user is authenticated
  if (!req.user) {
    return apiResponse.unauthorized(res, 'Authentication required');
  }

  // 2. Check if user has admin role
  if (req.user.role !== UserRole.ADMIN) {
    return apiResponse.forbidden(res, 'Admin access required');
  }

  next();
};
```

### How Middleware is Applied

```typescript
// src/routes/adminBlogRoutes.ts

import { authenticate, requireAdmin } from '@/middlewares/authMiddleware';

const router = Router();

// All admin routes require authentication AND admin role
router.use(authenticate);  // First: verify JWT token
router.use(requireAdmin);  // Second: verify admin role

// Now these routes are protected
router.get('/csrf-token', adminBlogController.getCsrfToken);
router.post('/posts', adminBlogController.createPost);
router.put('/posts/:id', adminBlogController.updatePost);
router.delete('/posts/:id', adminBlogController.deletePost);
```

### Authentication Middleware Flow

```typescript
// authenticate middleware:

// 1. Extract token from cookie or Authorization header
const token = req.cookies.accessToken ||
              req.headers.authorization?.replace('Bearer ', '');

// 2. Verify JWT token
const decoded = jwtService.verifyAccessToken(token);

// 3. Attach user info to request
req.user = {
  userId: decoded.userId,
  email: decoded.email,
  role: decoded.role  // 'admin'
};

// 4. Call next() to continue to requireAdmin
next();
```

---

## API Endpoints

### Public Endpoints (No Authentication)

```http
POST /api/auth/login
POST /api/auth/signup
GET  /api/blog/posts              # Public blog posts
GET  /api/blog/posts/:id
```

### Admin Endpoints (Require Admin Role)

```http
# CSRF Token
GET  /api/admin/blog/csrf-token

# Blog Management
GET    /api/admin/blog/posts           # Get all posts (including drafts)
POST   /api/admin/blog/posts           # Create new post
GET    /api/admin/blog/posts/:id       # Get single post
PUT    /api/admin/blog/posts/:id       # Update post
DELETE /api/admin/blog/posts/:id       # Delete post
PATCH  /api/admin/blog/posts/:id/publish    # Publish draft
PATCH  /api/admin/blog/posts/:id/unpublish  # Unpublish post

# Image Upload
POST   /api/admin/blog/upload          # Upload blog image
```

### Headers Required for Admin Endpoints

```http
Authorization: Bearer <accessToken>
X-CSRF-Token: <csrfToken>  (for POST/PUT/DELETE/PATCH)
Content-Type: application/json
```

---

## Testing Admin Access

### Step 1: Create Admin User

```bash
npm run create-admin
```

Expected output:
```
✅ Admin user created successfully!

═══════════════════════════════════════
📧 Email:     admin@example.com
🔑 Password:  Admin@123
👤 Name:      Admin User
🔐 Role:      admin
🆔 ID:        ...
═══════════════════════════════════════
```

### Step 2: Start Server

```bash
npm run dev
```

Expected output:
```
╔═══════════════════════════════════════╗
║   🚀 Server Started Successfully      ║
║   Port: 5000                          ║
║   API URL: http://localhost:5000      ║
╚═══════════════════════════════════════╝
```

**Note the port number!** Update `.env` if needed:
```env
PORT=5000
API_URL=http://localhost:5000
```

### Step 3: Test Login

```bash
npm run test-login
```

Expected output:
```
✅ Login successful!

User Details:
  ID: ...
  Email: admin@example.com
  Name: Admin User
  Role: admin

Access Token: eyJhbGciOiJIUzI1...

🔍 Testing admin endpoint access...

✅ Admin access confirmed!
CSRF Token: ...

🎉 All tests passed! Admin account is working correctly.
```

### Step 4: Manual Testing with cURL

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123"
  }' \
  -c cookies.txt

# 2. Get CSRF token
curl -X GET http://localhost:5000/api/admin/blog/csrf-token \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt

# 3. Create blog post
curl -X POST http://localhost:5000/api/admin/blog/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -b cookies.txt \
  -d '{
    "title": "Test Post",
    "content": "This is a test post",
    "excerpt": "Test excerpt",
    "status": "draft"
  }'
```

### Step 5: Test with Postman

**1. Login:**
- Method: POST
- URL: `http://localhost:5000/api/auth/login`
- Body (JSON):
  ```json
  {
    "email": "admin@example.com",
    "password": "Admin@123"
  }
  ```
- Save the `accessToken` from response

**2. Get CSRF Token:**
- Method: GET
- URL: `http://localhost:5000/api/admin/blog/csrf-token`
- Headers:
  - `Authorization: Bearer <accessToken>`
- Save the `csrfToken` from response

**3. Create Blog Post:**
- Method: POST
- URL: `http://localhost:5000/api/admin/blog/posts`
- Headers:
  - `Authorization: Bearer <accessToken>`
  - `X-CSRF-Token: <csrfToken>`
  - `Content-Type: application/json`
- Body (JSON):
  ```json
  {
    "title": "My First Blog Post",
    "content": "## Hello World\n\nThis is my first blog post!",
    "excerpt": "Introduction to my blog",
    "status": "published",
    "tags": ["tech", "tutorial"]
  }
  ```

---

## Troubleshooting

### Issue 1: "Invalid email or password" (401)

**Possible Causes:**
1. Admin user doesn't exist
2. Wrong credentials
3. Password was double-hashed (old bug)
4. Database connection issue

**Solution:**
```bash
# Recreate admin user with correct password
npm run fix-admin

# Verify it worked
npm run test-login
```

---

### Issue 2: "Unauthorized - Admin access required" (403)

**Possible Causes:**
1. User is not an admin (role is 'student' or 'tutor')
2. JWT token is invalid or expired
3. Token not included in request

**Solution:**

Check user role in database:
```javascript
db.users.findOne({ email: 'admin@example.com' }, { role: 1, email: 1 })

// Should return:
// { "_id": ..., "email": "admin@example.com", "role": "admin" }
```

If role is not 'admin':
```javascript
db.users.updateOne(
  { email: 'admin@example.com' },
  { $set: { role: 'admin' } }
)
```

---

### Issue 3: "Authentication required" (401)

**Possible Causes:**
1. No token sent with request
2. Token expired
3. Token malformed

**Solution:**

For browser/cookies:
- Check that cookies are being sent with request
- Check cookie domain and SameSite settings

For API/mobile:
- Include `Authorization: Bearer <token>` header
- Use token from login response

---

### Issue 4: "CSRF token validation failed" (403)

**Possible Causes:**
1. No CSRF token sent
2. Invalid CSRF token
3. CSRF token expired

**Solution:**

1. Get fresh CSRF token:
```bash
curl -X GET http://localhost:5000/api/admin/blog/csrf-token \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

2. Include it in mutating requests (POST/PUT/DELETE/PATCH):
```bash
-H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

---

### Issue 5: Connection Refused / Cannot Connect

**Possible Causes:**
1. Server not running
2. Wrong port
3. Firewall blocking connection

**Solution:**

1. Check if server is running:
```bash
npm run dev
```

2. Check what port it's running on (from server output)

3. Update `.env` to match:
```env
PORT=5000  # or whatever port the server is actually using
```

4. Test connection:
```bash
curl http://localhost:5000/health
```

---

### Issue 6: Password Verification Failed

**Possible Causes:**
1. Password was manually hashed before saving (double hashing)
2. bcrypt rounds mismatch
3. Database corruption

**Solution:**

The User model has a pre-save hook that automatically hashes passwords. Never manually hash passwords before passing to `User.create()` or `user.save()`.

**Wrong:**
```typescript
const hashedPassword = await bcrypt.hash(password, 12);
const user = await User.create({ password: hashedPassword });  // Will be double-hashed!
```

**Correct:**
```typescript
const user = await User.create({ password: 'PlainTextPassword' });  // Model will hash it
```

To fix existing admin:
```bash
npm run fix-admin
```

---

### Issue 7: MongoDB Connection Failed

**Error:**
```
MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:**

Check MongoDB is running:

**Option 1: MongoDB Compass (Windows)**
- Open MongoDB Compass
- Connect to `mongodb://localhost:27017`
- Check connection status

**Option 2: MongoDB Service**
```bash
# Linux
sudo systemctl start mongod
sudo systemctl status mongod

# macOS
brew services start mongodb-community

# Windows
net start MongoDB
```

**Option 3: MongoDB Atlas (Cloud)**
1. Create free cluster at https://www.mongodb.com/cloud/atlas
2. Get connection string
3. Update `.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-tutor
```

---

## Environment Variables

Required variables in `.env`:

```env
# Server
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb://localhost:27017/ai-tutor

# JWT Secrets (MUST be changed in production!)
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
BCRYPT_ROUNDS=12

# Cookies
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false  # true in production with HTTPS
COOKIE_SAME_SITE=lax
```

---

## Production Deployment

### Security Checklist

- [ ] Change all JWT secrets to strong random values (min 32 characters)
- [ ] Set `COOKIE_SECURE=true` (requires HTTPS)
- [ ] Set `NODE_ENV=production`
- [ ] Use MongoDB Atlas or secured MongoDB instance
- [ ] Enable MongoDB authentication
- [ ] Configure proper CORS origins
- [ ] Use strong admin passwords (not `Admin@123`)
- [ ] Enable rate limiting
- [ ] Set up logging and monitoring
- [ ] Configure firewall rules
- [ ] Use environment-specific secrets (don't commit `.env`)

### Generating Strong Secrets

```bash
# Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use output for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

---

## Summary

1. **Create admin user**: `npm run create-admin`
2. **Start server**: `npm run dev`
3. **Test login**: `npm run test-login`
4. **Login returns**: User data + Access token
5. **Use token**: Include in `Authorization: Bearer <token>` header
6. **Admin endpoints**: Require `admin` role
7. **CSRF protection**: Get token from `/api/admin/blog/csrf-token`
8. **Include CSRF**: In `X-CSRF-Token` header for mutations

---

## Quick Reference

### Scripts
```bash
npm run dev          # Start development server
npm run create-admin # Create admin user
npm run fix-admin    # Fix/recreate admin user
npm run test-login   # Test admin login
npm run debug-admin  # Debug admin user in DB
```

### Default Credentials
```
Email: admin@example.com
Password: Admin@123
Role: admin
```

### Important Ports
```
Server: http://localhost:5000 (or check .env)
MongoDB: mongodb://localhost:27017
```

### Key Files
```
src/controllers/authController.ts   # Login logic
src/models/User.ts                  # User schema with password hashing
src/middlewares/authMiddleware.ts   # Admin authorization
src/routes/adminBlogRoutes.ts       # Admin endpoints
scripts/createAdmin.ts              # Admin creation script
```

---

For more detailed API documentation, see [BACKEND_INTEGRATION_GUIDE.md](./BACKEND_INTEGRATION_GUIDE.md).
