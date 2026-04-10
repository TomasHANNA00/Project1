@AGENTS.md

# Vambe Client Onboarding Portal — Project State

**Last updated:** 2026-04-10
**Stack:** Next.js 16.2.2 · React 19 · TypeScript · Tailwind CSS v4 · Supabase
**Supabase project:** `bzfspkxbvqjbvmumrozx` (name: "Files", org: Vambe Pro)
**Supabase URL:** https://bzfspkxbvqjbvmumrozx.supabase.co
**Deployed on:** Vercel (connected to `main` branch, auto-deploys on push)

---

## What This App Is

A private client portal for Vambe's AI clients. Clients log in to a "Portal de Status"
— a project management view showing their onboarding project's phases and tasks. Admins
can view all clients, manage projects, run an AI data pipeline, and edit templates.

There is also a legacy onboarding system (sections + files per template) that remains
active for clients who don't yet have a project assigned.

---

## Two User Roles

| Role | Email | Access |
|------|-------|--------|
| `admin` | tomashanna17@gmail.com | Full access — all clients, all submissions, pipeline |
| `admin` | tomas.hanna@vambe.ai | Full access — all clients, all submissions, pipeline |
| `client` | any other signup | Own portal/onboarding only |

New signups are `client` by default. The two admin emails are hardcoded in the
`handle_new_user` trigger and are auto-promoted on signup.

---

## Database (Supabase project bzfspkxbvqjbvmumrozx)

### Core profile table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | FK → auth.users |
| `role` | text | 'admin' \| 'client' |
| `full_name` | text | nullable |
| `company_name` | text | nullable |
| `invited_at` | timestamptz | nullable |
| `template_id` | int | nullable — legacy FK → onboarding_templates |
| `project_id` | uuid | nullable — FK → client_projects (new system) |
| `created_at` | timestamptz | |

### Template layer (project structure definition)

| Table | Notes |
|-------|-------|
| `project_templates` | id uuid, name, industry, description, created_at, updated_at |
| `phase_templates` | id uuid, template_id uuid FK, name, phase_number int, description |
| `task_templates` | id uuid, phase_template_id uuid FK, name, task_type, owner_type, default_due_offset_days int, sort_order int, description |
| `question_templates` | id uuid, task_template_id uuid FK, question_text, placeholder, sort_order int |

Task types: `hito` (0/100 binary milestone), `info_request` (sub-questions + files, auto-progress), `validation` (doc link + comments + validate button)
Owner types: `client`, `vambe`

### Client instance layer (copy-on-create from templates)

| Table | Notes |
|-------|-------|
| `client_projects` | id uuid, client_id uuid FK, template_id uuid FK, name, created_at, started_at |
| `client_phases` | id uuid, project_id uuid FK, phase_template_id uuid FK, name, phase_number int |
| `client_tasks` | id uuid, phase_id uuid FK, task_template_id uuid FK, name, task_type, owner_type, owner_label, due_date date, status, progress numeric, completed_at, completed_by, sort_order int, description |
| `task_questions` | id uuid, task_id uuid FK, question_template_id uuid FK, question_text, placeholder, sort_order int |
| `task_responses` | id uuid, question_id uuid FK, client_id uuid FK, text_content, created_at, updated_at — UNIQUE(question_id, client_id) |
| `task_files` | id uuid, question_id uuid FK, client_id uuid FK, file_name, file_path, file_size bigint, mime_type, created_at |
| `task_validations` | id uuid, task_id uuid FK, doc_url, doc_title, comments, validated boolean, validated_at |

**Progress model:** task-level `progress` stored in `client_tasks`. Phase/total progress computed client-side as averages.

### Legacy onboarding tables (backward compat — clients without project_id)

