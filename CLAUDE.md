@AGENTS.md

# Vambe Client Onboarding Portal — Project State

**Last updated:** 2026-04-04
**Stack:** Next.js 16.2.2 · React 19 · TypeScript · Tailwind CSS v4 · Supabase
**Supabase project:** `bzfspkxbvqjbvmumrozx` (name: "Files", org: Vambe Pro)
**Supabase URL:** https://bzfspkxbvqjbvmumrozx.supabase.co
**Deployed on:** Vercel (connected to `main` branch, auto-deploys on push)

---

## What This App Is

A private onboarding portal for Vambe's AI clients. Clients log in and submit text
and files across 11 structured sections (organized into 4 parts). Admins can view all
clients, upload on their behalf, and validate submissions. The collected information is
used to configure and train each client's AI assistant.

---

## Two User Roles

| Role | Email | Access |
|------|-------|--------|
| `admin` | tomashanna17@gmail.com | Full access — all clients, all submissions |
| `admin` | tomas.hanna@vambe.ai | Full access — all clients, all submissions |
| `client` | any other signup | Own onboarding only |

New signups are `client` by default. The two admin emails are hardcoded in the
`handle_new_user` trigger and are auto-promoted on signup.

---

## Database (Supabase project bzfspkxbvqjbvmumrozx)

### Tables

| Table | Rows | RLS | Policies |
|-------|------|-----|----------|
| `profiles` | 3 | ✅ | 3 (SELECT own, UPDATE own, admin UPDATE all) |
| `onboarding_parts` | 4 | ✅ | 1 (SELECT for authenticated) |
| `onboarding_sections` | 11 | ✅ | 1 (SELECT for authenticated) |
| `submissions` | 1 | ✅ | 4 (SELECT/INSERT/UPDATE own, admin DELETE) |
| `submission_files` | 0 | ✅ | 3 (SELECT/INSERT/DELETE own or admin) |

### Key DB objects

- **`public.is_admin()`** — `SECURITY DEFINER` helper function; returns true if
  `auth.uid()` has `role = 'admin'` in profiles. Used in all RLS policies.
- **`handle_new_user()` trigger** — fires `AFTER INSERT ON auth.users`; creates a
  profile row, sets `role = 'admin'` for the two hardcoded emails, `'client'` for all
  others.

### Grants (critical — tables were created via raw SQL, not Supabase UI)

