# CampusResolve

A lightweight student conflict and query tracker built with React, Vite, Supabase, and Lucide. Students can submit campus queries, track progress, search and filter their records, edit details, and delete submissions.

## Features

- Dashboard totals for all, open, in-progress, and resolved queries.
- Email/password sign-up and sign-in through Supabase Auth.
- Query form with student name, roll number, title, category, priority, and description.
- Search and status/category/priority filters.
- Inline status changes, editing, deletion, loading feedback, empty states, and notifications.
- Optional sample records inserted only when the database table is globally empty, assigned to the first signed-in account.
- Supabase Row Level Security scopes every row to its authenticated owner.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 8) and npm.
- A Supabase project.

## Local setup

1. Install packages:

   ```sh
   npm install
   ```

2. In the [Supabase dashboard](https://supabase.com/dashboard), create a project. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. It creates the table, index, grants, and ownership-based RLS policies.

3. From **Project Settings → API**, copy the project URL and the **publishable key** (or legacy `anon` key). Copy `.env.example` to `.env` in the project root, then replace its placeholders:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
   ```

   The `VITE_` values are included in browser code. Use only the publishable/anon key here; **never put a service-role key in this app, a `.env` used by Vite, or Vercel client-side environment variables**. RLS is the security boundary.

4. In Supabase **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` for local work. Add `http://localhost:5173/**` to the redirect URL allow list. If email confirmation is enabled, sign-up displays a confirmation message; confirm the email before signing in.

5. Start the development server:

   ```sh
   npm run dev
   ```

   Without both environment values the app shows setup guidance and does not pretend that queries are being stored.

## Architecture

- `src/App.jsx` contains the auth flow, dashboard, filters, and CRUD actions.
- `src/App.css` and `src/index.css` provide the responsive plain-CSS UI.
- `supabase/schema.sql` defines the `student_queries` table and secure policies.
- Supabase Auth supplies the user identity. Each row has a `user_id`; RLS allows authenticated users to access only rows where `user_id = auth.uid()`. If the signed-in user has no visible queries, the app calls a restricted SQL function that inserts demo rows only if the entire table is empty. A transaction advisory lock prevents concurrent first visits from creating duplicate sample sets.
- Supabase operation errors are shown in the interface. Query lists and dashboard counts come from successful database reads, not local mock fallbacks.

This starter treats each signed-in account as the owner of its own queries. It is not a shared staff inbox or a role-based campus administration system; those require explicit staff roles and carefully scoped policies.

## Build and test

```sh
npm run lint
npm run build
npm run preview
```

`npm run build` generates the production site in `dist/`. For a manual smoke test, configure Supabase, sign up and confirm a test account, create a query, change its status, edit it, delete it, and verify filters and the empty state.

## Deploy to Vercel

1. Push this project to a Git provider and import the repository in [Vercel](https://vercel.com/new).
2. Keep the detected Vite settings: build command `npm run build`, output directory `dist`, install command `npm install`.
3. In the Vercel project’s **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable key (or legacy anon key)
   
   Add them for Production and Preview (and Development if desired). Do not add a service-role key.
4. In Supabase **Authentication → URL Configuration**, change the Site URL to your deployed Vercel domain (for example `https://campus-resolve.vercel.app`) and add that domain to Redirect URLs. Keep the localhost redirect URL for local development.
5. Deploy or redeploy in Vercel after setting environment variables. Vite reads these at build time, so a redeploy is needed when they change.
6. Open the deployment, create/confirm an account, and test query creation and status updates.

The application is a static Vite frontend; Supabase provides the database and authentication. No service key or custom backend server is needed.