| Table | RLS | Notes |
|-------|-----|-------|
| `onboarding_parts` | ✅ | SELECT for authenticated. part_number NOT unique. |
| `onboarding_sections` | ✅ | SELECT for authenticated. template_id NULL = global. |
| `onboarding_templates` | ✅ | 6 industry templates: Salud(1), E-commerce(2), Educación(3), Servicios(4), Inmobiliaria(5), Automotora(6) |
| `template_sections` | ✅ | Maps template → sections with custom_description and display_order |
| `client_sections` | ✅ | Per-client section assignments. Empty = show all global sections. |
| `submissions` | ✅ | SELECT/INSERT/UPDATE own, admin DELETE |
| `submission_files` | ✅ | SELECT/INSERT/DELETE own or admin |

### Pipeline tables

| Table | RLS | Notes |
|-------|-----|-------|
| `pipeline_items` | ✅ | Admin-only. depured_text + status per client+section. status: 'depurado' \| 'enviado'. UNIQUE(client_id, section_id). Also has nullable task_id uuid FK. |
| `prompt_templates` | ✅ | Admin-only. Per-section prompt for Pandai export. UNIQUE(section_id). Also has nullable task_id uuid FK. |

### Key DB objects

- **`public.is_admin()`** — `SECURITY DEFINER` helper; returns true if `auth.uid()` has `role = 'admin'` in profiles.
- **`handle_new_user()` trigger** — fires `AFTER INSERT ON auth.users`; creates profile row, sets `role = 'admin'` for the two hardcoded emails.

### RLS summary for new tables

- Template tables (`project_templates`, `phase_templates`, `task_templates`, `question_templates`): SELECT for all authenticated, admin write.
- Client instance tables (`client_projects`, `client_phases`, `client_tasks`, `task_questions`): SELECT for project owner + admin ALL.
- `task_responses`: client INSERT/UPDATE/SELECT own rows + admin ALL.
- `task_files`: client INSERT/SELECT/DELETE own rows + admin ALL.
- `task_validations`: admin ALL, client SELECT.