These grants are required and have been applied. If tables are ever recreated, re-apply:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.onboarding_parts    TO anon, authenticated;
GRANT SELECT ON public.onboarding_sections TO anon, authenticated;
GRANT SELECT ON public.profiles            TO anon;
GRANT SELECT, UPDATE ON public.profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.submission_files TO authenticated;
```

**Root cause of every 403 ever encountered:** missing `GRANT USAGE ON SCHEMA public`.
Without it, `anon`/`authenticated` roles can't find any table regardless of policies.

### Storage

- **Bucket:** `submissions` (private, `public = false`)
- **Upload path pattern:** `{client_id}/{section_id}/{timestamp-filename}`
- **Storage RLS:** clients can read/write their own folder; admins can read/write any path
- **Download:** signed URLs (60 s expiry) via `createSignedUrl()`

### Onboarding content seeded

**Part 1 — Bases y Configuración Técnica:** Estado de Integración · Información
Institucional y Ubicaciones · Métodos y Procesos de Pago · Logística y Entrega

**Part 2 — Flujo de Venta y Estrategia:** Guía de Productos / Catálogo · Recuperación
de Carritos Abandonados · Preguntas Frecuentes (FAQ)

**Part 3 — Postventa y Derivaciones:** Políticas de Cambios y Devoluciones · Seguimiento
y Soporte · Derivaciones a Humanos

**Part 4 — Conversaciones Reales:** Conversaciones Reales

---

## File Structure

```
app/
  layout.tsx                        Root layout — wraps app in <AuthProvider>
  page.tsx                          Root page — redirects to /dashboard
  login/page.tsx                    Login form (Spanish, Vambe branding)
  signup/page.tsx                   Signup form (Spanish, shows success message)
  contexts/
    AuthContext.tsx                 Auth state — user, session, profile (with role),
                                    loading. Uses getSession() as primary init so the
                                    Supabase HTTP client has the JWT before any query runs.
                                    Includes 8 s safety timeout and mounted ref guard.
  dashboard/
    layout.tsx                      Protected shell — sidebar + header. Role-aware nav:
                                    admins see "Clientes", clients see "Mi Onboarding".
                                    Redirects to /login if not authenticated.
    page.tsx                        Redirect router — sends admins to /dashboard/admin,
                                    clients to /dashboard/onboarding.
    onboarding/
      page.tsx                      Client onboarding page — renders <OnboardingView>
                                    with the logged-in user's own clientId.
    admin/
      page.tsx                      Admin clients list — table of all client profiles
                                    with progress bars, last activity, link to detail.
      [clientId]/
        page.tsx                    Admin client detail — breadcrumb + <OnboardingView>
                                    for the selected client with isAdmin=true.
  components/
    OnboardingView.tsx              Core shared component. Fetches parts, sections, and
                                    submissions for a given clientId. Renders collapsible
                                    parts with progress bar, "why we ask" boxes, and a
                                    <SectionCard> per section. Works for both client and
                                    admin views. Uses two separate queries (not embedded
                                    select) to avoid PostgREST schema-cache issues.
    SectionCard.tsx                 Per-section card. Handles text save (upsert),
                                    file upload (storage + DB record), file download
                                    (signed URL), admin validation toggle, and client
                                    approval checkbox for admin-uploaded files. All
                                    mutations are client-side via the anon Supabase
                                    client — RLS enforces access control.
    FileUploadZone.tsx              Drag-and-drop / click-to-upload zone. Accepts any
                                    file type.
lib/
  supabase.ts                       Module-level Supabase client singleton (anon key).
  types.ts                          TypeScript interfaces for all DB tables: Profile,
                                    OnboardingPart, OnboardingSection, Submission,
                                    SubmissionFile, PartWithSections, SubmissionWithFiles,
                                    ClientWithProgress.
proxy.ts                            Next.js 16 middleware (renamed from middleware.ts).
                                    Currently passes all requests through — auth is
                                    handled client-side via AuthContext.
```

---

## Environment Variables

```
# .env.local (gitignored — must be set manually in Vercel dashboard too)
NEXT_PUBLIC_SUPABASE_URL=https://bzfspkxbvqjbvmumrozx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

`NEXT_PUBLIC_*` vars are baked into the client bundle at **build time**. If they are
missing in Vercel's environment variables, every Supabase request fails silently and the
app shows a permanent loading spinner. Always set them in Vercel → Project Settings →
Environment Variables before deploying.

---

## Auth Flow

```
/login → supabase.auth.signInWithPassword()
       → onAuthStateChange fires (SIGNED_IN)
       → AuthContext: getSession() → fetchProfile() → setLoading(false)
       → /dashboard → checks profile.role
       → admin  → /dashboard/admin
       → client → /dashboard/onboarding
```

**Critical implementation note:** `getSession()` must be called before any
`supabase.from()` query. `onAuthStateChange` alone does NOT reliably update the HTTP
client's Authorization header before the first query fires. See `AuthContext.tsx`.

---

## What Is Working

- ✅ Email/password login and signup (Spanish UI)
- ✅ Role-based routing (admin → /dashboard/admin, client → /dashboard/onboarding)
- ✅ Auto-admin assignment for the two owner emails via DB trigger
- ✅ Admin clients list with progress bars and last-activity dates
- ✅ Admin client detail view (full onboarding layout for any client)
- ✅ Client onboarding view — 4 collapsible parts, 11 sections
- ✅ Progress bar (X/11 sections completed)
- ✅ Text submission per section (upsert on save)
- ✅ File upload per section (any type, drag-drop or click)
- ✅ File list with name, size, date, and download button
- ✅ Admin can upload files on behalf of clients (labeled "Subido por el administrador")
- ✅ Admin can validate sections (toggle green checkmark)
- ✅ Client can approve admin uploads ("Validar información" checkbox)
- ✅ Section status badges: Pendiente / Enviado / Validado
- ✅ "Why we ask" explanation boxes per part
- ✅ Disclaimer footer (confidentiality notice)
- ✅ Supabase Storage (private bucket, signed URL downloads)
- ✅ RLS on all 5 tables + storage policies
- ✅ Schema + table grants correctly applied

