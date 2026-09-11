# MediVault - Project Instructions

## Project Overview

MediVault is a personal health management platform that enables users to securely store medical documents, track symptoms, and gain AI-powered health insights. The application prioritizes privacy, security, and user experience for managing sensitive health information.

## Task Management with Beads

**IMPORTANT: Always use Beads (`bd`) for task tracking in this project.**

Beads is a git-backed issue tracker designed for AI agents. All tasks, features, and bugs must be tracked in Beads.

### Essential Commands

```bash
# View tasks
bd list                    # Show open tasks
bd list --all              # Show all tasks (including closed)
bd ready                   # Show tasks ready to work on (no blockers)
bd show <id>               # Show task details

# Create tasks
bd create "Task title" -p 0 --description "Why and what"
# Priority: -p 0 (P0 critical), -p 1 (P1 high), -p 2 (P2 medium), -p 3 (P3 low)

# Update tasks
bd close <id> -r "Completion reason"
bd dep add <child> <parent>    # Add dependency

# Workflow
bd quickstart              # Interactive guide
bd doctor --fix            # Fix configuration issues
```

### Task Workflow

1. **Before starting work**: Check `bd ready` for available tasks
2. **Starting a task**: Note which task you're working on
3. **During work**: Create sub-tasks if scope grows
4. **Completing work**: Close with `bd close <id> -r "what was done"`
5. **New features/bugs**: Always create a Beads task first

### Current Open Tasks

Run `bd list` to see current backlog. Key upcoming features:
- AI Health Insights (medivault-4fk)
- Medication Reminders (medivault-3r5)
- Document OCR (medivault-dka)
- Health Data Export (medivault-htn)
- Biometric Authentication (medivault-fut)
- Offline Mode (medivault-jvb)
- Appointment Calendar (medivault-2qf)

## Development Philosophy

### API-First Development
- **Design the API contract before implementation** - Define OpenAPI/Swagger specs first
- **API is the source of truth** - Frontend consumes the API, never bypasses it
- **Version the API** - Use semantic versioning for breaking changes
- **Document all endpoints** - Every endpoint must have clear documentation

### Test-Driven Development (TDD)
- **Red-Green-Refactor cycle** - Write failing test → Make it pass → Refactor
- **Tests before code** - No feature code without a failing test first
- **Test coverage requirements** - Aim for 80%+ coverage on business logic
- **Tests are documentation** - Tests describe expected behavior

### Testing Pyramid
```
        /\
       /  \      E2E Tests (Critical user journeys)
      /----\
     /      \    Integration Tests (API endpoints, DB queries)
    /--------\
   /          \  Unit Tests (Business logic, utilities, components)
  --------------
```

## Monorepo Structure

Three packages: API, SDK, and Web application.

```
medivault/
├── packages/
│   ├── api/                        # Backend API Service
│   │   ├── src/
│   │   │   ├── routes/             # Route handlers
│   │   │   │   ├── documents.ts
│   │   │   │   ├── symptoms.ts
│   │   │   │   └── auth.ts
│   │   │   ├── services/           # Business logic
│   │   │   ├── repositories/       # Data access (Drizzle)
│   │   │   ├── middleware/         # Auth, validation, error handling
│   │   │   ├── lib/
│   │   │   │   ├── supabase.ts     # Supabase admin client
│   │   │   │   └── db.ts           # Drizzle client
│   │   │   └── index.ts            # App entry point
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── integration/
│   │   ├── openapi/
│   │   │   ├── registry.ts         # OpenAPI registry
│   │   │   └── spec.yaml           # Generated spec
│   │   ├── drizzle/                # Migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                        # TypeScript SDK (auto-generated)
│   │   ├── src/
│   │   │   ├── client.ts           # API client class
│   │   │   ├── types.ts            # Generated types from OpenAPI
│   │   │   ├── resources/
│   │   │   │   ├── documents.ts    # Documents resource
│   │   │   │   ├── symptoms.ts     # Symptoms resource
│   │   │   │   └── auth.ts         # Auth resource
│   │   │   └── index.ts            # SDK entry point
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                        # Next.js Frontend
│       ├── app/
│       │   ├── (marketing)/        # Public pages
│       │   │   └── page.tsx        # Landing page
│       │   ├── (auth)/             # Auth pages
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── (dashboard)/        # Protected pages
│       │   │   ├── layout.tsx
│       │   │   ├── dashboard/
│       │   │   ├── documents/
│       │   │   └── symptoms/
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── ui/                 # shadcn/ui
│       │   └── features/
│       ├── hooks/
│       │   └── use-sdk.ts          # SDK React hooks
│       ├── lib/
│       │   ├── sdk.ts              # SDK instance
│       │   └── supabase.ts         # Supabase client (for auth)
│       ├── tests/
│       ├── public/
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       └── package.json
│
├── e2e/                            # End-to-end tests
│   ├── tests/
│   └── playwright.config.ts
│
├── supabase/                       # Supabase configuration
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
│
├── docs/
│   ├── openapi/                    # API documentation
│   └── architecture/               # ADRs
│
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml
└── turbo.json                      # Turborepo config
```