### Grants (critical — new tables need explicit grants)

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- Legacy tables
GRANT SELECT ON public.onboarding_parts    TO anon, authenticated;
GRANT SELECT ON public.onboarding_sections TO anon, authenticated;
GRANT SELECT ON public.profiles            TO anon;
GRANT SELECT, UPDATE ON public.profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.submission_files TO authenticated;
GRANT ALL ON public.pipeline_items    TO authenticated;
GRANT ALL ON public.prompt_templates  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.prompt_templates_id_seq TO authenticated;
-- New tables
GRANT SELECT ON public.project_templates  TO authenticated;
GRANT SELECT ON public.phase_templates    TO authenticated;
GRANT SELECT ON public.task_templates     TO authenticated;
GRANT SELECT ON public.question_templates TO authenticated;
GRANT ALL ON public.client_projects   TO authenticated;
GRANT ALL ON public.client_phases     TO authenticated;
GRANT ALL ON public.client_tasks      TO authenticated;
GRANT ALL ON public.task_questions    TO authenticated;
GRANT ALL ON public.task_responses    TO authenticated;
GRANT ALL ON public.task_files        TO authenticated;
GRANT ALL ON public.task_validations  TO authenticated;
```

**Root cause of every 403 ever encountered:** missing `GRANT USAGE ON SCHEMA public`.

### Storage

- **Bucket:** `submissions` (private, `public = false`) — **NOT** `private`
- **Legacy upload path:** `{client_id}/{section_id}/{timestamp}_{filename}`
- **New upload path:** `{client_id}/{question_id}/{timestamp}_{filename}`
- **Storage RLS:** clients can read/write their own folder; admins can read/write any path
- **Download:** signed URLs (60 s expiry) via `createSignedUrl()`

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
                                    loading. Uses getSession() as primary init.
                                    Includes 8 s safety timeout and mounted ref guard.
  api/
    invite/route.ts                 POST — admin-only. Invites user by email via
                                    supabase admin.inviteUserByEmail, creates profile,
                                    assigns client_sections from template. Auth via JWT
                                    decode (avoids service-role getUser() reliability issue).
    depure/route.ts                 POST — admin-only. Receives raw_text + metadata.
                                    Calls Anthropic claude-sonnet-4-20250514.
                                    Returns { depured_text }. Requires ANTHROPIC_API_KEY.
  dashboard/
    layout.tsx                      Protected shell. Portal paths (/dashboard/portal/*)
                                    skip sidebar and render full-screen. Admin nav:
                                    Clientes · Pipeline · Plantillas · Mi Perfil (SVG icons).
                                    Client nav: Mi Portal · Mi Perfil. Logo: logo-vambe.png.
    page.tsx                        Router: admin → /dashboard/admin,
                                    client with project_id → /dashboard/portal,
                                    client without → /dashboard/onboarding.
    portal/
      layout.tsx                    Portal-specific layout — Inter font, #F5F7FB bg,
                                    wraps in <PortalProviders>.
      page.tsx                      Portal de Status page. Fetches client's project,
                                    phases, tasks. Renders <PortalHeader>, <PhaseSidebar>,
                                    and <PhaseCard> list.
    onboarding/
      page.tsx                      Legacy client onboarding — renders <OnboardingView>.
    admin/
      page.tsx                      Admin clients list — invite modal (2-step), client
                                    table with template badge and progress.
      clients/
        [clientId]/page.tsx         Admin client detail — <OnboardingView isAdmin=true>
                                    or Portal view with admin controls.
      templates/
        page.tsx                    Phase + task + question editor. Template selector
                                    (tab bar from project_templates). Collapsible phase
                                    cards with task rows. Edit/delete tasks inline.
                                    Question panel for info_request tasks. Warning banner:
                                    "Los cambios solo afectan proyectos nuevos."
      pipeline/
        page.tsx                    Admin pipeline. Client selector. Per-section two-column
                                    layout: raw data (left) vs depured textarea (right).
                                    "Depurar con IA" → /api/depure. Status: Sin datos →
                                    Datos recibidos → Depurado → Enviado.
        prompts/
          page.tsx                  Prompt template editor. Per-section prompts with
                                    variable insertion. Upserts to prompt_templates.
  components/
    OnboardingView.tsx              Legacy core component. Fetches parts/sections/
                                    submissions for clientId. Backward compat: no
                                    client_sections → shows global sections only.
    SectionCard.tsx                 Per-section card. Text save, file upload/download,
                                    admin validation, client approval.
    ClientSectionManager.tsx        Admin bar on legacy client detail. Section chips +
                                    "Cambiar plantilla" modal + "Añadir sección".
    FileUploadZone.tsx              Drag-and-drop / click-to-upload zone.
    portal/
      PortalHeader.tsx              Sticky header — logo + company name badge + total progress
      PhaseSidebar.tsx              180px fixed sidebar — phase timeline
      PhaseCard.tsx                 Collapsible phase card with progress bar
      TaskItem.tsx                  Task row — checkbox, name, date, badge, progress, icon
      InfoRequestPanel.tsx          580px slide-in panel for info_request tasks
      ValidationPanel.tsx           580px slide-in panel for validation tasks
      Toast.tsx                     Toast notification component
      PortalProviders.tsx           Client wrapper for ToastProvider
lib/
  supabase.ts                       Module-level Supabase client singleton (anon key).
  types.ts                          TypeScript interfaces — includes all legacy types plus:
                                    ProjectTemplate, PhaseTemplate, TaskTemplate,
                                    QuestionTemplate, ClientProject, ClientPhase,
                                    ClientTask, TaskValidation, TaskQuestion,
                                    TaskResponse, TaskFile. Profile has project_id field.
proxy.ts                            Next.js 16 middleware — passes all requests through.
                                    Auth is handled client-side via AuthContext.
```

---

## Environment Variables

```
# .env.local (gitignored — must also be set in Vercel dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://bzfspkxbvqjbvmumrozx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-...        # Required for "Depurar con IA" in pipeline
```

`NEXT_PUBLIC_*` vars are baked into the client bundle at **build time**. Missing in Vercel = permanent loading spinner.

---

## Auth Flow

```
/login → supabase.auth.signInWithPassword()
       → onAuthStateChange fires (SIGNED_IN)
       → AuthContext: getSession() → fetchProfile() → setLoading(false)
       → /dashboard → checks profile.role + profile.project_id
       → admin           → /dashboard/admin
       → client + project_id → /dashboard/portal
       → client (legacy) → /dashboard/onboarding
```

