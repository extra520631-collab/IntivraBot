# IntivraBot — Backend (Node.js + Express)

Main API server. Handles auth (JWT), and — in later phases — jobs, applications,
interviews, and reports. Talks to MongoDB, the Python AI service, and Gemini.

## Status
- ✅ **Phase 0** — server skeleton, config, security, error handling, health check
- ✅ **Phase 1** — auth: register / login / me / forgot-password / reset-password (JWT + bcrypt)
- ✅ **Phase 2** — jobs (HR CRUD + browse/search/paginate) & applications (apply, my apps, HR review, status)
- ✅ **Phase 3** — ATS: apply flow calls the AI service to score resumes (atsScore + threshold gate)
- ✅ **Phase 4** — AI interviews: start / answer / finish / get (Gemini via AI service, updates application)
- ⬜ Phase 5+ — face & voice verification, reports (see root plan)

## Structure
```
backend/
├── src/
│   ├── config/        env.js (validation), db.js (mongoose)
│   ├── models/        User.js
│   ├── middleware/    auth.js, validate.js (zod), error.js
│   ├── validators/    auth.schema.js
│   ├── controllers/   auth.controller.js
│   ├── routes/        index.js, auth.routes.js
│   ├── utils/         token.js, AppError.js, asyncHandler.js
│   ├── app.js         express app (cors, helmet, rate-limit, routes)
│   └── server.js      entry (db connect + listen + graceful shutdown)
├── .env.example
└── package.json
```

## Setup
```bash
cd backend
npm install
cp .env.example .env        # then fill in MONGODB_URI + JWT_SECRET
npm run dev                  # http://localhost:5000
```
Get a free MongoDB URI from **MongoDB Atlas** (M0 cluster). Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Auth API
| Method | Route | Body | Auth |
|--------|-------|------|------|
| POST | `/api/auth/register` | name, email, password, role(`candidate`/`hr`), company? | — |
| POST | `/api/auth/login` | email, password | — |
| POST | `/api/auth/forgot-password` | email | — |
| POST | `/api/auth/reset-password` | token, password | — |
| GET  | `/api/auth/me` | — | Bearer |

Success responses return `{ success, token, user }`. Send the token as
`Authorization: Bearer <token>` on protected routes.

## Jobs API  (all require Bearer token)
| Method | Route | Role | Notes |
|--------|-------|------|-------|
| GET | `/api/jobs` | any | browse/search — `?q=&type=&status=open&page=&limit=` |
| GET | `/api/jobs/mine` | HR | HR's own postings + applicant counts |
| GET | `/api/jobs/:id` | any | single job (+ applicantsCount, hasApplied) |
| POST | `/api/jobs` | HR | create (company defaults to HR's) |
| PUT | `/api/jobs/:id` | HR (owner) | update |
| DELETE | `/api/jobs/:id` | HR (owner) | delete + cascade applications |

## Applications API  (all require Bearer token)
| Method | Route | Role | Notes |
|--------|-------|------|-------|
| POST | `/api/applications` | candidate | apply `{ jobId, resumeUrl?, coverNote? }` — one per job |
| GET | `/api/applications/mine` | candidate | own applications (+ job info) |
| GET | `/api/applications/job/:jobId` | HR (owner) | applicants for a job — `?status=` |
| PATCH | `/api/applications/:id/status` | HR (owner) | `{ status }` (applied→…→passed/rejected) |

## Interviews API  (all require Bearer token)
| Method | Route | Role | Notes |
|--------|-------|------|-------|
| POST | `/api/interviews/start` | candidate | `{ applicationId, language? }` → first question |
| POST | `/api/interviews/:id/answer` | candidate | `{ answer, mode?, reason? }` → score + next question |
| POST | `/api/interviews/:id/finish` | candidate | finalize → overall score + verdict, updates application |
| GET | `/api/interviews/:id` | candidate owner / HR owner | full transcript |

## Env (see .env.example)
`PORT`, `NODE_ENV`, `CLIENT_URLS`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`AI_SERVICE_URL`, `GEMINI_API_KEY`, `CLOUDINARY_URL`
