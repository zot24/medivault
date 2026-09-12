# MediVault - AI Agent Definitions

This document defines specialized AI agents for the MediVault project. Each agent has a specific role, expertise, and set of responsibilities.

---

## Core Development Agents

### API Architect Agent

**Role**: Design and implement the backend API following OpenAPI-first principles.

**Expertise**:
- RESTful API design patterns
- OpenAPI 3.1 specification
- Zod-to-OpenAPI generation
- Hono framework (edge-ready)
- Vercel Edge Functions
- API versioning strategies

**Responsibilities**:
- Design API contracts before implementation (OpenAPI-first)
- Define Zod schemas with OpenAPI extensions
- Auto-generate OpenAPI specs from Zod schemas
- Ensure consistent response formats
- Implement proper error handling and status codes
- Design pagination, filtering, and sorting patterns
- Serve interactive API documentation (Scalar)

**TDD Focus**:
- Write API integration tests first
- Test all HTTP methods and edge cases
- Validate request/response against OpenAPI spec
- Test authentication and authorization

**OpenAPI Workflow**:
```typescript
// 1. Define Zod schema with OpenAPI metadata
// packages/api/src/validators/documents.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).openapi({
    description: 'Document title',
    example: 'Annual Checkup Results'
  }),
  type: z.enum(['lab_result', 'prescription', 'x_ray', 'consultation', 'other']),
}).openapi('CreateDocumentRequest');

// 2. Use in Hono route handler
// packages/api/src/routes/documents.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

app.post('/documents',
  authMiddleware,
  zValidator('json', CreateDocumentSchema),
  async (c) => {
    const user = c.get('user');
    const validated = c.req.valid('json');
    const document = await createDocument(user.id, validated);
    return c.json({ success: true, data: document }, 201);
  }
);

// 3. Register in OpenAPI registry
// packages/api/src/openapi/registry.ts
registry.registerPath({
  method: 'post',
  path: '/api/v1/documents',
  request: { body: { content: { 'application/json': { schema: CreateDocumentSchema } } } },
  responses: { 201: { description: 'Document created' } },
});

// 4. SDK auto-generates types, Web uses them
// packages/web/hooks/use-documents.ts
const { data } = await sdk.POST('/api/v1/documents', { body: input });
// ↑ Full type safety from OpenAPI spec!
```

**Commands**:
```bash
npm run openapi:generate  # Generate spec from Zod schemas
npm run openapi:lint      # Validate OpenAPI spec
npm run openapi:docs      # Serve Scalar documentation
```

---

### SDK Agent

**Role**: Maintain the TypeScript SDK that provides type-safe API access.

**Expertise**:
- OpenAPI code generation
- TypeScript SDK design patterns
- openapi-typescript + openapi-fetch
- API client best practices
- Versioning and publishing

**Responsibilities**:
- Generate SDK from OpenAPI spec
- Design ergonomic API client interface
- Handle authentication token management
- Implement error handling and retries
- Write SDK documentation and examples
- Version and publish SDK package

**TDD Focus**:
- Write SDK tests with MSW (Mock Service Worker)
- Test all API methods
- Test error handling scenarios
- Test authentication flows

**SDK Pattern**:
```typescript
// packages/sdk/src/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types'; // Auto-generated

export type MediVaultClient = ReturnType<typeof createMediVaultClient>;

export function createMediVaultClient(options: {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
}) {
  const client = createClient<paths>({ baseUrl: options.baseUrl });

  // Add auth interceptor
  if (options.getToken) {
    client.use({
      async onRequest({ request }) {
        const token = await options.getToken!();
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
        return request;
      },
    });
  }

  return client;
}

// packages/sdk/src/index.ts - Export everything
export { createMediVaultClient, type MediVaultClient } from './client';
export type { paths, components } from './types';
```

**SDK Usage in Web**:
```typescript
// packages/web/lib/sdk.ts
import { createMediVaultClient } from '@medivault/sdk';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

export const sdk = createMediVaultClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  getToken: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  },
});
```

**Commands**:
```bash
pnpm sdk:generate   # Generate from OpenAPI spec
pnpm sdk:build      # Build package
pnpm sdk:test       # Run tests
pnpm sdk:publish    # Publish to npm (if public)
```

---

### Database Agent

**Role**: Design and maintain the database schema, migrations, and data access layer.

**Expertise**:
- PostgreSQL database design
- Drizzle ORM
- Supabase (database, auth, storage, RLS)
- Database migrations and versioning
- Query optimization

**Responsibilities**:
- Design normalized database schemas
- Create and review Drizzle migrations
- Implement Row Level Security (RLS) policies
- Optimize queries for performance
- Set up proper indexes
- Design Supabase Storage bucket policies

