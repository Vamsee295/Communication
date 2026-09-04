# MILESTONE 1 — MEDIA ATTACHMENTS

## Status

**MEDIA ATTACHMENTS IMPLEMENTED**

## Implementation summary

Private images (`jpeg`, `png`, `webp`, `gif`) and documents (`pdf`, `txt`) can be selected in the existing composer, uploaded directly to R2, and sent with or without text. Up to ten files may be sent in one message.

## R2 architecture and deployment

The Worker target is Nitro's generated `cloudflare-module` deployment. [`vite.config.ts`](vite.config.ts) declares `R2_ATTACHMENTS` for the private `ghostline-attachments-prod` bucket; each build regenerates the matching `.output/server/wrangler.json` binding. Do not edit generated output.

Direct transfers use five-minute S3-compatible presigned PUT, GET, HEAD, and DELETE URLs. `R2_ACCOUNT_ID` is non-secret. `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` must be Worker secrets, scoped only to this bucket. Neither is a `VITE_*` value.

## Database changes

`attachments` holds metadata, server-generated `storage_key`, lifecycle state, conversation, uploader, and optional message relation. The file bytes never enter Neon. Apply [`scripts/milestone-1-media-attachments.sql`](scripts/milestone-1-media-attachments.sql) to the production Neon database before deployment. It also permits empty message bodies for attachment-only messages.

## Security and lifecycle

The backend authenticates with the existing Supabase middleware and verifies conversation membership before upload authorization, confirmation, access, or send. Object keys are server generated. Type, extension, filename, count, and configurable size are validated. Confirmation HEADs R2 and validates the uploaded size/content type before accepting it. Download URLs are resolved from the attachment ID only after membership verification; clients never submit a storage key.

The lifecycle is `pending → uploaded → attached`; failed HEAD validation becomes `failed`. Deleting a message first attempts R2 deletion and always preserves existing database hard-delete behavior if R2 cleanup fails. Unattached uploads remain statused records for operational cleanup rather than untracked objects.

## UI and realtime

The existing composer gained only a paperclip picker, file chips, remove-before-send, upload progress, retry-by-resubmit behavior, image previews, and document cards. List and ID-based message reads attach attachment metadata, so the existing message fetch/realtime refresh path carries attachments without adding another transport.

## Required infrastructure configuration

Create the private bucket and Worker secrets outside this repository. Configure R2 CORS with the actual deployed Ghostline frontend origin and actual local development origin, allowing only `PUT`, `GET`, `HEAD`, and `DELETE` plus `Content-Type`; do not use a wildcard origin. This repository contains no production domain, so no domain was invented or configured.

## Verification

- `npx tsc --noEmit` — pass
- `npm test` — pass (125 tests)
- `npm run lint` — pass with 12 pre-existing warnings
- `npm run build` — pass; generated Wrangler output contains `R2_ATTACHMENTS`

## Manual verification

1. Apply the Neon SQL migration and configure the R2 bucket/secrets/CORS.
2. Send text-only, image-only, document-only, and mixed messages.
3. Verify recipients can preview/open attachments.
4. Verify a non-member cannot issue upload or download URLs.
5. Delete an attachment message and check its R2 object is removed.

## Known limitations

R2 CORS is account infrastructure and requires the real deployment origins. Direct-transfer validation cannot inspect file magic bytes before the browser uploads; the server enforces the signed MIME type, extension, and object HEAD metadata. A periodic cleanup job for abandoned `pending`/`uploaded` records is intentionally not introduced in this milestone.