## Tech Stack

### API Package (`packages/api`)
- **Framework**: Hono (lightweight, edge-ready, OpenAPI support)
- **Runtime**: Vercel Edge Functions
- **ORM**: Drizzle ORM (type-safe)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (JWT validation)
- **Validation**: Zod + OpenAPI extensions
- **Docs**: OpenAPI 3.1 + Scalar
- **Testing**: Vitest + Supertest

### SDK Package (`packages/sdk`)
- **Generator**: openapi-typescript + openapi-fetch
- **Types**: Auto-generated from OpenAPI spec
- **Runtime**: Fetch-based, works in browser + Node.js
- **Testing**: Vitest with MSW (Mock Service Worker)

### Web Package (`packages/web`)
- **Framework**: Next.js 14+ (App Router)
- **API Client**: `@medivault/sdk`
- **State**: TanStack React Query + SDK
- **Forms**: React Hook Form + Zod
- **Auth UI**: Supabase Auth UI

### UI/Design
- **shadcn/ui** (styled components)
- **Base UI** (headless primitives)
- **Tailwind CSS** (styling)
- **Hugeicons** (icons)
- **JetBrains Mono** + Inter (typography)

### Database & Storage
- **Supabase** (PostgreSQL + Auth + Storage)
- **Drizzle ORM** (type-safe queries)
- **Row Level Security** (RLS) policies

### Testing
- **Vitest** (unit + integration)
- **MSW** (API mocking for SDK tests)
- **React Testing Library** (components)
- **Playwright** (E2E)

### Infrastructure
- **Vercel** (API + Web hosting)
- **Supabase** (database + auth + storage)
- **Resend** (transactional email)
- **GitHub Actions** (CI/CD)
- **Turborepo** (monorepo build orchestration)

## SDK Workflow

The SDK is auto-generated from the OpenAPI spec and provides type-safe API access.

### SDK Generation Pipeline

```bash
# 1. API defines OpenAPI spec (from Zod schemas)
cd packages/api && npm run openapi:generate

# 2. SDK generates types and client from spec
cd packages/sdk && npm run generate

# 3. Web app imports and uses SDK
import { MediVaultClient } from '@medivault/sdk';
```

### SDK Structure

```typescript
// packages/sdk/src/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';

export function createMediVaultClient(options: {
  baseUrl: string;
  token?: string;
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
  });
}
```

### Using SDK in Web App

```typescript
// packages/web/lib/sdk.ts
import { createMediVaultClient } from '@medivault/sdk';

export const sdk = createMediVaultClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
});

// Set auth token after login
export function setAuthToken(token: string) {
  sdk.use({ headers: { Authorization: `Bearer ${token}` } });
}
```

```typescript
// packages/web/hooks/use-documents.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { sdk } from '@/lib/sdk';

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await sdk.GET('/api/v1/documents');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocument() {
  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      const { data, error } = await sdk.POST('/api/v1/documents', {
        body: input,
      });
      if (error) throw error;
      return data;
    },
  });
}
```

