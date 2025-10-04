# AI Tutor Backend — API Integration Guide (Auth)

This document lists authentication-related endpoints, token and cookie behavior, request/response shapes, and code examples for the frontend team to integrate the backend API.

Base URL

- Development: http://localhost:5000/api
- Production: (set by environment) e.g. https://api.yourdomain.com/api

Auth routes (all under `/api/auth`)

1. POST /auth/signup

- Description: Register a new user.
- URL: POST /api/auth/signup
- Body (JSON):
  - email: string (required)
  - password: string (required)
  - name: string (required)
  - role: string (optional, possible values: 'student','tutor','admin')
- Response: 201 Created
  - data.user: { id, email, name, role }
  - data.accessToken: (JWT string)
- Side effects: Server sets HTTP-only cookies:
  - accessToken (httpOnly)
  - refreshToken (httpOnly)

2. POST /auth/login

- Description: Login with email/password.
- URL: POST /api/auth/login
- Body:
  - email, password
- Response: 200 OK
  - data.user: { id, email, name, role, profileImage }
  - data.accessToken: JWT string
- Cookies set: accessToken, refreshToken (httpOnly)

3. POST /auth/refresh

- Description: Rotate refresh token and return new access token.
- URL: POST /api/auth/refresh
- Auth: Reads refresh token from cookie `refreshToken`.
- Response: 200 OK
  - data.accessToken: new JWT
- Cookies set: updated refreshToken & accessToken

4. POST /auth/logout

- Description: Revoke current refresh token and clear cookies.
- URL: POST /api/auth/logout
- Auth: requires authentication (cookie or Authorization header)
- Response: 200 OK
- Side effects: clears `accessToken` and `refreshToken` cookies

5. POST /auth/logout-all

- Description: Revoke all refresh tokens for the user (logout everywhere)
- URL: POST /api/auth/logout-all
- Auth: requires authentication
- Response: 200 OK
- Side effects: clears cookies

6. GET /auth/profile

- Description: Get current user's profile
- URL: GET /api/auth/profile
- Auth: requires authentication (cookie or Authorization header)
- Response: 200 OK
  - data.user: user object

7. PUT /auth/profile

- Description: Update current user's profile
- Body: name, profileImage (optional)
- Auth: requires authentication
- Response: 200 OK

8. PUT /auth/change-password

- Description: Change logged in user's password
- Body: { currentPassword, newPassword }
- Auth: requires authentication
- Response: 200 OK
- Side effects: controller may revoke tokens and require re-login

9. GET /auth/verify

- Description: Verify authentication and return user info
- Auth: requires authentication
- Response: 200 OK

Token & Cookie behavior

- The server issues two tokens:
  - accessToken: short-lived JWT for API calls (stored as HTTP-only cookie `accessToken` and returned in response body for convenience)
  - refreshToken: long-lived random token stored server-side and as HTTP-only cookie `refreshToken`
- For browser clients: rely on cookies (httpOnly, secure based on env) and let browser send them automatically.
- For SPA or Mobile apps: use the accessToken returned in response body and send it in the `Authorization: Bearer <token>` header for requests.
- When using cookies in Postman or other tools, ensure the cookie domain matches the request host (localhost vs 127.0.0.1).

CORS and cookies

- Backend has CORS configured to allow the frontend origin configured in `config.cors.origin`.
- For requests from the browser to include cookies, the client must send credentials: fetch/axios must set `credentials: 'include'`.

Axios examples (frontend)

- Login and subsequent authenticated request (browser app using axios):

```js
// axios default setup
import axios from "axios";

const api = axios.create({
  baseURL: process.env.API_URL || "http://localhost:5000/api",
  withCredentials: true, // IMPORTANT to send cookies
});

// Login
const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  // server will set httpOnly cookies; also returns accessToken in the body
  return res.data;
};

// Example protected request using cookies
const getProfile = async () => {
  const res = await api.get("/auth/profile");
  return res.data;
};

// Alternatively, use the returned accessToken in Authorization header
const apiWithAuthHeader = (token) =>
  axios.create({
    baseURL: process.env.API_URL || "http://localhost:5000/api",
    headers: { Authorization: `Bearer ${token}` },
  });
```

Postman notes

- After login, Postman will store cookies in its Cookie Jar. Use the Cookies UI to confirm `accessToken` and `refreshToken` for the domain.
- If cookies are not sent by Postman automatically, you can copy the returned accessToken into the Authorization header: `Bearer {{accessToken}}`.

Frontend integration checklist

- [ ] Ensure frontend requests use `withCredentials: true` when relying on cookies.
- [ ] Use returned `accessToken` in the response body as a fallback or for mobile clients.
- [ ] Store `accessToken` in memory (do not persist in localStorage unless required — security risk).
- [ ] On 401 responses, call `/api/auth/refresh` to rotate refresh token and obtain a new access token.
- [ ] On refresh failure, redirect user to login.

Error handling

- 401 Unauthorized indicates missing/invalid/expired access token. Attempt refresh if possible.
- 403 Forbidden indicates insufficient permissions (role check).
- 422 or 400 validation errors include structured errors in response.

OAuth (Google)

- GET /auth/google — initiates Google OAuth flow. This is a redirect; test in a browser not Postman.
- GET /auth/google/callback — OAuth callback; the server will set cookies and redirect to frontend success URL with token.

Extras I can provide

- A ready-to-import Postman collection JSON with all described requests.
- A short `auth.ts` frontend helper file with axios wrappers that your frontend team can copy.
- Add this doc to your project README or generate API docs (Swagger/OpenAPI) if desired.

---

If you want the Postman collection, say "Generate Postman collection" and I'll add the JSON file into `docs/postman_collection.json`. If you want the `auth.ts` helper I can create `frontend/auth.example.ts` with axios helper functions and comments.
