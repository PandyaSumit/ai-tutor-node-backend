# Setup Guide - AI Tutor Backend

This guide will help you set up and run the AI Tutor backend server.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **MongoDB** (v6 or higher)
3. **npm** or **yarn**

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

The `.env` file has already been created with development defaults. Update the following if needed:

- `MONGODB_URI` - Your MongoDB connection string (default: `mongodb://localhost:27017/ai-tutor`)
- `JWT_ACCESS_SECRET` - Secret key for access tokens (change in production!)
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens (change in production!)
- `PORT` - Server port (default: 8000)

### 3. Start MongoDB

**Option A: Local MongoDB**

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Windows
net start MongoDB

# Or run manually
mongod --dbpath /path/to/your/data/directory
```

**Option B: Docker**

```bash
docker run -d -p 27017:27017 --name mongodb mongo:6
```

**Option C: MongoDB Atlas (Cloud)**

1. Create a free account at https://www.mongodb.com/cloud/atlas
2. Create a cluster
3. Get the connection string
4. Update `MONGODB_URI` in `.env` file

### 4. Verify MongoDB is Running

```bash
# Check if MongoDB is accessible
mongosh --eval "db.version()"

# Or check with telnet
telnet localhost 27017
```

If you get connection refused, MongoDB is not running. Start it using one of the methods above.

### 5. Create Admin User

```bash
npm run create-admin
```

This will create an admin user with:
- Email: `admin@example.com`
- Password: `Admin@123`
- Role: `admin`

### 6. Start the Development Server

```bash
npm run dev
```

The server will start on `http://localhost:8000`

### 7. Test Admin Login (Optional)

```bash
npm run test-login
```

This will test the admin login and verify everything is working correctly.

## Troubleshooting

### Issue: "ECONNREFUSED 127.0.0.1:27017"

**Cause:** MongoDB is not running or not accessible.

**Solution:**
1. Start MongoDB using one of the methods in Step 3
2. Verify it's running with `mongosh` or check the service status
3. Make sure `MONGODB_URI` in `.env` matches your MongoDB setup

### Issue: "MissingSchemaError: Schema hasn't been registered"

**Cause:** Model import issue.

**Solution:** This has been fixed. Make sure you're using the latest version of the scripts.

### Issue: "Invalid email or password" (401)

**Possible causes:**
1. MongoDB is not running
2. Admin user was not created successfully
3. Wrong credentials

**Solution:**
1. Make sure MongoDB is running
2. Run `npm run debug-admin` to check if admin user exists
3. Re-create admin user with `npm run create-admin`

### Issue: Port already in use

**Cause:** Another process is using port 8000.

**Solution:**
```bash
# Find and kill the process
# macOS/Linux
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Or change the `PORT` in `.env` file.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run start` - Start production server
- `npm run build` - Build TypeScript to JavaScript
- `npm run lint` - Run ESLint
- `npm run create-admin` - Create admin user
- `npm run test-login` - Test admin login
- `npm run debug-admin` - Debug admin user in database

## MongoDB Collections

The application uses the following collections:

- `users` - User accounts (students, tutors, admins)
- `refreshtokens` - JWT refresh tokens
- `blogs` - Blog posts (if blog feature is enabled)
- `sessions` - Tutor sessions
- `messages` - Chat messages

## Next Steps

1. ✅ MongoDB running
2. ✅ Admin user created
3. ✅ Server running
4. Test the API endpoints (see `docs/BACKEND_INTEGRATION_GUIDE.md`)
5. Connect your frontend application
6. Configure email settings (optional)
7. Set up Google OAuth (optional)

## Production Deployment

Before deploying to production:

1. **Change all secrets** in `.env`:
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`

2. **Use a production MongoDB**:
   - MongoDB Atlas (recommended)
   - Self-hosted MongoDB with authentication

3. **Enable security features**:
   - Set `COOKIE_SECURE=true`
   - Set `NODE_ENV=production`
   - Configure proper `CORS_ORIGIN`

4. **Set up email**:
   - Configure `EMAIL_*` variables for password reset and verification

5. **Environment variables**:
   - Never commit `.env` to version control
   - Use environment variables on your hosting platform

## Documentation

- [Backend Integration Guide](docs/BACKEND_INTEGRATION_GUIDE.md) - Complete API documentation
- [API Endpoints](docs/BACKEND_INTEGRATION_GUIDE.md#api-endpoints) - All available endpoints
- [Authentication Flow](docs/BACKEND_INTEGRATION_GUIDE.md#authentication-system) - How auth works

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the backend integration guide
3. Check server logs for detailed error messages
4. Verify environment configuration

## License

[Your License Here]