### SDK Commands

```bash
# Generate SDK from OpenAPI spec
npm run sdk:generate

# Build SDK package
npm run sdk:build

# Run SDK tests
npm run sdk:test

# Publish SDK (if public)
npm run sdk:publish
```

## TDD Workflow

### For API Development

```bash
# 1. Write the failing test first
# tests/integration/documents.test.ts
describe('POST /api/documents', () => {
  it('should upload a document successfully', async () => {
    const response = await request(app)
      .post('/api/documents')
      .attach('file', 'tests/fixtures/sample.pdf')
      .field('title', 'Lab Results');

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('id');
  });
});

# 2. Run test - watch it fail (RED)
npm run test:api

# 3. Implement minimum code to pass (GREEN)
# 4. Refactor while keeping tests green (REFACTOR)
```

### For Frontend Development

```bash
# 1. Write the failing test first
# tests/unit/DocumentCard.test.tsx
describe('DocumentCard', () => {
  it('should display document title and type', () => {
    render(<DocumentCard document={mockDocument} />);

    expect(screen.getByText('Lab Results')).toBeInTheDocument();
    expect(screen.getByText('lab_result')).toBeInTheDocument();
  });
});

# 2. Run test - watch it fail (RED)
npm run test:web

# 3. Implement component (GREEN)
# 4. Refactor (REFACTOR)
```

## Testing Commands

```bash
# Root level commands
npm run test              # Run all tests
npm run test:api          # Run API tests only
npm run test:web          # Run frontend tests only
npm run test:e2e          # Run E2E tests
npm run test:coverage     # Generate coverage report

# Watch modes
npm run test:api:watch    # Watch API tests
npm run test:web:watch    # Watch frontend tests

# Package-specific (from package directory)
cd packages/api && npm test
cd packages/web && npm test
cd e2e && npm test
```

## API Design Guidelines

### OpenAPI-First Workflow

1. **Design the spec first** - Write OpenAPI spec before implementation
2. **Generate types** - Auto-generate TypeScript types from spec
3. **Implement handlers** - Build API handlers matching the spec
4. **Validate at runtime** - Use Zod schemas derived from OpenAPI
5. **Generate docs** - Serve interactive docs (Scalar/Swagger)

```bash
# Generate OpenAPI spec from Zod schemas
npm run openapi:generate

# Validate spec
npm run openapi:lint

# Generate TypeScript client for frontend
npm run openapi:client

# Serve API documentation
npm run openapi:docs
```

### OpenAPI + Zod Integration

```typescript
// packages/api/src/validators/documents.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const DocumentSchema = z.object({
  id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  title: z.string().min(1).max(255).openapi({ example: 'Blood Test Results' }),
  type: z.enum(['lab_result', 'prescription', 'x_ray', 'consultation', 'other']),
  createdAt: z.string().datetime(),
}).openapi('Document');

export const CreateDocumentSchema = DocumentSchema.omit({ id: true, createdAt: true });
```

```typescript
// packages/api/src/routes/documents.ts (Hono example)
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateDocumentSchema } from '../validators/documents';
import { authMiddleware } from '../middleware/auth';

const app = new Hono();

app.get('/documents', authMiddleware, async (c) => {
  const user = c.get('user');
  const documents = await getDocuments(user.id);
  return c.json({ success: true, data: documents });
});

app.post('/documents', authMiddleware, zValidator('json', CreateDocumentSchema), async (c) => {
  const user = c.get('user');
  const validated = c.req.valid('json');
  const document = await createDocument(user.id, validated);
  return c.json({ success: true, data: document }, 201);
});

export default app;
```

