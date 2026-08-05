# 🎓 Edutrack

A multi-tenant cloud school management system built with **Next.js (App Router)**, **pure JavaScript**, **Tailwind CSS**, **Lucide React**, **MongoDB / Mongoose**, and **JWT** authentication.

Every school gets a fully isolated tenant: students, teachers, scores and payroll can never cross school boundaries.

## ✨ Features

- **Automated Report Cards** — A4-printable PDF report cards (jsPDF + html2canvas) with school branding and signature blocks.
- **Multi-Class Arms Engine** — model any stream (SS1 Science, SS1 Arts, JSS…), each with its own grading matrix.
- **Teacher Payroll Tracking** — one-click Paid / Pending toggles from the admin portal.
- **Instant Grading Matrix** — enter CA (out of 40) and Exam (out of 60); totals and letter grades compute live.
- **Role-Based Portals** — dedicated dashboards for Super Admin, Teacher and Student.
- **Multi-Tenant Isolation** — every query is scoped by `schoolId` and verified server-side.

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo mode (no database needed)

If `MONGODB_URI` is **not** set, the app runs in demo mode with seeded in-memory data:

| Portal       | Email                  | Password    |
| ------------ | ---------------------- | ----------- |
| Super Admin  | `admin@edutrack.app`   | `admin123`  |
| Teacher      | `a.okafor@edutrack.app`| `teacher123`|
| Student      | `k.adebayo@edutrack.app`| `student123`|

### Connect MongoDB

```bash
cp .env.example .env.local
# edit .env.local
```

```env
MONGODB_URI=mongodb://127.0.0.1:27017/edutrack
JWT_SECRET=a-long-random-string
```

## 🧱 Architecture

```
src/
  app/                 # Pages (App Router) + API routes
    api/
      auth/            # register, login, logout, me
      school/          # tenant settings & onboarding
      users/           # student/teacher management, payroll & fee toggles
      scores/          # batch grading + student report data
      admin/stats/     # dashboard metrics
    admin/dashboard/   # Super Admin portal
    teacher/dashboard/ # Grading matrix
    student/dashboard/ # Report card + PDF export
  components/          # Logo, Sidebar, MetricCard, Modal, ReportCard
  lib/                 # db, auth (JWT), grading, store (Mongo ⇄ demo)
  models/              # School, User, Score (Mongoose)
```

## 🔐 Security

- HTTP-only JWT cookies with tenant scoping on every query.
- Cross-tenant writes are rejected server-side (verified against the caller's `schoolId`).
- Passwords hashed with bcrypt; hashes never returned by the API.
- `role` is not updatable via the API (prevents privilege escalation).
