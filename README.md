# if3250_k02_g01_dgw1

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Self, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Create a Google OAuth client in Google Cloud Console.
3. Add the following to `apps/web/.env`:

```bash
ADMIN_EMAILS=admin@example.com
APIFY_API_TOKEN=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3003
CORS_ORIGIN=http://localhost:3003
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/digiwonder
```

4. Set `ADMIN_EMAILS` to one or more comma-separated bootstrap admin emails.
5. `APIFY_API_TOKEN` saja cukup untuk sinkronisasi Instagram dan TikTok karena actor sudah di-hardcode ke `apify/instagram-scraper` dan `clockworks/tiktok-scraper`.
6. Shopee baru disiapkan di enum/domain model, belum dihubungkan ke actor Apify.
7. Add `http://localhost:3003/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console.

8. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3003](http://localhost:3003) in your browser to see the fullstack application.

## Deploy ke Vercel

Project ini sudah disiapkan untuk deploy dari root repository di Vercel.

Setting project yang dipakai di Vercel:

- Root Directory: repository root (`.`)
- Framework Preset: `Other`
- Install Command: biarkan mengikuti [vercel.json](vercel.json)
- Build Command: biarkan mengikuti [vercel.json](vercel.json)
- Output Directory: jangan isi manual `client`, biarkan mengikuti [vercel.json](vercel.json)

Yang perlu diisi di Project Environment Variables:

```bash
ADMIN_EMAILS=
APIFY_API_TOKEN=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
CORS_ORIGIN=
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Catatan:

- `BETTER_AUTH_URL` isi dengan URL production Vercel, misalnya `https://nama-project.vercel.app`
- `CORS_ORIGIN` isi dengan origin yang sama dengan domain production
- Redirect URI Google OAuth production harus ditambahkan ke `https://<domain-vercel>/api/auth/callback/google`
- Konfigurasi Vercel sudah ada di [vercel.json](vercel.json), termasuk routing semua request SSR/API ke server TanStack Start
- Variabel environment build juga sudah didaftarkan di [turbo.json](turbo.json)

## Project Structure

```
if3250_k02_g01_dgw1/
├── apps/
│   └── web/         # Fullstack application (React + TanStack Start)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