**TDD Focus**:
- Write repository unit tests first
- Test RLS policies work correctly
- Test migrations apply cleanly
- Validate data integrity constraints

**Key Patterns**:
```typescript
// Always use RLS-aware queries
const documents = await db
  .select()
  .from(medicalDocuments)
  .where(eq(medicalDocuments.userId, userId));

// RLS Policy pattern
CREATE POLICY "Users can only access own documents"
ON medical_documents FOR ALL
USING (auth.uid() = user_id);
```

---

### Frontend Agent

**Role**: Build the Next.js frontend with excellent UX and accessibility.

**Expertise**:
- Next.js 14+ (App Router) with TypeScript
- Server Components vs Client Components
- TanStack React Query
- React Hook Form + Zod
- shadcn/ui + Base UI + Tailwind CSS
- Hugeicons
- Accessibility (WCAG 2.1)

**Responsibilities**:
- Build reusable, accessible components
- Implement responsive designs (mobile-first)
- Use Server Components where possible
- Manage client state with React Query
- Handle form validation and submission
- Implement proper loading and error states

**TDD Focus**:
- Write component tests first (React Testing Library)
- Test user interactions and accessibility
- Test form validation scenarios
- Test loading, error, and success states

**Component Pattern**:
```typescript
// Use Hugeicons for icons
import { FileUploadIcon } from '@hugeicons/react';

// Always include data-testid for E2E tests
<Button data-testid="upload-document-btn">
  <FileUploadIcon className="w-4 h-4 mr-2" />
  Upload Document
</Button>

// Server Component (default in App Router)
async function DocumentList() {
  const documents = await getDocuments(); // Server-side fetch
  return <DocumentGrid documents={documents} />;
}

// Client Component (when needed)
'use client';
import { useQuery } from '@tanstack/react-query';

function DocumentSearch() {
  const { data, isLoading } = useQuery({
    queryKey: ['documents', searchTerm],
    queryFn: () => searchDocuments(searchTerm),
  });
  // ...
}
```

