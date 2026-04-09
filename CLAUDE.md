@AGENTS.md

# Vambe Client Onboarding Portal — Project State

**Last updated:** 2026-04-09
**Stack:** Next.js 16.2.2 · React 19 · TypeScript · Tailwind CSS v4 · Supabase
**Supabase project:** `bzfspkxbvqjbvmumrozx` (name: "Files", org: Vambe Pro)
**Supabase URL:** https://bzfspkxbvqjbvmumrozx.supabase.co
**Deployed on:** Vercel (connected to `main` branch, auto-deploys on push)

---

## What This App Is

A private onboarding portal for Vambe's AI clients. Clients log in and submit text
and files across structured sections (organized into parts per template). Admins can
view all clients, upload on their behalf, validate submissions, and run a data pipeline
that cleans raw client data with AI and prepares it for export to Pandai.

---

## Two User Roles

| Role | Email | Access |
|------|-------|--------|
| `admin` | tomashanna17@gmail.com | Full access — all clients, all submissions, pipeline |
| `admin` | tomas.hanna@vambe.ai | Full access — all clients, all submissions, pipeline |
| `client` | any other signup | Own onboarding only |

New signups are `client` by default. The two admin emails are hardcoded in the
`handle_new_user` trigger and are auto-promoted on signup.

---

## Database (Supabase project bzfspkxbvqjbvmumrozx)

### Tables

| Table | RLS | Notes |
|-------|-----|-------|
| `profiles` | ✅ | SELECT own, UPDATE own, admin UPDATE all |
| `onboarding_parts` | ✅ | SELECT for authenticated. Part_number is NOT unique (template parts share numbers 1-3). |
| `onboarding_sections` | ✅ | SELECT for authenticated. `template_id` FK — NULL = legacy global, non-NULL = template-specific. |
| `onboarding_templates` | ✅ | 6 industry templates: Salud(1), E-commerce(2), Educación(3), Servicios(4), Inmobiliaria(5), Automotora(6) |
| `template_sections` | ✅ | Maps template → its sections with optional custom_description and display_order |
| `client_sections` | ✅ | Per-client section assignments. Empty = backward compat (show all global sections). |
| `submissions` | ✅ | SELECT/INSERT/UPDATE own, admin DELETE |
| `submission_files` | ✅ | SELECT/INSERT/DELETE own or admin |
| `pipeline_items` | ✅ | Admin-only. Depured text + status per client+section. status: 'depurado' \| 'enviado'. UNIQUE(client_id, section_id). |
| `prompt_templates` | ✅ | Admin-only. Per-section prompt for Pandai export. UNIQUE(section_id). |

### Key DB objects

- **`public.is_admin()`** — `SECURITY DEFINER` helper function; returns true if
  `auth.uid()` has `role = 'admin'` in profiles. Used in all RLS policies.
- **`handle_new_user()` trigger** — fires `AFTER INSERT ON auth.users`; creates a
  profile row, sets `role = 'admin'` for the two hardcoded emails, `'client'` for all
  others.

### Section architecture (Phase 3–4)

- **Legacy global sections** — `template_id IS NULL`, under old parts (part_number 1–4).
  Clients with no `client_sections` assignments see these.
- **Template-specific sections** — `template_id = X`, under new shared parts
  (part_number 1–3: "Bases de la Empresa", "Resolución de Dudas y Estrategia de Venta",
  "Conversaciones Reales"). Each of the 6 templates has 6–7 industry-specific sections.
- **`onboarding_parts.part_number` is not unique** — the unique constraint was dropped.
  Multiple parts can share part_number 1, 2, 3. Only parts whose sections are assigned
  to a client will be rendered (`.filter((p) => p.sections.length > 0)`).

