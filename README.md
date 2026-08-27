# IntivraBot

AI-powered recruitment platform — resume screening (ATS), AI interviews, face &
voice verification, emotion analysis, and reporting. Final Year Project.

## Monorepo structure

```
Intivrabot/
├── frontend/      # React + Tailwind (Vercel)          ← built
├── backend/       # Node.js + Express + MongoDB (Railway)
└── ai-services/   # Python FastAPI: DeepFace, voice, ATS (Railway)
```

## Tech stack (free-tier friendly)

| Layer      | Tech |
|------------|------|
| Frontend   | React (Vite), Tailwind CSS, React Router, Recharts, lucide-react |
| Backend    | Node.js, Express, MongoDB (Atlas), JWT, Socket.io |
| AI Service | Python, FastAPI, DeepFace, Resemblyzer, spaCy, Gemini API |
| Hosting    | Vercel (frontend), Railway (backend + AI), MongoDB Atlas, Cloudinary |

## Frontend — run locally

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Demo flow
- Landing → **Get started** → pick Candidate or HR → onboarding wizard → dashboard.
- Or **Sign in** and toggle role (Candidate / HR Manager) to jump straight in.

> Auth, jobs & applications ab **real backend API** pe wired hain (`VITE_API_URL`).
> Dashboards, analytics, reports & interview abhi mock pe hain (Phases 4–7).
> Backend chahiye: `cd backend && npm run dev` (+ Atlas IP whitelist).

## Design
- Accent: **Sunset Orange** `#ea580c`. Background: **pure white**.
- White text only on orange surfaces (buttons, header band, active items).