**Critical:** `getSession()` must complete before any `supabase.from()` query. `onAuthStateChange` alone does NOT reliably update the HTTP client's Authorization header before the first query fires.

---

## Portal de Status Flow

```
Client logs in → /dashboard/portal
  → Fetches client_projects WHERE client_id = me
  → Fetches client_phases for that project
  → Fetches client_tasks for all phases
  → Renders phases as collapsible cards
  → Task types:
      hito          → checkbox to mark complete (0/100)
      info_request  → click → 580px InfoRequestPanel slides in
                       → shows task_questions → client fills task_responses
                       → can upload task_files per question
                       → progress auto-calculated from filled questions
      validation    → click → 580px ValidationPanel slides in
                       → admin provides doc link + comments
                       → validate button updates task_validations
```

---

## Pipeline Flow

```
Client submits data via Portal de Status (info_request tasks)
  → Admin opens /dashboard/admin/pipeline
  → Selects client from dropdown
  → Sees raw client text (left column) per section
  → Clicks "Depurar con IA" → POSTs to /api/depure → Anthropic API
  → Reviews + edits in right column textarea
  → Clicks "Guardar depuración" → upserts pipeline_items (status: 'depurado')
  → "Enviar a Pandai" (disabled — webhook not yet configured)
```

**Status flow:** `sin_datos` → `datos_recibidos` → `depurado` → `enviado`

---

## Template Editor Flow

The new editor at `/dashboard/admin/templates` works with the **project template layer**:
1. Fetches `project_templates` → tab bar selector
2. On select: loads `phase_templates` → collapsible phase cards
3. Each phase loads its `task_templates` → task rows
4. For `info_request` tasks: expand → shows `question_templates`
5. All CRUD operations (add/edit/delete task, add/edit/delete question)
6. **Copy-on-create model**: changes only affect future projects, not existing client_projects

---

## Design Tokens (Portal de Status)

```
Font:       Inter
Background: #F5F7FB
Cards:      #FFFFFF
Border:     #E2E8F0, border-radius: 16px
Navy:       #0F1629  (primary buttons, phase circles)
Blue:       #3B82F6
Violet:     #4F46E5
Green:      #059669
Orange:     #F59E0B

Type badges:
  Hito       → bg #F1F5F9  text #64748B
  Info       → bg #DBEAFE  text #1D4ED8
  Validación → bg #EDE9FE  text #6D28D9
```

---

## Test Data

- **Nissan Iztacalco** — active client project with 16 tasks, 4 phases, 28 questions
- **Client login:** tomas.hanna@ug.uchile.cl

---

## What Is Working

- ✅ Email/password login and signup (Spanish UI)
- ✅ Role-based routing: admin → /dashboard/admin, client with project → /dashboard/portal, legacy client → /dashboard/onboarding
- ✅ Auto-admin for the two owner emails via DB trigger
- ✅ **Portal de Status** — phases, tasks, progress tracking for clients
- ✅ **info_request tasks** — InfoRequestPanel with questions, text responses, file uploads
- ✅ **validation tasks** — ValidationPanel with doc link + comments + validate button
- ✅ **hito tasks** — checkbox to mark complete
- ✅ Admin clients list with invite modal (2-step: email/role → template/sections)
- ✅ Admin client detail view (legacy onboarding layout)
- ✅ ClientSectionManager — admin bar for legacy section assignment
- ✅ 6 legacy industry templates (Salud, E-commerce, Educación, Servicios, Inmobiliaria, Automotora)
- ✅ **Template editor** — phase/task/question CRUD for project_templates layer
- ✅ Per-client section selection (legacy system)
- ✅ Backward compat — clients without project_id see legacy global sections
- ✅ Text submission per section (legacy upsert on save)
- ✅ File upload per section (any type, drag-drop or click)
- ✅ File list with name, size, date, and download button
- ✅ Admin can upload files on behalf of clients
- ✅ Admin validation + client approval (legacy sections)
- ✅ Supabase Storage (private bucket `submissions`, signed URL downloads)
- ✅ RLS on all tables + storage policies + grants applied
- ✅ **Pipeline** — two-column raw vs depured view per section
- ✅ **AI depuration** — Anthropic API cleans raw text (requires ANTHROPIC_API_KEY)
- ✅ **Pipeline status tracking** — Sin datos → Datos recibidos → Depurado → Enviado
- ✅ **Prompt template editor** — per-section prompts for future Pandai webhook
- ✅ **Sidebar** — Vambe logo (logo-vambe.png), SVG nav icons (no emojis)
- ✅ **Toast notifications** — via PortalProviders + Toast component

