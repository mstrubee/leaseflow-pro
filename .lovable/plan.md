

# Fix: Patent files not uploading to Google Drive

## Problem

There are two distinct issues preventing patent files from appearing in Google Drive:

### Issue 1 — Legacy storage:// URLs never migrated
58 out of 85 patent documents have `storage://` URLs in `document_url` instead of Drive URLs. These were saved by an older version of the upload flow that stored the Supabase Storage URL directly without transferring to Drive.

### Issue 2 — Retry does not update the database
When the retry button in `PatentFileListPopover` successfully uploads a file to Drive, it only updates the **local UI state** — it never updates the `document_url` in `patent_documents` from the `storage://` URL to the new Drive URL. So even after a successful retry, the next time the user opens the popover, the file still shows as "missing".

Additionally, the popover lacks a callback to propagate the new Drive URL back to the parent component (`PatentChecklist`).

## Plan

### Step 1 — Add `onUrlUpdated` callback to `PatentFileListPopover`

Add a new prop `onUrlUpdated(index: number, newUrl: string)` to the popover component. After a successful retry upload, call this callback so the parent can update the `document_url` in the database, replacing the `storage://` URL segment with the new Drive URL.

### Step 2 — Wire the callback in `PatentChecklist`

In `PatentChecklist.tsx`, pass `onUrlUpdated` to `PatentFileListPopover`. The handler should:
1. Replace the URL at the given index in the `|||`-delimited string
2. Call `onUpdateDocument(contract.id, item.id, { document_url: newJoinedUrl })`

This ensures the DB is updated when a retry succeeds.

### Step 3 — Add batch migration action to the edge function

Add a new action `syncPendingPatentFiles` to the `google-drive` edge function that:
1. Queries `patent_documents` where `document_url LIKE 'storage://%'`
2. For each entry, splits by `|||` and processes each `storage://` segment
3. Downloads from Supabase Storage, uploads to Drive (into the contract's "Rentas y Patentes" folder)
4. Updates the `document_url` with the new Drive URL
5. Cleans up the storage file
6. Skips files that no longer exist in storage (logs a warning)

This action will resolve all 58 legacy records in one batch.

### Step 4 — Add "Sync Pending Patent Files" button in admin panel

Add a button in the existing storage/sync section of the admin panel that triggers the `syncPendingPatentFiles` action, similar to existing sync buttons.

## Technical details

**Files to modify:**
- `src/components/patents/PatentFileListPopover.tsx` — add `onUrlUpdated` prop and call it after successful retry
- `src/components/patents/PatentChecklist.tsx` — pass `onUrlUpdated` handler to the popover (both for regular and shared items)
- `supabase/functions/google-drive/index.ts` — add `syncPendingPatentFiles` action
- `src/components/admin/StorageMonitor.tsx` (or equivalent admin component) — add sync button