### API → SDK → Web Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. API: Define Zod schemas with OpenAPI extensions             │
│     └── packages/api/src/validators/*.ts                        │
│                                                                 │
│  2. API: Generate OpenAPI spec                                  │
│     └── pnpm openapi:generate                                   │
│     └── outputs: packages/api/openapi/spec.yaml                 │
│                                                                 │
│  3. SDK: Generate TypeScript client from spec                   │
│     └── pnpm sdk:generate                                       │
│     └── uses: openapi-typescript + openapi-fetch                │
│     └── outputs: packages/sdk/src/types.ts                      │
│                                                                 │
│  4. Web: Import and use SDK with full type safety               │
│     └── import { sdk } from '@/lib/sdk';                        │
│     └── const { data } = await sdk.GET('/api/v1/documents');    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Full Example: Adding a New Endpoint

```bash
# 1. Write failing test (TDD)
# packages/api/tests/integration/documents.test.ts

# 2. Define Zod schema with OpenAPI metadata
# packages/api/src/validators/documents.ts

# 3. Implement route handler
# packages/api/src/routes/documents.ts

# 4. Register in OpenAPI registry
# packages/api/src/openapi/registry.ts

# 5. Generate OpenAPI spec
pnpm openapi:generate

# 6. Regenerate SDK
pnpm sdk:generate

# 7. Use in Web app with full types!
# packages/web/hooks/use-documents.ts
```

### RESTful Conventions
```
GET    /api/v1/documents          # List documents
GET    /api/v1/documents/:id      # Get single document
POST   /api/v1/documents          # Create document
PUT    /api/v1/documents/:id      # Full update
PATCH  /api/v1/documents/:id      # Partial update
DELETE /api/v1/documents/:id      # Delete document
```

### Response Format
```typescript
// Success response
{
  "success": true,
  "data": T,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// Error response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  }
}
```

### API Versioning
- Use URL versioning: `/api/v1/`, `/api/v2/`
- Document breaking changes in CHANGELOG
- Support previous version for deprecation period

## Database Schema

### Core Tables (with RLS Policies)

**profiles** - Extended user data (linked to Supabase auth.users)
- `id` (PK, FK → auth.users.id), `email`, `first_name`, `last_name`, `avatar_url`, timestamps
- RLS: Users can only read/update their own profile

**medical_documents** - Uploaded medical files
- Types: `lab_result`, `prescription`, `x_ray`, `consultation`, `other`
- Includes metadata: doctor, facility, tags, storage path
- RLS: Users can only CRUD their own documents

**symptoms** - Health symptom tracking
- Severity scale: 1-10
- Tracks: location, duration, triggers, medications, time of day
- RLS: Users can only CRUD their own symptoms

### Supabase Storage Buckets

**medical-files** - Private bucket for document uploads
- RLS: Users can only access files in their own folder
- Path structure: `{user_id}/{document_id}/{filename}`

## Development Commands

```bash
# Development (Turborepo)
pnpm dev                  # Start all packages in dev mode
pnpm dev:api              # Start API only (port 3001)
pnpm dev:web              # Start Web only (port 3000)
pnpm dev:supabase         # Start local Supabase (Docker)

# Building
pnpm build                # Build all packages
pnpm build:api            # Build API only
pnpm build:sdk            # Build SDK only
pnpm build:web            # Build Web only

# SDK
pnpm sdk:generate         # Generate SDK from OpenAPI spec
pnpm sdk:build            # Build SDK package
pnpm sdk:test             # Test SDK

# Database
pnpm db:push              # Push Drizzle schema to database
pnpm db:generate          # Generate Drizzle migrations
pnpm db:migrate           # Run migrations
pnpm db:studio            # Open Drizzle Studio
pnpm db:seed              # Seed development data

# Supabase
pnpm supabase:start       # Start local Supabase
pnpm supabase:stop        # Stop local Supabase
pnpm supabase:reset       # Reset local database

# Testing
pnpm test                 # Run all tests
pnpm test:api             # Test API package
pnpm test:sdk             # Test SDK package
pnpm test:web             # Test Web package
pnpm test:e2e             # Run Playwright E2E tests
pnpm test:coverage        # Coverage report

# OpenAPI
pnpm openapi:generate     # Generate OpenAPI spec from API
pnpm openapi:lint         # Validate spec
pnpm openapi:docs         # Serve Scalar docs

# Code Quality
pnpm lint                 # ESLint all packages
pnpm typecheck            # TypeScript checking
pnpm format               # Prettier formatting

# CI
pnpm ci:check             # Run all checks (lint, typecheck, test)
```

## Environment Variables

### API Package (`packages/api/.env`)
```bash
# Database
DATABASE_URL=                   # PostgreSQL connection (Supabase)

# Supabase (server-side)
SUPABASE_URL=                   # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=      # Service role key (NEVER expose)

# Email
RESEND_API_KEY=                 # Resend API key
FROM_EMAIL=                     # Sender email address

# Server
PORT=3001                       # API port
```

### Web Package (`packages/web/.env.local`)
```bash
# API
NEXT_PUBLIC_API_URL=            # API URL (e.g., http://localhost:3001)

# Supabase (client-side auth)
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Anonymous key (safe for browser)

# Analytics
NEXT_PUBLIC_UMAMI_ID=           # Umami site ID
```

### Root `.env` (Shared/Supabase CLI)
```bash
# Supabase local dev
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-key>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### Vercel Environment Variables

**API Project:**
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

**Web Project:**
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Code Conventions

### API Layer Architecture
```
Route → Validator → Controller → Service → Repository → Database
         (Zod)                    (Logic)   (Drizzle)
```

### Naming Conventions
- **Files**: kebab-case (`document-service.ts`)
- **Classes/Types**: PascalCase (`DocumentService`)
- **Functions/Variables**: camelCase (`createDocument`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Test files**: `*.test.ts` or `*.spec.ts`

### Test File Structure
```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should do expected behavior when condition', () => {
      // Arrange
      // Act
      // Assert
    });

    it('should throw error when invalid input', () => {
      // ...
    });
  });
});
```

## UI/UX Guidelines

### Design System

**Component Libraries**:
- **shadcn/ui**: Pre-styled, accessible components (buttons, dialogs, forms)
- **Base UI**: Headless primitives for custom components
- **Tailwind CSS**: Utility-first styling

**Icons**: Hugeicons (https://hugeicons.com)
```typescript
import {
  FileUploadIcon,
  DocumentIcon,
  HeartPulseIcon,
  CalendarIcon
} from '@hugeicons/react';

// Usage
<FileUploadIcon className="w-5 h-5 text-primary" />
```

**Typography**:
```css
/* tailwind.config.ts */
fontFamily: {
  sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
}

