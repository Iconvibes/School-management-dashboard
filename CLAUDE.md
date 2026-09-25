# Project Guidelines: Edutrack SaaS

## Tech Stack Rules
- **Framework:** Next.js (App Router). JavaScript with a **gradual TypeScript migration** in `src/lib/` — the security-critical modules (`token.ts`, `auth.ts`, `tenant-scope.ts`, `policy.ts`, `permissions.ts`) plus `grading.ts`/`ranking.ts` are `.ts`. New `src/lib/` modules should be written as `.ts`; route/component code stays `.js`/`.jsx`. Import migrated modules extensionlessly (`@/lib/policy`) — explicit `.js` imports of renamed files break. Tests need `--import ./tests/register-aliases.js`.
- **Styling:** Tailwind CSS with Lucide React for icons.
- **Database:** MongoDB via Mongoose.
- **Authentication:** JWT stored in HTTP-only cookies (not localStorage — the cookie is the only session store).

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