### Grants (critical — tables were created via raw SQL, not Supabase UI)

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.onboarding_parts    TO anon, authenticated;
GRANT SELECT ON public.onboarding_sections TO anon, authenticated;
GRANT SELECT ON public.profiles            TO anon;
GRANT SELECT, UPDATE ON public.profiles    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.submission_files TO authenticated;
GRANT ALL ON public.pipeline_items    TO authenticated;
GRANT ALL ON public.prompt_templates  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.prompt_templates_id_seq TO authenticated;
```

**Root cause of every 403 ever encountered:** missing `GRANT USAGE ON SCHEMA public`.

### Storage

- **Bucket:** `submissions` (private, `public = false`)
- **Upload path pattern:** `{client_id}/{section_id}/{timestamp-filename}`
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
                                    loading. Uses getSession() as primary init so the
                                    Supabase HTTP client has the JWT before any query runs.
                                    Includes 8 s safety timeout and mounted ref guard.
  api/
    invite/route.ts                 POST — admin-only. Invites a user by email via
                                    Supabase admin.inviteUserByEmail, creates profile row,
                                    assigns client_sections from template. Auth via JWT
                                    decode (avoids service-role getUser() reliability issue).
    depure/route.ts                 POST — admin-only. Receives raw_text + section_title +
                                    section_description + company_name. Calls Anthropic
                                    claude-sonnet-4-20250514 to clean/structure the text.
                                    Returns { depured_text }. Requires ANTHROPIC_API_KEY
                                    env var — shows helpful error if missing.
  dashboard/
    layout.tsx                      Protected shell — sidebar + header. Admin nav:
                                    Clientes · Pipeline · Plantillas · Mi Perfil.
                                    Client nav: Mi Onboarding · Mi Perfil.
    page.tsx                        Redirect router — admins → /dashboard/admin,
                                    clients → /dashboard/onboarding.
    onboarding/
      page.tsx                      Client onboarding page — renders <OnboardingView>
                                    with the logged-in user's own clientId.
    admin/
      page.tsx                      Admin clients list — invite modal (2-step: email/
                                    name/company/role → template + section checkboxes),
                                    client table with template badge and progress.
      [clientId]/
        page.tsx                    Admin client detail — breadcrumb + <ClientSectionManager>
                                    (admin-only bar) + <OnboardingView isAdmin=true>.
      templates/
        page.tsx                    Two-panel template editor. Left: template list with
                                    create/delete. Right: full section CRUD — inline edit
                                    (title+description), delete with confirm, add section
                                    per part, add new part (requires first section).
                                    "Gestionar Secciones" page removed from nav.
      pipeline/
        page.tsx                    Admin pipeline (Phase 5). Overview stats (pending
                                    clients, depurado, enviado). Client selector dropdown.
                                    Per-section two-column layout: raw client data (left,
                                    read-only with file downloads) vs depured textarea
                                    (right, editable). Buttons: "Depurar con IA" (calls
                                    /api/depure, auto-fills textarea), "Guardar depuración"
                                    (upserts pipeline_items), "Enviar a Pandai" (disabled,
                                    tooltip: webhook no configurado). Status badges:
                                    Sin datos → Datos recibidos → Depurado → Enviado.
        prompts/
          page.tsx                  Prompt template editor. Lists all template-specific
                                    sections grouped. Expandable editor per section with
                                    variable insertion buttons ({company_name},
                                    {section_title}, {depured_text}). Dirty state tracking,
                                    save feedback, reset to default. Saved via upsert to
                                    prompt_templates table.
  components/
    OnboardingView.tsx              Core shared component. Fetches parts, sections, and
                                    submissions for a given clientId. Backward compat:
                                    no assignments → shows global sections (template_id
                                    IS NULL) only. With assignments → filters to assigned
                                    sections with custom descriptions applied.
    SectionCard.tsx                 Per-section card. Handles text save (upsert),
                                    file upload (storage + DB record), file download
                                    (signed URL), admin validation toggle, and client
                                    approval checkbox for admin-uploaded files.
    ClientSectionManager.tsx        Admin-only bar on client detail page. Shows assigned
                                    section chips with remove buttons. "Cambiar plantilla"
                                    modal: template selector + per-section checkboxes
                                    (loads section details for the selected template to
                                    avoid blank titles). "Añadir sección" dropdown.
    FileUploadZone.tsx              Drag-and-drop / click-to-upload zone.
lib/
  supabase.ts                       Module-level Supabase client singleton (anon key).
  types.ts                          TypeScript interfaces: Profile, OnboardingPart,
                                    OnboardingSection (includes template_id), Submission,
                                    SubmissionFile, OnboardingTemplate, TemplateSection,
                                    ClientSection, PartWithSections, SubmissionWithFiles,
                                    ClientWithProgress, PipelineItem, PromptTemplate.
proxy.ts                            Next.js 16 middleware. Passes all requests through —
                                    auth is handled client-side via AuthContext.
```

---

## Environment Variables

```
# .env.local (gitignored — must be set manually in Vercel dashboard too)
NEXT_PUBLIC_SUPABASE_URL=https://bzfspkxbvqjbvmumrozx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-...        # Required for "Depurar con IA" in the pipeline
```

`NEXT_PUBLIC_*` vars are baked into the client bundle at **build time**. If missing in
Vercel, every Supabase request fails silently (permanent loading spinner).

`ANTHROPIC_API_KEY` is server-only (used in `/api/depure`). Without it the depuration
button shows a clear error message — the app still works otherwise.

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

**Critical:** `getSession()` must be called before any `supabase.from()` query.
`onAuthStateChange` alone does NOT reliably update the HTTP client's Authorization
header before the first query fires.

---

## Pipeline Flow (Phase 5)

```
Client submits onboarding data
  → Admin opens /dashboard/admin/pipeline
  → Selects client from dropdown
  → Sees raw client text (left column) per section
  → Clicks "Depurar con IA"
      → Browser POSTs to /api/depure with auth token
      → Server calls Anthropic API (claude-sonnet-4-20250514)
      → Returns cleaned, structured plain text
  → Admin reviews + edits in right column textarea
  → Clicks "Guardar depuración"
      → Upserts pipeline_items (status: 'depurado')
  → "Enviar a Pandai" button (disabled — webhook not yet configured)
      → Will use prompt_templates + depured_text when implemented
```