/* Usage in components */
<h1 className="font-sans text-2xl font-bold">Dashboard</h1>
<code className="font-mono text-sm">document.id</code>
```

### Color Palette

Follow shadcn/ui theming with CSS variables:
```css
/* Light mode */
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--primary: 221.2 83.2% 53.3%;       /* Blue */
--secondary: 210 40% 96.1%;
--destructive: 0 84.2% 60.2%;       /* Red */
--muted: 210 40% 96.1%;

/* Dark mode */
--background: 222.2 84% 4.9%;
--foreground: 210 40% 98%;
```

### Component Patterns

**Buttons**:
```tsx
import { Button } from '@/components/ui/button';
import { UploadIcon } from '@hugeicons/react';

<Button variant="default" size="sm">
  <UploadIcon className="w-4 h-4 mr-2" />
  Upload
</Button>
```

**Forms**:
```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel } from '@/components/ui/form';

const form = useForm({
  resolver: zodResolver(schema),
});
```

**Loading States**:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

{isLoading ? (
  <Skeleton className="h-12 w-full" />
) : (
  <DocumentCard document={data} />
)}
```

### Responsive Design

Mobile-first approach with Tailwind breakpoints:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {documents.map(doc => <DocumentCard key={doc.id} document={doc} />)}
</div>
```

### Accessibility

- All interactive elements must be keyboard accessible
- Use semantic HTML elements
- Include proper ARIA labels
- Maintain 4.5:1 color contrast ratio
- Test with screen readers

```tsx
<Button aria-label="Upload new document">
  <UploadIcon aria-hidden="true" />
  <span className="sr-only">Upload new document</span>
