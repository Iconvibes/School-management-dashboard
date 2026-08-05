# Project Guidelines: Edutrack SaaS

## Tech Stack Rules
- **Framework:** Next.js (App Router) using standard JavaScript (.js / .jsx).
- **STRICT RULE:** NO TypeScript. Do NOT create .ts or .tsx files. Use pure React/JavaScript.
- **Styling:** Tailwind CSS with Lucide React for icons.
- **Database:** MongoDB via Mongoose.
- **Authentication:** JWT stored in HTTP-only cookies or localStorage.

## Design Tokens (Tailwind)
- Primary Navy: `#1E293B` (e.g., bg-slate-800)
- Accent Blue: `#2563EB` (e.g., bg-blue-600)
- Background Slate: `#F8FAFC` (e.g., bg-slate-50)
- Surface White: `#FFFFFF`

## Architecture & File Structure
- Page Routes: `src/app/` (Next.js App Router using `page.js` files)
- UI Components: `src/components/`
- Mongoose Models: `src/models/`
- Database Utility: `src/lib/db.js`
- API Routes: `src/app/api/`