---

## Known Issues / Limitations

- ⚠️ **No password reset flow** — no "Forgot password" page.
- ⚠️ **No email confirmation handling** — unconfirmed users get a silent auth error.
- ⚠️ **No file deletion UI** — files can be uploaded but not removed by users.
- ⚠️ **"Enviar a Pandai" not implemented** — button exists but webhook is not wired up.
- ⚠️ **Pipeline files not included in AI depuration** — only text content is sent.
- ⚠️ **`proxy.ts` passes everything through** — auth is entirely client-side.
- ⚠️ **Admin client detail for new Portal clients** — `/dashboard/admin/clients/[id]` may still show legacy OnboardingView for clients with project_id.

---

## What Is Left to Build

### High priority
- [ ] **Admin Portal view for clients** — `/dashboard/admin/clients/[clientId]` should show the Portal de Status with admin controls (validate tasks, fill validation panels)
- [ ] **Pandai webhook** — wire up "Enviar a Pandai": POST depured_text + rendered prompt to Pandai's endpoint; update status to 'enviado'
- [ ] **Password reset** — `/forgot-password` using `supabase.auth.resetPasswordForEmail()`
- [ ] **File deletion** — delete button on each file (storage + DB record)

### Medium priority
- [ ] **Create client project from invite modal** — when inviting, select a project_template to create client_project (copy-on-create)
- [ ] **File content in AI depuration** — extract text from PDFs/docs for pipeline
- [ ] **Email notifications** — notify admin on client submit; notify client on validation
- [ ] **Pipeline bulk actions** — depure all sections for a client in one click

### Low priority / polish
- [ ] **Mobile responsiveness audit**
- [ ] **Server-side auth in proxy.ts** — move redirects into middleware using `@supabase/ssr`

---

## Common Gotchas

1. **403 on any table** → Check `GRANT USAGE ON SCHEMA public TO anon, authenticated` first. Always the root cause for tables created via raw SQL.

2. **Stuck "Cargando..." in production** → `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` not set in Vercel. These are baked at build time — redeploy after adding.

3. **Profile shows wrong role** → `getSession()` in AuthContext must complete before any `supabase.from()` query. Do not replace with `onAuthStateChange`-only.

4. **PostgREST 403 after schema changes** → Run `NOTIFY pgrst, 'reload schema';` to force cache reload.

5. **Embedded select failing in production** → Use two separate queries. PostgREST's foreign-key resolution can fail on cold cache. See `OnboardingView.tsx` for the pattern.

6. **`/api/depure` returns 503** → `ANTHROPIC_API_KEY` not set. Add to Vercel → Project Settings → Environment Variables, then redeploy.

7. **Template section titles blank in ClientSectionManager modal** → When switching templates, fetch section details for the NEW template. `ClientSectionManager` does this via `templateSectionDetails` state in `openChangeTemplate()`.

8. **Storage bucket name** → Always `submissions`, not `private`. Uploading to wrong bucket = silent failure.

9. **Copy-on-create model** → Editing `project_templates` / `phase_templates` / `task_templates` / `question_templates` does NOT affect existing `client_projects`. Each client gets a snapshot at invite/project-creation time.

10. **`project_id` on Profile** → Clients with `project_id` get the Portal de Status. Clients without get the legacy onboarding. The `/dashboard/page.tsx` router checks this field. Make sure `project_id` is populated in profiles when creating a client project.
