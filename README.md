# Queuewise

Queuewise is a serverless-first queue console for Axis Driving School. The current app includes the responsive operations workspace, counter desk, kiosk ticket flow, and TV display preview. Supabase is the source-of-truth boundary for production queue operations.

## Stack

- Next.js App Router, TypeScript, and Tailwind CSS
- Supabase PostgreSQL, Auth, Realtime, and Row Level Security
- Vercel for the application runtime
- Zod for server-side operation validation

## Run locally

```bash
npm install
npx supabase start
npx supabase status -o env
# Copy the local API URL, publishable/anon key, and service-role key
# into .env.local using .env.development.example as the template.
npm run dev
```

The interface works in demo mode without Supabase variables, but the real local workflow uses the Docker-backed Supabase project.

Useful local commands:

```bash
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:stop
```

`supabase db reset` applies every migration and the local seed file from a clean database. Keep the generated keys in `.env.local`; never commit them.

## Supabase setup

1. Create a Supabase project and copy its URL and publishable key into `.env.local`.
2. Apply the migrations in `supabase/migrations` in filename order through the Supabase SQL editor or Supabase CLI. The latest migration adds public counter data for the display, validates queue transitions, and adds the tenant/RBAC foundation.
3. Create staff users in Supabase Auth, then add matching rows to `profiles` and assign their `counter_id`.
4. Seed counters and promote the first administrator by setting `profiles.role` to `ADMIN`.
5. Confirm `queue_tickets` is enabled in the Realtime publication.

The migration provides:

- Atomic public ticket creation with daily sequences.
- Atomic `NEXT` allocation using row locking and `SKIP LOCKED`.
- Staff counter authorization and an audit event for every transition.
- RLS policies for staff, administrators, and safe public display data.
- `queue_display` view for TV clients without customer information.
- Editable school branding, kiosk copy, TV labels, image URLs, colors, voice template, and sound settings.
- Super Admin, Admin, Staff, and User roles with protected queue permissions.
- Organization, branch, and group hierarchy with tenant-scoped profiles, counters, queue tickets, and audit events.
- Custom roles and a permission matrix for user and role governance.
- Branding bucket with admin-only uploads and public kiosk/display reads.

Logo assets are managed through hosted image URLs in Settings, so replacing a school logo does not require a code change or redeploy.

Staff invitations use the server-only `SUPABASE_SERVICE_ROLE_KEY` to invite users through Supabase Auth and create their `profiles` assignment. Keep this key configured only in Vercel server environments; never expose it with a `NEXT_PUBLIC_` prefix.

## SaaS operating model

Each customer is an `organization`. Branches belong to an organization, and groups can be attached to a branch for teams such as front desk, instructors, or exam operations. Users belong to one organization and can be assigned to a branch, group, counter, and role. Queue numbering and counters are scoped to a branch, while queue events retain organization and branch ownership for audit and reporting.

The first commercial model is deliberately manual and contract-led:

- Charge the driving school directly once per year using the organization contract fields (`plan`, `billing_email`, `contract_started_on`, and `contract_ends_on`).
- Keep `maintenance_included` and `status` as operational controls for support eligibility and access suspension.
- Do not add card details or payment secrets to this application. Store invoices and payment records in an accounting system until recurring billing volume justifies a billing provider.

Before selling to multiple schools, finish these production milestones:

1. Resolve the organization and branch from a signed workspace context, subdomain, or branch slug for public kiosk and display URLs; do not rely on the default-branch fallback for customer-facing deployments.
2. Add an organization owner onboarding flow that creates the first Admin, branch, groups, counters, and branding in one transaction.
3. Add an organization switcher only for platform Super Admins, with explicit audit logging for tenant impersonation.
4. Add scheduled contract-expiry notifications and a server-side suspension check for every authenticated operation.
5. Add backups, support runbooks, data export, and a documented deletion/retention policy before onboarding real customer data.

### Seed login accounts

The repository does not contain default passwords. Copy `.env.seed.example` to `.env.seed`, set unique passwords for each school, and run:

```bash
npm run supabase:seed-users
```

This creates or updates one account for each role:

| Role | Purpose | Counter |
| --- | --- | --- |
| `SUPERADMIN` | Full platform and school administration | 1 |
| `ADMIN` | School settings, staff, and queue administration | 2 |
| `STAFF` | Counter operations | 3 |
| `USER` | Authenticated read-only school user | None |

Use a different `.env.seed` for each driving school. The file is ignored by Git and passwords are never stored in migrations or seed SQL.

Reports use live queue rows to calculate tickets issued, waiting, serving, completed, skipped, average wait, average service time, and completion rate. Demo mode intentionally shows sample values until Supabase is configured.

The service-role key belongs only in trusted server infrastructure and is intentionally not used by browser code.

## Project map

```text
app/page.tsx                         Operations UI and demo/live interactions
app/admin/management.tsx             Sortable Users and Roles governance workspace
app/kiosk/page.tsx                   Customer kiosk entry point
app/display/page.tsx                 Public TV display entry point
app/counter/page.tsx                 Staff counter entry point
app/login/page.tsx                   Supabase Auth login
lib/queue/operations.ts              Validated server-side RPC boundary
lib/settings/                        Editable content model and settings RPC
lib/admin/operations.ts              Tenant-scoped user and role management actions
lib/supabase/                        Browser and server Supabase clients
supabase/migrations/                 Database schema, functions, and RLS
```

## Device URLs

- `/kiosk` for the customer touchscreen.
- `/display` for the public waiting-room display.
- `/counter` for authenticated staff.
- `/admin` for the operations dashboard.
- `/settings` for administrator-managed content and visual settings.

## Checks

```bash
npm run lint
npm run build
```

## Deploy

### Development verification

1. Start Docker and run `npm run supabase:start`.
2. Copy values from `npx supabase status -o env` into `.env.local`.
3. Run `npm run supabase:reset`.
4. Run `npm run dev`.
5. Test `/kiosk`, `/display`, `/login`, `/counter`, `/settings`, and `/reports` locally.
6. Run `npm run lint` and `npm run build`.
7. To test seeded roles locally, copy `.env.seed.example` to `.env.seed`, set local Supabase credentials from `npx supabase status -o env`, and run `npm run supabase:seed-users`.

### Production deployment

1. Create a separate hosted Supabase project for production.
2. Link it with `npx supabase link --project-ref YOUR_PROJECT_REF`.
3. Apply migrations with `npx supabase db push`.
4. Run the counter seed with `npx supabase db query --linked --file supabase/seed.sql`.
5. Copy `.env.seed.example` to `.env.seed`, use the production Supabase URL/service-role key, set unique school passwords, and run `npm run supabase:seed-users`.
6. Link Vercel with `npx vercel link`.
7. Add the variables from `.env.production.example` with `npx vercel env add` for Production.
8. Deploy a preview with `npx vercel`, test it, then deploy production with `npx vercel --prod`.

Do not reuse the local Supabase keys in Vercel. Development and production must use different Supabase projects and credentials.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