</Button>
```

## Security Guidelines

### Authentication (Supabase Auth)
- All `/api/*` routes require valid Supabase JWT
- Use Supabase middleware to validate tokens
- Support multiple auth providers (email, Google, etc.)
- Row Level Security (RLS) policies on all tables
- Implement rate limiting on auth endpoints

### File Storage (Supabase Storage)
- Maximum file size: 10MB
- Allowed MIME types: PDF, JPEG, PNG, GIF, WebP
- Store in authenticated buckets with RLS policies
- Use signed URLs for secure file access
- Organize by user ID: `{user_id}/{document_id}/{filename}`

### Data Privacy (HIPAA Considerations)
- Never log PHI (Protected Health Information)
- User data strictly isolated by userId
- Analytics configured to not track PII
- Encrypt sensitive data at rest
- Audit logging for data access

### Input Validation
- Validate all inputs with Zod schemas
- Validate on both client and server
- Sanitize file names and paths
- Parameterized queries (Drizzle handles this)

## E2E Test Scenarios

### Critical User Journeys
1. **Authentication Flow**: Login → Access protected route → Logout
2. **Document Upload**: Navigate → Upload file → Verify in list → Download
3. **Symptom Tracking**: Create symptom → Edit → Search → Delete
4. **Dashboard Overview**: View stats → Navigate to details

### E2E Test Structure
```typescript
// e2e/tests/documents.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Document Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    // ... login steps
  });

  test('user can upload and view a document', async ({ page }) => {
    await page.goto('/documents');
    await page.click('[data-testid="upload-button"]');
    // ... upload steps
    await expect(page.locator('[data-testid="document-card"]')).toBeVisible();
  });
});
```

## Common Development Tasks

### Adding a New API Endpoint (TDD)

1. **Write the test first**
   ```typescript
   // packages/api/tests/integration/new-feature.test.ts
   describe('GET /api/v1/new-feature', () => {
     it('should return expected data', async () => {
       const response = await request(app).get('/api/v1/new-feature');
       expect(response.status).toBe(200);
     });
   });
   ```

2. **Define the schema** in `shared/schema.ts`

3. **Implement route** in `packages/api/src/routes/`

4. **Add service logic** in `packages/api/src/services/`

5. **Add repository** in `packages/api/src/repositories/`

6. **Run tests** - ensure they pass

7. **Update API docs** in `docs/api/`

### Adding a New Frontend Feature (TDD)

1. **Write component test first**
   ```typescript
   // packages/web/tests/unit/NewFeature.test.tsx
   it('should render correctly', () => {
     render(<NewFeature />);
     expect(screen.getByRole('button')).toBeInTheDocument();
   });
   ```

2. **Implement component** in `packages/web/src/components/`

3. **Add API integration** using React Query hook

4. **Run tests** - ensure they pass

5. **Add E2E test** if critical journey

### Database Migrations

1. **Update schema** in `shared/schema.ts`
2. **Generate migration**: `npm run db:generate`
3. **Review migration** in `drizzle/` directory
4. **Apply migration**: `npm run db:push`
5. **Update repository** methods
6. **Update/add tests**

## CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:api
      - run: npm run test:web

  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

## Troubleshooting

### Test Failures
- Check test database is running and clean
- Verify environment variables are set
- Run tests in isolation to find conflicts
- Check for async timing issues
- Ensure RLS policies allow test operations

### Database Issues
- Verify `DATABASE_URL` and Supabase keys are correct
- Check Supabase dashboard for connection limits
- Ensure migrations are applied
- Check for connection pool exhaustion
- Verify RLS policies are not blocking queries

### Authentication Issues
- Check Supabase Auth configuration
- Verify JWT tokens are valid and not expired
- Check redirect URLs are configured in Supabase
- Ensure auth providers are enabled

### Storage Issues
- Verify bucket exists and is configured correctly
- Check RLS policies on storage bucket
- Ensure file size is within limits
- Check MIME type is allowed

### E2E Test Flakiness
- Add proper wait conditions
- Use data-testid for reliable selectors
- Increase timeouts for slow operations
- Run tests in headed mode for debugging

### Vercel Deployment Issues
- Check build logs for errors
- Verify environment variables are set in Vercel
- Check function timeout limits
- Ensure API routes are in correct directory
