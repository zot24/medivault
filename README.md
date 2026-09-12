# MediVault

MediVault is a patient-controlled health history. You store documents and symptoms in one place you own. The record does not live in a hospital system you cannot take with you.

## What is on main

`main` includes:

- Durable files in Supabase Storage. The API serves a download only after it checks that the signed-in user owns the file.
- Expiring share links at `/s/:token`. Each link lasts 1h, 24h, or 7d. You can revoke a link.
- Case bundles that put more than one file in one share packet.
- A DICOM CT viewer spike. `dicom-parser` draws uncompressed 16-bit frames on a canvas.

## Stack

The web app is Vite and React. The API is Express. Postgres is Neon through Drizzle. File bytes live in Supabase Storage. `@medivault/sdk` is the TypeScript client. `packages/mobile` is an Expo app.

## Run it locally

1. Install dependencies.

```bash
pnpm install
```

2. Build the SDK. `@medivault/sdk` resolves to `packages/sdk/dist`, so this step is required.

```bash
pnpm build:sdk
```

3. Start local Supabase. Copy values from `supabase status` into `.env`.

```bash
supabase start
```

Set these variables in `.env`:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=medical-files`

4. Push the schema and load the demo user.

```bash
pnpm db:push
pnpm db:seed
```

5. Start the app. Port 3000 is often taken, so use 3002.

```bash
PORT=3002 pnpm dev
```

6. Sign in with email `demo@medivault.app` and password `demo123`.

## Test share links

Open Documents. Use **Share** or **Share case**. Copy the `/s/:token` path. Open that path.

## Test DICOM

Upload `.dcm` files. A multi-select of `.dcm` files becomes one series.

Patient CD slices often have no extension. Before you upload a slice with no extension, rename it to `.dcm`.

Many clinical CTs use JPEG-lossless transfer syntax `1.2.840.10008.1.2.4.70`. The current spike renders uncompressed 16-bit frames only, so those files do not draw.

The mini fixtures in `shared/fixtures/` do render.

## Mobile

The Expo app lives in `packages/mobile`. Set `EXPO_PUBLIC_API_URL` to the API on your LAN, for example `http://192.168.x.x:3002`. Then run `pnpm dev:mobile` or `expo start`.

Share links and the DICOM viewer are web-first. The mobile app has login, documents, and symptoms. It does not have share links or the DICOM viewer.

## Backlog

Open work lives in [GitHub Issues](https://github.com/zot24/medivault/issues). Issues 6 through 17 are the current backlog.