**Status flow per section:**
- `sin_datos` — no submission content
- `datos_recibidos` — submission exists but no pipeline_item
- `depurado` — pipeline_item.status = 'depurado'
- `enviado` — pipeline_item.status = 'enviado'

---

## What Is Working

- ✅ Email/password login and signup (Spanish UI)
- ✅ Role-based routing (admin → /dashboard/admin, client → /dashboard/onboarding)
- ✅ Auto-admin assignment for the two owner emails via DB trigger
- ✅ Admin clients list with invite modal (2-step: email/role → template/sections)
- ✅ Admin client detail view (full onboarding layout for any client)
- ✅ ClientSectionManager — admin-only bar for section assignment and template switching
- ✅ 6 industry-specific templates (Salud, E-commerce, Educación, Servicios, Inmobiliaria, Automotora)
- ✅ Each template has its own sections (6–7) with industry-adapted descriptions
- ✅ Template editor — full CRUD: edit section title/description, add sections, add parts, delete
- ✅ Per-client section selection (admin chooses which template sections to show each client)
- ✅ Backward compat — clients without template assignments see legacy global sections
- ✅ Text submission per section (upsert on save)
- ✅ File upload per section (any type, drag-drop or click)
- ✅ File list with name, size, date, and download button
- ✅ Admin can upload files on behalf of clients
- ✅ Admin can validate sections; client can approve admin uploads
- ✅ Section status badges: Pendiente / Enviado / Validado
- ✅ Supabase Storage (private bucket, signed URL downloads)
- ✅ RLS on all tables + storage policies + grants applied
- ✅ **Pipeline** — two-column raw vs depured view per section
- ✅ **AI depuration** — Anthropic API cleans raw text (requires ANTHROPIC_API_KEY)
- ✅ **Pipeline status tracking** — Sin datos → Datos recibidos → Depurado → Enviado
- ✅ **Prompt template editor** — per-section prompts for future Pandai webhook

---

## Known Issues / Limitations

- ⚠️ **No password reset flow** — no "Forgot password" page.
- ⚠️ **No email confirmation handling** — unconfirmed users get a silent auth error.
- ⚠️ **No file deletion UI** — files can be uploaded but not removed by users.
- ⚠️ **"Enviar a Pandai" not implemented** — button exists but webhook is not wired up.
- ⚠️ **Pipeline files not included in AI depuration** — only text content is sent to
  the AI. Uploaded files (PDFs, etc.) are shown for download but not processed.
- ⚠️ **`proxy.ts` passes everything through** — auth is entirely client-side.

---

## What Is Left to Build

### High priority
- [ ] **Pandai webhook** — wire up "Enviar a Pandai": POST depured_text + rendered
      prompt template to Pandai's endpoint; update pipeline_item status to 'enviado'
- [ ] **Password reset** — `/forgot-password` using `supabase.auth.resetPasswordForEmail()`
- [ ] **File deletion** — delete button on each file (storage + DB record)

### Medium priority
- [ ] **File content in AI depuration** — extract text from PDFs/docs and include
      in the depuration prompt alongside the text submission
- [ ] **Email notifications** — notify admin when a client submits; notify client
      when admin validates (Supabase Edge Functions + Resend/SendGrid)
- [ ] **Pipeline bulk actions** — depure all sections for a client in one click
- [ ] **Admin notes per section** — private text field separate from client submission

### Low priority / polish
- [ ] **Mobile responsiveness audit**
- [ ] **Toast notifications** — replace inline save confirmations
- [ ] **Server-side auth in proxy.ts** — move redirects into middleware using
      `@supabase/ssr` and cookie-based sessions

---

## Common Gotchas

1. **403 on any table** → Check `GRANT USAGE ON SCHEMA public TO anon, authenticated`
   first. This is always the root cause when tables are created via raw SQL.

2. **Stuck "Cargando..." in production** → Almost always means `NEXT_PUBLIC_SUPABASE_URL`
   or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set in Vercel's environment variables.
   These are baked at build time — redeploy after adding them.

3. **Profile shows wrong role** → The `getSession()` call in AuthContext must complete
   before any `supabase.from()` query. Do not replace `getSession()` with
   `onAuthStateChange`-only.

4. **PostgREST 403 after schema changes** → Run `NOTIFY pgrst, 'reload schema';` to
   force a schema cache reload.

5. **Embedded select (`select('*, relation(*)')`) failing in production** → Use two
   separate queries instead. PostgREST's foreign-key resolution can fail on cold cache.
   See `OnboardingView.tsx` for the pattern.

6. **`/api/depure` returns 503** → `ANTHROPIC_API_KEY` is not set. Add it to
   Vercel → Project Settings → Environment Variables, then redeploy.

7. **Template section titles blank in ClientSectionManager modal** → When switching
   templates, section details must be fetched for the NEW template (not the current one).
   `ClientSectionManager` does this via `templateSectionDetails` state loaded in
   `openChangeTemplate()`.

8. **New part not appearing in template editor** → Parts only show when they have at
   least one section with `template_id = selected.id`. Creating a part requires also
   creating its first section — enforced by the "Nueva parte" form UI.