---

## Known Issues / Limitations

- ⚠️ **No password reset flow** — there is no "Forgot password" link or page.
- ⚠️ **No email confirmation handling** — Supabase sends a confirmation email on
  signup but the app doesn't check `email_confirmed_at` before allowing login. If
  Supabase's email confirmation is enabled on the project, unconfirmed users will get
  an auth error with no helpful message shown.
- ⚠️ **Client profile has no company name field** — `profiles.full_name` is set to
  the user's email by the trigger. Clients have no way to update their display name.
- ⚠️ **No file deletion UI** — files can be uploaded but not removed by users.
- ⚠️ **No admin invite flow** — admins cannot invite clients by email. Clients must
  sign up themselves at /signup.
- ⚠️ **`proxy.ts` (middleware) passes everything through** — route protection is
  entirely client-side. A determined user could briefly see the dashboard shell before
  being redirected. Consider moving auth checks into the proxy for hardened security.

---

## What Is Left to Build

### High priority
- [ ] **Password reset** — `/forgot-password` page using `supabase.auth.resetPasswordForEmail()`
- [ ] **Client profile editor** — let clients set a company name / display name
      (add `company_name` column to `profiles`, update the trigger)
- [ ] **File deletion** — delete button on each file (storage + DB record)
- [ ] **Admin invite flow** — admin enters an email, Supabase sends a magic link or
      invite; new user lands directly in their onboarding

### Medium priority
- [ ] **Email notifications** — notify admin when a client saves/submits; notify
      client when admin validates a section (Supabase Edge Functions + Resend/SendGrid)
- [ ] **Section-level completion tracking** — currently "completed" = has any content.
      Could add an explicit `submitted_at` timestamp clients set when they're done with
      a section.
- [ ] **Admin notes per section** — a private text field only admins can see/edit,
      separate from the client's submission text
- [ ] **Bulk progress export** — admin downloads a ZIP or PDF of all submissions for
      a client

### Low priority / polish
- [ ] **Mobile responsiveness audit** — sidebar collapses to a hamburger menu on small screens
- [ ] **Empty state illustrations** — nicer empty states for new clients with 0 submissions
- [ ] **Toast notifications** — replace the inline "✓ Guardado" text with a toast system
- [ ] **Optimistic UI** — file list updates instantly on upload instead of after DB round-trip
- [ ] **Server-side auth in proxy.ts** — move role-based redirects into the proxy using
      `@supabase/ssr` and cookie-based sessions for production-grade security

---

## Common Gotchas

1. **403 on any table** → Check `GRANT USAGE ON SCHEMA public TO anon, authenticated`
   first. This is always the root cause when tables are created via raw SQL.

2. **Stuck "Cargando..." in production** → Almost always means `NEXT_PUBLIC_SUPABASE_URL`
   or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set in Vercel's environment variables.
   These are baked at build time — redeploy after adding them.

3. **Profile shows wrong role** → The `getSession()` call in AuthContext must complete
   before any `supabase.from()` query. If you refactor auth, do not replace `getSession()`
   with `onAuthStateChange`-only — the HTTP client auth headers won't be set in time.

4. **PostgREST 403 after schema changes** → Run `NOTIFY pgrst, 'reload schema';` to
   force a schema cache reload.

5. **Embedded select (`select('*, relation(*)')`) failing in production** → Use two
   separate queries instead. PostgREST's foreign-key resolution can fail on cold cache.
   See `OnboardingView.tsx` for the pattern.