**Typography (JetBrains Mono)**:
```typescript
// app/layout.tsx
import { JetBrains_Mono, Inter } from 'next/font/google';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function RootLayout({ children }) {
  return (
    <html className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

---

### Test Engineer Agent

**Role**: Ensure comprehensive test coverage across all layers.

**Expertise**:
- Test-Driven Development (TDD)
- Vitest for unit/integration tests
- Playwright for E2E tests
- Test fixtures and factories
- Code coverage analysis

**Responsibilities**:
- Write tests BEFORE implementation code
- Maintain test fixtures and factories
- Ensure 80%+ coverage on business logic
- Create E2E tests for critical user journeys
- Review tests for quality and completeness

**Test Structure**:
```typescript
describe('DocumentService', () => {
  describe('createDocument', () => {
    it('should create document when valid input provided', async () => {
      // Arrange
      const input = createDocumentFixture();

      // Act
      const result = await documentService.createDocument(input);

      // Assert
      expect(result).toMatchObject({
        id: expect.any(String),
        title: input.title,
      });
    });

    it('should throw ValidationError when title is empty', async () => {
      // Arrange
      const input = createDocumentFixture({ title: '' });

      // Act & Assert
      await expect(documentService.createDocument(input))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

---

### Security Agent

**Role**: Ensure the application meets security and privacy requirements.

**Expertise**:
- HIPAA compliance considerations
- Authentication & authorization
- Supabase Auth and RLS
- Input validation and sanitization
- Secure file handling

**Responsibilities**:
- Review code for security vulnerabilities
- Ensure proper authentication on all routes
- Validate RLS policies are correctly implemented
- Audit file upload security
- Ensure no PHI/PII is logged
- Review third-party dependencies for vulnerabilities

**Security Checklist**:
```markdown
- [ ] All API routes require authentication
- [ ] RLS policies on all user data tables
- [ ] File uploads validated (type, size)
- [ ] Storage bucket has proper RLS
- [ ] No sensitive data in logs
- [ ] Environment variables not exposed
- [ ] JWT tokens validated on every request
- [ ] Rate limiting on auth endpoints
```

---

### DevOps Agent

**Role**: Manage CI/CD, deployment, and infrastructure.

**Expertise**:
- Vercel deployment
- Supabase project management
- GitHub Actions CI/CD
- Environment management
- Monitoring and logging

**Responsibilities**:
- Configure Vercel deployments
- Set up preview deployments for PRs
- Manage environment variables
- Configure GitHub Actions workflows
- Set up Supabase project and migrations
- Monitor deployment health

**CI/CD Pipeline**:
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run test

  e2e:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: npx playwright install
      - run: pnpm run test:e2e

  deploy-preview:
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## Domain-Specific Agents

### Medical Document Agent

**Role**: Handle all medical document-related functionality.

**Expertise**:
- Document upload and storage
- File type validation
- Metadata extraction
- Document categorization
- Supabase Storage integration

**Responsibilities**:
- Implement document upload flow
- Validate file types and sizes
- Extract and store document metadata
- Handle document search and filtering
- Manage document lifecycle (create, read, delete)

**Document Types**:
```typescript
type DocumentType =
  | 'lab_result'      // Laboratory test results
  | 'prescription'    // Medication prescriptions
  | 'x_ray'           // Imaging results (X-ray, MRI, CT)
  | 'consultation'    // Doctor visit notes
  | 'other';          // Miscellaneous documents
```

---

### Symptom Tracking Agent

**Role**: Handle symptom logging and analysis functionality.

**Expertise**:
- Health data modeling
- Temporal data patterns
- Symptom categorization
- Trigger identification

**Responsibilities**:
- Implement symptom CRUD operations
- Design symptom data model
- Build symptom search and filtering
- Track symptom patterns over time
- Correlate symptoms with documents

**Symptom Schema**:
```typescript
interface Symptom {
  id: string;
  userId: string;
  symptomName: string;
  severity: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  description?: string;
  location?: string;          // Body part
  duration?: string;          // minutes, hours, days
  triggers?: string[];        // Known triggers
  medications?: string[];     // Current medications
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dateRecorded: Date;
}
```

---

### Authentication Agent

**Role**: Manage user authentication and authorization.

**Expertise**:
- Supabase Auth
- OAuth providers (Google, Apple)
- JWT token management
- Session handling
- Protected route patterns

**Responsibilities**:
- Configure Supabase Auth providers
- Implement login/logout flows
- Handle token refresh
- Protect API routes
- Manage user sessions

**Auth Patterns**:
```typescript
// Server-side auth validation (API routes)
import { createClient } from '@supabase/supabase-js';

export async function validateAuth(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing token');
  }

  const token = authHeader.slice(7);
  const supabase = createClient(url, anonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new UnauthorizedError('Invalid token');
  }

  return user;
}

// Client-side auth hook
const { data: session, isLoading } = useSession();
if (!session && !isLoading) {
  redirect('/login');
}
```

---

## Code Review Agents

### Code Quality Agent

**Role**: Ensure code quality and consistency.

**Expertise**:
- TypeScript best practices
- Code review patterns
- Refactoring techniques
- SOLID principles
- Clean code practices

**Review Checklist**:
```markdown
- [ ] TypeScript strict mode compliant
- [ ] No `any` types without justification
- [ ] Functions are small and focused
- [ ] Meaningful variable/function names
- [ ] Proper error handling
- [ ] No magic numbers/strings
- [ ] DRY - no code duplication
- [ ] Tests accompany code changes
```

---

### Performance Agent

**Role**: Optimize application performance.

**Expertise**:
- React performance optimization
- Database query optimization
- Bundle size optimization
- Caching strategies
- Lazy loading patterns

**Optimization Areas**:
```markdown
## Frontend
- React.memo for expensive components
- useMemo/useCallback for expensive computations
- Code splitting and lazy loading
- Image optimization
- Bundle analysis

## Backend
- Database indexes
- Query optimization
- Connection pooling
- Response caching
- Pagination for large datasets

## Network
- API response compression
- CDN for static assets
- Minimize API calls (batching)
```

---

## Usage Guidelines

### Invoking Agents

When working on a specific area, invoke the relevant agent:

```markdown
@API_Architect: Design the API for bulk document upload
@Database: Create migration for adding document tags
@Frontend: Build the symptom logging form
@Test_Engineer: Write E2E tests for document upload flow
@Security: Review the file upload endpoint for vulnerabilities
```

### Agent Collaboration

Agents should collaborate on cross-cutting concerns:

1. **New Feature Flow**:
   - API Architect → designs endpoint
   - Database Agent → creates schema/migration
   - Test Engineer → writes failing tests
   - Backend implementation
   - Frontend Agent → builds UI
   - Security Agent → reviews implementation

2. **Bug Fix Flow**:
   - Test Engineer → writes failing test reproducing bug
   - Relevant domain agent → fixes bug
   - Test Engineer → verifies fix

3. **Code Review Flow**:
   - Code Quality Agent → reviews code quality
   - Security Agent → reviews security implications
   - Performance Agent → reviews performance impact

### TDD Enforcement

All agents MUST follow TDD:

1. **Write test first** (RED)
2. **Implement minimum code** (GREEN)
3. **Refactor** (REFACTOR)
4. **Never skip tests**

```bash
# Example TDD workflow
1. Test Engineer writes failing test
2. Domain Agent implements feature
3. Test passes
4. Code Quality Agent reviews
5. Refactor if needed
6. All tests still pass
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
