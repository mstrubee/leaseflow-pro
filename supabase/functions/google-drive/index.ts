import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getCorsHeaders(_req: Request): Record<string, string> {
  return corsHeaders;
}

// ─── OAuth Token Management ───────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Get an access token using OAuth2 refresh token flow.
 * Falls back to service account JWT if OAuth credentials are not configured.
 */
async function getAccessToken(): Promise<string> {
  let clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  let clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  let refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN');

  // Try to load overrides from cloud_storage_connections config
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: conn } = await supabase
      .from('cloud_storage_connections')
      .select('id, config')
      .eq('provider', 'google_drive')
      .limit(1)
      .single();

    if (conn) {
      const dbConfig = (conn.config as Record<string, string>) || {};
      if (dbConfig.client_id) clientId = dbConfig.client_id;
      if (dbConfig.client_secret) clientSecret = dbConfig.client_secret;

      // Always prefer DB token when available (avoids stale env refresh tokens)
      const { data: tokenRow } = await supabase
        .from('cloud_storage_tokens')
        .select('refresh_token')
        .eq('connection_id', conn.id)
        .single();

      if (tokenRow?.refresh_token) {
        refreshToken = tokenRow.refresh_token;
        console.log("Loaded OAuth refresh token from cloud_storage_tokens");
      }
    }
  } catch (e) {
    console.warn("Failed to load config from DB:", e);
  }

  if (clientId && clientSecret && refreshToken) {
    try {
      return await getAccessTokenFromOAuth(clientId, clientSecret, refreshToken);
    } catch (oauthError) {
      const message = oauthError instanceof Error ? oauthError.message : String(oauthError);
      const canFallbackToServiceAccount = /deleted client|deleted_client|invalid_client|invalid_grant|unauthorized_client/i.test(message);

      if (!canFallbackToServiceAccount) {
        throw oauthError;
      }

      console.warn("OAuth refresh failed, trying service account fallback:", message);
    }
  }

  // Fallback: service account
  const serviceAccountKeyStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (serviceAccountKeyStr) {
    const credentials = JSON.parse(serviceAccountKeyStr);
    return getAccessTokenFromServiceAccount(credentials);
  }

  throw new Error("No Google credentials configured (OAuth or Service Account)");
}

async function getAccessTokenFromOAuth(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();

  if (!data.access_token) {
    console.error("OAuth token refresh failed:", JSON.stringify(data));
    throw new Error(`OAuth token refresh failed: ${data.error_description || data.error || 'unknown'}`);
  }

  console.log("OAuth access token obtained successfully");
  return data.access_token;
}

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

async function getAccessTokenFromServiceAccount(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: credentials.token_uri,
    iat: now,
    exp: exp,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signatureInput = `${headerB64}.${payloadB64}`;

  const privateKeyPem = credentials.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signatureInput));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signatureInput}.${signatureB64}`;

  const tokenResponse = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    console.error("Service account token exchange failed");
    throw new Error("Failed to get access token from Google (service account)");
  }

  return tokenData.access_token;
}

// ─── OAuth Authorization Flow (one-time setup) ───────────────────────────────

function buildOAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();

  if (!data.access_token) {
    console.error("Code exchange failed:", JSON.stringify(data));
    throw new Error(`Code exchange failed: ${data.error_description || data.error || 'unknown'}`);
  }

  if (!data.refresh_token) {
    throw new Error("No refresh token returned. Make sure prompt=consent and access_type=offline.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

// ─── Drive Helpers (unchanged) ────────────────────────────────────────────────

function sanitizeDriveName(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  return name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/'/g, '_')
    .replace(/\\/g, '_')
    .trim()
    .substring(0, 255) || 'unnamed';
}

async function createDriveFolder(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  const sanitizedName = sanitizeDriveName(name);
  const metadata: any = {
    name: sanitizedName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Folder creation failed:", response.status, errorText);
    throw new Error(`Failed to create folder: ${response.status}`);
  }
  return await response.json();
}

function sanitizeForDriveQuery(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'").substring(0, 255);
}

function normalizeDriveNameKey(name: string): string {
  return sanitizeDriveName(name).trim().toLowerCase();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractRepositoryStoragePath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  const normalized = rawUrl.trim().replace(/^storage:\/\/storage:\/\//i, 'storage://');

  if (normalized.startsWith('storage://')) {
    if (!normalized.startsWith('storage://repository-files/')) return null;
    return safeDecodeURIComponent(normalized.replace('storage://repository-files/', ''));
  }

  const publicMatch = normalized.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/repository-files\/([^?]+)/i);
  if (publicMatch?.[1]) {
    return safeDecodeURIComponent(publicMatch[1]);
  }

  return null;
}

function extractContractIdFromRepositoryPath(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const normalized = storagePath.trim();
  const contractPrefixMatch = normalized.match(/^contracts\/([0-9a-fA-F-]{36})\//);
  if (contractPrefixMatch?.[1]) return contractPrefixMatch[1].toLowerCase();

  // Legacy paths may start directly with the contract UUID: <contractId>/<itemId>/<file>
  const legacyMatch = normalized.match(/^([0-9a-fA-F-]{36})\//);
  return legacyMatch?.[1]?.toLowerCase() || null;
}

async function trashDriveItem(accessToken: string, itemId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${itemId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trashed: true }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.warn(`Failed to trash duplicate folder ${itemId}: ${response.status} ${errorText}`);
  }
}

async function getFolderByName(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string } | null> {
  if (parentId) {
    const siblings = await listChildFolders(accessToken, parentId);
    return siblings[normalizeDriveNameKey(name)] || null;
  }

  const normalizedName = sanitizeDriveName(name);
  const sanitizedName = sanitizeForDriveQuery(normalizedName);
  const query = `name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Folder search failed:", response.status, errorText);
    throw new Error(`Failed to search folder: ${response.status}`);
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

async function getFolderById(
  accessToken: string,
  folderId: string,
): Promise<{ id: string; name: string; parents?: string[]; webViewLink: string; trashed?: boolean; mimeType?: string } | null> {
  if (!folderId) return null;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents,webViewLink,trashed,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Folder get-by-id failed:", response.status, errorText);
    throw new Error(`Failed to get folder by id: ${response.status}`);
  }
  return await response.json();
}

function looksLikeOAuthClientId(value: string | null | undefined): boolean {
  return !!value && value.includes(".apps.googleusercontent.com");
}

async function getSharedDriveById(
  accessToken: string,
  driveId: string,
): Promise<{ id: string; name: string; webViewLink: string } | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/drives/${driveId}?fields=id,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error(`getSharedDriveById failed for ${driveId}: ${response.status} ${errText}`);
    return null;
  }
  const data = await response.json();
  console.log(`getSharedDriveById success: ${data.id} - ${data.name}`);
  return {
    id: data.id,
    name: data.name || "Shared Drive",
    webViewLink: `https://drive.google.com/drive/folders/${data.id}`,
  };
}

function extractDriveId(value: string): string {
  // If value is a full Drive URL, extract the folder/drive ID
  const urlMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  const driveMatch = value.match(/\/drive\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return driveMatch[1];
  return value;
}

async function resolveRootFolder(
  accessToken: string,
): Promise<{ id: string; name: string; webViewLink: string; source: string }> {
  let rawRootId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')?.trim() || "";

  // Try DB config override
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data: conn } = await sb
      .from('cloud_storage_connections')
      .select('config')
      .eq('provider', 'google_drive')
      .limit(1)
      .single();
    const dbConfig = (conn?.config as Record<string, string>) || {};
    if (dbConfig.root_folder_id) rawRootId = dbConfig.root_folder_id.trim();
  } catch {}

  const rawSharedDriveId = Deno.env.get('GOOGLE_DRIVE_SHARED_DRIVE_ID')?.trim() || "";
  const configuredRootId = extractDriveId(rawRootId);
  const configuredSharedDriveId = extractDriveId(rawSharedDriveId);
  console.log("resolveRootFolder: configuredRootId =", configuredRootId);

  const candidates: Array<{ id: string; source: string }> = [];

  if (configuredRootId && !looksLikeOAuthClientId(configuredRootId)) {
    candidates.push({ id: configuredRootId, source: 'GOOGLE_DRIVE_ROOT_FOLDER_ID' });
  } else if (configuredRootId) {
    console.error("GOOGLE_DRIVE_ROOT_FOLDER_ID appears misconfigured: it looks like an OAuth client ID");
  }

  if (configuredSharedDriveId && configuredSharedDriveId !== configuredRootId) {
    candidates.push({ id: configuredSharedDriveId, source: 'GOOGLE_DRIVE_SHARED_DRIVE_ID' });
  }

  // Final fallback for OAuth-connected personal drives
  candidates.push({ id: 'root', source: 'oauth-root-alias' });

  let lastError = "";

  for (const candidate of candidates) {
    try {
      const folder = await getFolderById(accessToken, candidate.id);
      if (folder) {
        if (folder.mimeType && folder.mimeType !== "application/vnd.google-apps.folder") {
          lastError = `Target is not a folder (${candidate.source})`;
          continue;
        }
        if (folder.trashed) {
          lastError = `Folder is trashed (${candidate.source})`;
          continue;
        }
        return {
          id: folder.id,
          name: folder.name || "Google Drive Root",
          webViewLink: folder.webViewLink || "",
          source: candidate.source,
        };
      }

      // Try as a Shared Drive ID
      if (candidate.id !== 'root') {
        const sharedDrive = await getSharedDriveById(accessToken, candidate.id);
        if (sharedDrive) {
          console.log(`Resolved ${candidate.source} as Shared Drive: ${sharedDrive.name}`);
          return { ...sharedDrive, source: candidate.source };
        }
      }

      lastError = `Folder/Drive not found (${candidate.source})`;
      lastError = `Folder/Drive not found (${candidate.source})`;
      console.warn(`Candidate ${candidate.id} (${candidate.source}) not accessible as file or shared drive`);
    } catch (error: any) {
      lastError = error?.message || String(error);
      console.warn(`Failed drive root candidate (${candidate.source})`, lastError);
    }
  }

  if (configuredRootId && looksLikeOAuthClientId(configuredRootId)) {
    throw new Error(
      "Google Drive root folder is misconfigured: the configured value looks like an OAuth client ID instead of a Drive folder ID.",
    );
  }

  throw new Error(
    `Google Drive root folder is not accessible. Configure GOOGLE_DRIVE_ROOT_FOLDER_ID with a valid folder/shared-drive ID.${lastError ? ` Last error: ${lastError}` : ''}`,
  );
}

async function listChildFolders(
  accessToken: string,
  parentId: string,
): Promise<Record<string, { id: string; webViewLink: string }>> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  for (let i = 0; i < 50; i++) {
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
      `&fields=nextPageToken,files(id,name,webViewLink,createdTime)` +
      `&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Child folder listing failed:", response.status, errorText);
      throw new Error(`Failed to list child folders: ${response.status}`);
    }

    const data: any = await response.json();
    if (Array.isArray(data.files)) allFiles.push(...data.files);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  const folders: Record<string, { id: string; webViewLink: string; createdTime?: string }> = {};
  const duplicates: Array<{ key: string; keptId: string; dupId: string }> = [];

  for (const f of allFiles || []) {
    if (!f?.name || !f?.id) continue;
    const key = normalizeDriveNameKey(f.name);
    const createdTime: string | undefined = f.createdTime;
    const existing = folders[key];
    if (!existing) {
      folders[key] = { id: f.id, webViewLink: f.webViewLink, createdTime };
      continue;
    }

    const shouldKeepCurrent =
      !!createdTime &&
      (!!existing.createdTime ? createdTime < existing.createdTime : true);

    if (shouldKeepCurrent) {
      duplicates.push({ key, keptId: f.id, dupId: existing.id });
      folders[key] = { id: f.id, webViewLink: f.webViewLink, createdTime };
    } else {
      duplicates.push({ key, keptId: existing.id, dupId: f.id });
    }
  }

  if (duplicates.length > 0) {
    console.warn(`Found ${duplicates.length} duplicate folder(s) under parent ${parentId}`, duplicates.slice(0, 25));
    for (const duplicate of duplicates) {
      await trashDriveItem(accessToken, duplicate.dupId);
    }
  }

  return folders;
}

type FolderTemplate = {
  id: string;
  name: string;
  parent_id: string | null;
  display_order: number | null;
};

async function ensureTemplateFolders(
  accessToken: string,
  contractDriveFolderId: string,
  templates: FolderTemplate[],
): Promise<void> {
  const byParent = new Map<string | null, FolderTemplate[]>();
  for (const t of templates) {
    const parentId = t.parent_id ?? null;
    const arr = byParent.get(parentId) ?? [];
    arr.push(t);
    byParent.set(parentId, arr);
  }

  for (const [, arr] of byParent) {
    arr.sort((a, b) => {
      const ao = a.display_order ?? 0;
      const bo = b.display_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }

  const childrenCache = new Map<string, Record<string, { id: string; webViewLink: string }>>();

  async function ensureChildren(parentTemplateId: string | null, parentDriveId: string): Promise<void> {
    const children = byParent.get(parentTemplateId) ?? [];
    if (children.length === 0) return;

    let existing = childrenCache.get(parentDriveId);
    if (!existing) {
      existing = await listChildFolders(accessToken, parentDriveId);
      childrenCache.set(parentDriveId, existing);
    }

    for (const child of children) {
      const driveKey = normalizeDriveNameKey(child.name);
      let folder = existing[driveKey];
      if (!folder) {
        folder = await createDriveFolder(accessToken, child.name, parentDriveId);
        existing[driveKey] = folder;
      }
      await ensureChildren(child.id, folder.id);
    }
  }

  const knownTemplateIds = new Set(templates.map((t) => t.id));
  const danglingRoots = templates.filter((t) => t.parent_id && !knownTemplateIds.has(t.parent_id));
  if (danglingRoots.length > 0) {
    const arr = byParent.get(null) ?? [];
    for (const t of danglingRoots) arr.push({ ...t, parent_id: null });
    byParent.set(null, arr);
  }

  await ensureChildren(null, contractDriveFolderId);
}

async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  fileContent: Uint8Array,
  mimeType: string,
  folderId: string,
): Promise<{ id: string; webViewLink: string; webContentLink: string }> {
  const sanitizedFileName = sanitizeDriveName(fileName);
  const metadata = { name: sanitizedFileName, parents: [folderId] };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const metadataString = JSON.stringify(metadata);
  const metadataBytes = new TextEncoder().encode(
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    metadataString +
    delimiter +
    `Content-Type: ${mimeType}\r\n` +
    "Content-Transfer-Encoding: base64\r\n\r\n",
  );

  // Convert to base64 in chunks to avoid stack overflow for large files
  const chunkSize = 8192;
  let binaryStr = '';
  for (let i = 0; i < fileContent.length; i += chunkSize) {
    const chunk = fileContent.subarray(i, Math.min(i + chunkSize, fileContent.length));
    binaryStr += String.fromCharCode(...chunk);
  }
  const fileBase64 = btoa(binaryStr);
  const fileBytes = new TextEncoder().encode(fileBase64);
  const closeBytes = new TextEncoder().encode(closeDelimiter);

  const requestBody = new Uint8Array(metadataBytes.length + fileBytes.length + closeBytes.length);
  requestBody.set(metadataBytes, 0);
  requestBody.set(fileBytes, metadataBytes.length);
  requestBody.set(closeBytes, metadataBytes.length + fileBytes.length);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?supportsAllDrives=true&uploadType=multipart&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body: requestBody,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("File upload failed:", response.status, errorText);
    console.error("Upload details - folderId:", folderId, "fileName:", sanitizedFileName);
    throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
  }
  return await response.json();
}

/**
 * Delete a file from Supabase Storage after it has been successfully synced to Drive.
 * Silently ignores errors (file may already be deleted or not exist).
 */
async function cleanupStorageFile(sb: any, storageUrl: string): Promise<void> {
  try {
    const storagePath = extractRepositoryStoragePath(storageUrl);
    if (!storagePath) return;
    const { error } = await sb.storage.from('repository-files').remove([storagePath]);
    if (error) {
      console.warn(`Storage cleanup warning for ${storagePath}:`, error.message);
    } else {
      console.log(`Cleaned up storage file: ${storagePath}`);
    }
  } catch (e) {
    // Non-critical - don't fail the sync
    console.warn('Storage cleanup error:', e);
  }
}

async function listFilesInFolder(accessToken: string, folderId: string): Promise<any[]> {
  const query = `'${folderId}' in parents and trashed=false`;
  const allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  for (let i = 0; i < 50; i++) {
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
      `&fields=nextPageToken,files(id,name,mimeType,webViewLink,webContentLink,createdTime,size)` +
      `&orderBy=createdTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("File listing failed:", response.status, errorText);
      throw new Error(`Failed to list files: ${response.status}`);
    }

    const data: any = await response.json();
    if (Array.isArray(data.files)) allFiles.push(...data.files);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return allFiles;
}

async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    console.error("File deletion failed:", response.status);
    throw new Error(`Failed to delete file: ${response.status}`);
  }
}

async function moveToFolder(accessToken: string, fileId: string, newParentId: string, oldParentId?: string): Promise<void> {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&supportsAllDrives=true`;
  if (oldParentId) url += `&removeParents=${oldParentId}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("File move failed:", response.status);
    throw new Error(`Failed to move file: ${response.status}`);
  }
}

function getStatusFolderName(status: string): string {
  switch (status) {
    case 'firmado': return 'Contratos Vigentes';
    case 'en_negociacion': return 'Contratos En Negociación';
    case 'vencido': return 'Contratos Vencidos';
    default: return 'Otros Contratos';
  }
}

function parseDestinationEntries(raw: string): { source: string; name: string }[] {
  if (!raw) return [];
  return raw
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/^(repo|general)::(.+)$/);
      if (match) return { source: match[1], name: match[2].trim() };
      return { source: 'repo', name: trimmed };
    })
    .filter((entry) => entry.name.length > 0);
}

async function ensureDriveFolderForRepositoryFolder(
  sb: any,
  accessToken: string,
  contractId: string,
  folderId: string,
  visited: Set<string> = new Set(),
): Promise<string | null> {
  if (visited.has(folderId)) return null;
  visited.add(folderId);

  const { data: folder } = await sb
    .from('repository_folders')
    .select('id, name, parent_id, drive_folder_id, contract_id')
    .eq('id', folderId)
    .single();

  if (!folder) return null;

  const normalizedRequestedContractId = (contractId || '').toLowerCase();
  const normalizedFolderContractId = (folder.contract_id || '').toLowerCase();
  if (!normalizedFolderContractId || normalizedFolderContractId !== normalizedRequestedContractId) {
    throw new Error(
      `Repository folder ${folderId} does not belong to contract ${contractId}`,
    );
  }

  let parentDriveFolderId: string | null = null;

  if (folder.parent_id) {
    parentDriveFolderId = await ensureDriveFolderForRepositoryFolder(
      sb,
      accessToken,
      contractId,
      folder.parent_id,
      visited,
    );
  } else {
    const { data: contract } = await sb
      .from('contracts')
      .select('drive_folder_id')
        .eq('id', normalizedRequestedContractId)
      .single();
    parentDriveFolderId = contract?.drive_folder_id || null;
  }

  if (!parentDriveFolderId) return null;

  if (folder.drive_folder_id) {
    const meta = await getFolderById(accessToken, folder.drive_folder_id).catch(() => null);
    if (meta && !meta.trashed && meta.mimeType === 'application/vnd.google-apps.folder') {
      const currentParentId = meta.parents?.[0] || null;
      if (currentParentId === parentDriveFolderId) {
        return folder.drive_folder_id;
      }
    }

    await sb.from('repository_folders').update({ drive_folder_id: null }).eq('id', folder.id);
  }

  let driveFolder = await getFolderByName(accessToken, folder.name, parentDriveFolderId);
  if (!driveFolder) {
    driveFolder = await createDriveFolder(accessToken, folder.name, parentDriveFolderId);
  }

  await sb
    .from('repository_folders')
    .update({ drive_folder_id: driveFolder.id })
    .eq('id', folder.id);

  return driveFolder.id;
}

async function listDriveFoldersByNameUnderParent(
  accessToken: string,
  folderName: string,
  parentId: string,
): Promise<Array<{ id: string; name: string; webViewLink?: string; createdTime?: string }>> {
  const sanitizedName = sanitizeForDriveQuery(sanitizeDriveName(folderName));
  const query = `name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc&pageSize=50&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed listing folders by name: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

async function getClaimedDriveFolderIdsByOtherContracts(
  sb: any,
  driveFolderIds: string[],
  contractId: string,
): Promise<Set<string>> {
  const sanitizedIds = Array.from(new Set((driveFolderIds || []).filter(Boolean)));
  if (sanitizedIds.length === 0) return new Set();

  const { data, error } = await sb
    .from('contracts')
    .select('drive_folder_id')
    .in('drive_folder_id', sanitizedIds)
    .neq('id', contractId)
    .is('deleted_at', null);

  if (error) {
    console.warn('Could not verify claimed Drive folders by other contracts:', error.message);
    return new Set();
  }

  return new Set((data || []).map((row: any) => row.drive_folder_id).filter(Boolean));
}

async function pickUnclaimedDriveFolderByName(
  sb: any,
  accessToken: string,
  contractId: string,
  folderName: string,
  parentId: string,
): Promise<{ id: string; webViewLink: string } | null> {
  const candidates = await listDriveFoldersByNameUnderParent(accessToken, folderName, parentId);
  if (!candidates.length) return null;

  const claimed = await getClaimedDriveFolderIdsByOtherContracts(
    sb,
    candidates.map((c) => c.id),
    contractId,
  );

  // Bug 2 fix: validate each unclaimed candidate's actual parent in Drive
  for (const candidate of candidates) {
    if (claimed.has(candidate.id)) continue;

    // Verify the candidate's parent matches the expected parentId
    try {
      const metaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${candidate.id}?fields=parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (metaResp.ok) {
        const meta = await metaResp.json();
        const actualParents: string[] = meta.parents || [];
        if (actualParents.length > 0 && actualParents[0] !== parentId) {
          console.warn(`pickUnclaimed: candidate ${candidate.id} parent ${actualParents[0]} != expected ${parentId}, skipping`);
          continue;
        }
      }
    } catch (e: any) {
      console.warn(`pickUnclaimed: could not verify parent for ${candidate.id}: ${e.message}`);
      continue;
    }

    return {
      id: candidate.id,
      webViewLink: candidate.webViewLink || `https://drive.google.com/drive/folders/${candidate.id}`,
    };
  }

  return null;
}

async function ensureStatusFolders(accessToken: string, rootFolderId: string): Promise<Record<string, { id: string; webViewLink: string }>> {
  const statusFolders: Record<string, { id: string; webViewLink: string }> = {};
  const folderNames = ['Contratos Vigentes', 'Contratos En Negociación', 'Contratos Vencidos'];

  for (const name of folderNames) {
    let folder = await getFolderByName(accessToken, name, rootFolderId);
    if (!folder) folder = await createDriveFolder(accessToken, name, rootFolderId);
    statusFolders[name] = folder;
  }
  return statusFolders;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    console.log(`Processing action: ${action}`);

    // ── OAuth setup actions (don't need Drive access token) ──────────────

    if (action === "getOAuthUrl") {
      let clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');

      // Check DB config override
      try {
        const sbUrl = Deno.env.get('SUPABASE_URL')!;
        const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(sbUrl, sbKey);
        const { data: conn } = await sb.from('cloud_storage_connections').select('config').eq('provider', 'google_drive').limit(1).single();
        const dbConfig = (conn?.config as Record<string, string>) || {};
        if (dbConfig.client_id) clientId = dbConfig.client_id;
      } catch {}

      if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID no está configurado");

      const { redirectUri } = params;
      if (!redirectUri) throw new Error("redirectUri es requerido");

      const url = buildOAuthUrl(clientId, redirectUri);
      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "oauthCallback") {
      let clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      let clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

      // Check DB config override
      try {
        const sbUrl = Deno.env.get('SUPABASE_URL')!;
        const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(sbUrl, sbKey);
        const { data: conn } = await sb.from('cloud_storage_connections').select('config').eq('provider', 'google_drive').limit(1).single();
        const dbConfig = (conn?.config as Record<string, string>) || {};
        if (dbConfig.client_id) clientId = dbConfig.client_id;
        if (dbConfig.client_secret) clientSecret = dbConfig.client_secret;
      } catch {}

      if (!clientId || !clientSecret) throw new Error("OAuth credentials not configured");

      const { code, redirectUri } = params;
      if (!code || !redirectUri) throw new Error("code and redirectUri are required");

      const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);

      // Store the refresh token as a Supabase secret via the DB
      // We'll store it in the cloud_storage_tokens table for now
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Store in a known location - use 'google_drive' as connection identifier
      const { data: existingConn } = await supabase
        .from('cloud_storage_connections')
        .select('id')
        .eq('provider', 'google_drive')
        .limit(1)
        .single();

      let connectionId: string;

      if (existingConn) {
        connectionId = existingConn.id;
      } else {
        const { data: newConn, error: connError } = await supabase
          .from('cloud_storage_connections')
          .insert({ provider: 'google_drive', name: 'Google Drive OAuth', is_active: true })
          .select('id')
          .single();
        if (connError) throw connError;
        connectionId = newConn!.id;
      }

      // Upsert tokens
      await supabase
        .from('cloud_storage_tokens')
        .upsert({
          connection_id: connectionId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        }, { onConflict: 'connection_id' });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Google Drive OAuth conectado exitosamente. El refresh token ha sido almacenado.",
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "getCredentials") {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sbAdmin = createClient(supabaseUrl, supabaseKey);

      // Try to load overrides from DB
      const { data: conn } = await sbAdmin
        .from('cloud_storage_connections')
        .select('config')
        .eq('provider', 'google_drive')
        .limit(1)
        .single();

      const dbConfig = (conn?.config as Record<string, string>) || {};
      const clientId = dbConfig.client_id || Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') || '';
      const clientSecret = dbConfig.client_secret || Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') || '';
      const rootFolderId = dbConfig.root_folder_id || Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID') || '';

      const mask = (val: string) => {
        if (!val) return '';
        if (val.length <= 8) return '••••••••';
        return val.substring(0, 4) + '••••' + val.substring(val.length - 4);
      };

      return new Response(JSON.stringify({
        clientId: mask(clientId),
        clientIdFull: clientId,
        clientSecret: mask(clientSecret),
        clientSecretFull: clientSecret,
        rootFolderId: rootFolderId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "updateCredentials") {
      const { clientId: newClientId, clientSecret: newClientSecret, rootFolderId: newRootFolderId } = params;
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sbAdmin = createClient(supabaseUrl, supabaseKey);

      // Get or create the google_drive_oauth connection
      let { data: conn } = await sbAdmin
        .from('cloud_storage_connections')
        .select('id, config')
        .eq('provider', 'google_drive')
        .limit(1)
        .single();

      if (!conn) {
        const { data: newConn, error: createErr } = await sbAdmin
          .from('cloud_storage_connections')
          .insert({ name: 'Google Drive OAuth', provider: 'google_drive', is_active: true, config: {} })
          .select('id, config')
          .single();
        if (createErr) throw createErr;
        conn = newConn;
      }

      const existingConfig = (conn?.config as Record<string, string>) || {};
      const updatedConfig: Record<string, string> = { ...existingConfig };

      if (typeof newClientId === 'string') updatedConfig.client_id = newClientId.trim();
      if (typeof newClientSecret === 'string') updatedConfig.client_secret = newClientSecret.trim();
      if (typeof newRootFolderId === 'string') updatedConfig.root_folder_id = newRootFolderId.trim();

      const { error: updateErr } = await sbAdmin
        .from('cloud_storage_connections')
        .update({ config: updatedConfig, updated_at: new Date().toISOString() })
        .eq('id', conn!.id);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Credenciales actualizadas correctamente.",
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "checkOAuthStatus") {
      let clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      let clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: conn } = await supabase
        .from('cloud_storage_connections')
        .select('id, config')
        .eq('provider', 'google_drive')
        .limit(1)
        .single();

      // Override with DB config if available
      if (conn) {
        const dbConfig = (conn.config as Record<string, string>) || {};
        if (dbConfig.client_id) clientId = dbConfig.client_id;
        if (dbConfig.client_secret) clientSecret = dbConfig.client_secret;
      }

      let hasRefreshToken = false;
      if (conn) {
        const { data: tokenData } = await supabase
          .from('cloud_storage_tokens')
          .select('refresh_token')
          .eq('connection_id', conn.id)
          .single();
        hasRefreshToken = !!(tokenData?.refresh_token);
      }

      return new Response(JSON.stringify({
        hasClientCredentials: !!(clientId && clientSecret),
        hasRefreshToken,
        isConnected: !!(clientId && clientSecret && hasRefreshToken),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── All other actions need Drive access ──────────────────────────────

    // Always resolve OAuth credentials and tokens via getAccessToken(),
    // which prioritizes cloud_storage_connections.config over env secrets.
    const accessToken = await getAccessToken();

    const actionsRequiringRootFolder = new Set([
      'ensureStatusFolders',
      'syncAllContracts',
      'syncSingleContract',
      'ensureProjectStructure',
      'syncGeneralFolders',
      'testConnection',
    ]);

    const rootFolderMeta = actionsRequiringRootFolder.has(action)
      ? await resolveRootFolder(accessToken)
      : null;
    const rootFolderId = rootFolderMeta?.id ?? "";

    let result: any;

    switch (action) {
      case "ensureStatusFolders": {
        const statusFolders = await ensureStatusFolders(accessToken, rootFolderId);
        result = { statusFolders };
        break;
      }

      case "syncAllContracts": {
        const { offset = 0, limit = 1 } = params as { offset?: number; limit?: number };
        const safeOffset = Math.max(0, Number(offset) || 0);
        const safeLimit = Math.min(3, Math.max(1, Number(limit) || 1));

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const statusFolders = await ensureStatusFolders(accessToken, rootFolderId);
        console.log("Status folders ready:", Object.keys(statusFolders));

        const { data: templatesRaw, error: templatesError } = await supabase
          .from('folder_templates')
          .select('id, name, parent_id, display_order')
          .order('display_order', { ascending: true });

        if (templatesError) throw templatesError;
        const templates = (templatesRaw || []) as FolderTemplate[];
        console.log(`Loaded ${templates.length} folder templates`);

        const { data: contracts, error: contractsError, count: total } = await supabase
          .from('contracts')
          .select('id, name, status, drive_folder_id', { count: 'exact' })
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(safeOffset, safeOffset + safeLimit - 1);

        if (contractsError) throw contractsError;

        const errors: Array<{ contractId: string; contractName: string; error: string }> = [];
        let processedCount = 0;
        let syncedCount = 0;

        for (const contract of contracts || []) {
          processedCount++;
          try {
            const statusFolderName = getStatusFolderName(contract.status);
            const statusFolder = statusFolders[statusFolderName];

            if (!statusFolder) {
              console.log(`No status folder found for ${contract.status}`);
              continue;
            }

            let contractFolder: { id: string; webViewLink: string } | null = null;
            let contractDriveFolderId = contract.drive_folder_id;

            if (contractDriveFolderId) {
              const claimedByOtherContracts = await getClaimedDriveFolderIdsByOtherContracts(
                supabase,
                [contractDriveFolderId],
                contract.id,
              );

              if (claimedByOtherContracts.has(contractDriveFolderId)) {
                console.warn(
                  `Drive folder ${contractDriveFolderId} is shared by multiple contracts. Resetting binding for ${contract.id}`,
                );
                await supabase
                  .from('contracts')
                  .update({ drive_folder_id: null })
                  .eq('id', contract.id);
                contractDriveFolderId = null;
              }
            }

            if (contractDriveFolderId) {
              const meta = await getFolderById(accessToken, contractDriveFolderId);
              if (meta && meta.mimeType === "application/vnd.google-apps.folder" && !meta.trashed) {
                const currentParent = meta.parents?.[0];
                if (currentParent && currentParent !== statusFolder.id) {
                  await moveToFolder(accessToken, meta.id, statusFolder.id, currentParent);
                  console.log(`Moved ${contract.name} (by id) to ${statusFolderName}`);
                }
                contractFolder = { id: meta.id, webViewLink: meta.webViewLink };
              }
            }

            if (!contractFolder) {
              let existingFolder = await pickUnclaimedDriveFolderByName(
                supabase,
                accessToken,
                contract.id,
                contract.name,
                statusFolder.id,
              );

              if (existingFolder) {
                contractFolder = existingFolder;
              } else {
                existingFolder = await pickUnclaimedDriveFolderByName(
                  supabase,
                  accessToken,
                  contract.id,
                  contract.name,
                  rootFolderId,
                );

                if (existingFolder) {
                  await moveToFolder(accessToken, existingFolder.id, statusFolder.id, rootFolderId);
                  contractFolder = existingFolder;
                  console.log(`Moved ${contract.name} to ${statusFolderName}`);
                } else {
                  for (const [folderName, folder] of Object.entries(statusFolders)) {
                    if (folderName !== statusFolderName) {
                      existingFolder = await pickUnclaimedDriveFolderByName(
                        supabase,
                        accessToken,
                        contract.id,
                        contract.name,
                        folder.id,
                      );
                      if (existingFolder) {
                        await moveToFolder(accessToken, existingFolder.id, statusFolder.id, folder.id);
                        contractFolder = existingFolder;
                        console.log(`Moved ${contract.name} from ${folderName} to ${statusFolderName}`);
                        break;
                      }
                    }
                  }
                }

                if (!contractFolder) {
                  contractFolder = await createDriveFolder(accessToken, contract.name, statusFolder.id);
                  console.log(`Created folder for ${contract.name} in ${statusFolderName}`);
                }
              }
            }

            if (contractFolder && contractFolder.id !== contract.drive_folder_id) {
              await supabase
                .from('contracts')
                .update({ drive_folder_id: contractFolder.id })
                .eq('id', contract.id);
            }

            if (templates.length > 0) {
              await ensureTemplateFolders(accessToken, contractFolder.id, templates);
              console.log(`Created folder hierarchy for ${contract.name}`);
            }

            syncedCount++;
          } catch (e: any) {
            console.error(`Failed syncing contract ${contract?.id} (${contract?.name})`, e);
            errors.push({
              contractId: contract.id,
              contractName: contract.name,
              error: e?.message || String(e),
            });
          }
        }

        const nextOffset = safeOffset + (contracts?.length || 0);
        const totalCount = total ?? null;
        const hasMore = totalCount !== null ? nextOffset < totalCount : (contracts?.length || 0) === safeLimit;

        result = {
          success: true,
          offset: safeOffset,
          limit: safeLimit,
          nextOffset,
          hasMore,
          total: totalCount,
          processedCount,
          syncedCount,
          errors,
        };
        break;
      }

      case "syncSingleContract": {
        const { contractId } = params;
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: contract, error: contractError } = await supabase
          .from('contracts')
          .select('id, name, status, drive_folder_id')
          .eq('id', contractId)
          .single();

        if (contractError || !contract) throw new Error(`Contract not found: ${contractId}`);

        const statusFolders = await ensureStatusFolders(accessToken, rootFolderId);
        const statusFolderName = getStatusFolderName(contract.status);
        const statusFolder = statusFolders[statusFolderName];

        let contractFolder: { id: string; webViewLink: string } | null = null;
        let contractDriveFolderId = contract.drive_folder_id;

        if (contractDriveFolderId) {
          const claimedByOtherContracts = await getClaimedDriveFolderIdsByOtherContracts(
            supabase,
            [contractDriveFolderId],
            contract.id,
          );

          if (claimedByOtherContracts.has(contractDriveFolderId)) {
            console.warn(
              `Drive folder ${contractDriveFolderId} is shared by multiple contracts. Resetting binding for ${contract.id}`,
            );
            await supabase
              .from('contracts')
              .update({ drive_folder_id: null })
              .eq('id', contract.id);
            contractDriveFolderId = null;
          }
        }

        if (contractDriveFolderId) {
          const meta = await getFolderById(accessToken, contractDriveFolderId);
          if (meta && meta.mimeType === "application/vnd.google-apps.folder" && !meta.trashed) {
            const currentParent = meta.parents?.[0];
            if (currentParent && currentParent !== statusFolder.id) {
              await moveToFolder(accessToken, meta.id, statusFolder.id, currentParent);
              console.log(`Moved ${contract.name} (by id) to ${statusFolderName}`);
            }
            contractFolder = { id: meta.id, webViewLink: meta.webViewLink };
          }
        }

        if (!contractFolder) {
          for (const [folderName, folder] of Object.entries(statusFolders)) {
            const existingFolder = await pickUnclaimedDriveFolderByName(
              supabase,
              accessToken,
              contract.id,
              contract.name,
              folder.id,
            );
            if (existingFolder) {
              if (folderName !== statusFolderName) {
                await moveToFolder(accessToken, existingFolder.id, statusFolder.id, folder.id);
                console.log(`Moved ${contract.name} from ${folderName} to ${statusFolderName}`);
              }
              contractFolder = existingFolder;
              break;
            }
          }

          if (!contractFolder) {
            const rootFolder = await pickUnclaimedDriveFolderByName(
              supabase,
              accessToken,
              contract.id,
              contract.name,
              rootFolderId,
            );
            if (rootFolder) {
              await moveToFolder(accessToken, rootFolder.id, statusFolder.id, rootFolderId);
              contractFolder = rootFolder;
              console.log(`Moved ${contract.name} from root to ${statusFolderName}`);
            }
          }
        }

        if (!contractFolder) {
          contractFolder = await createDriveFolder(accessToken, contract.name, statusFolder.id);
          console.log(`Created folder for ${contract.name} in ${statusFolderName}`);
        }

        await supabase
          .from('contracts')
          .update({ drive_folder_id: contractFolder.id })
          .eq('id', contract.id);

        const { data: templatesRaw, error: templatesError } = await supabase
          .from('folder_templates')
          .select('id, name, parent_id, display_order')
          .order('display_order', { ascending: true });

        if (templatesError) throw templatesError;
        const templates = (templatesRaw || []) as FolderTemplate[];
        if (templates.length > 0) {
          await ensureTemplateFolders(accessToken, contractFolder.id, templates);
        }

        result = {
          success: true,
          contractId: contract.id,
          contractName: contract.name,
          driveFolderId: contractFolder.id,
          statusFolder: statusFolderName,
          webViewLink: contractFolder.webViewLink,
        };
        break;
      }

      case "ensureProjectStructure": {
        const { contractId, contractName, subfolders, status } = params;

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const statusFolders = await ensureStatusFolders(accessToken, rootFolderId);
        const statusFolderName = getStatusFolderName(status || 'en_negociacion');
        const statusFolder = statusFolders[statusFolderName];

        const incomingSubfolders = Array.isArray(subfolders) ? subfolders : [];
        const dedupedSubfolders = Array.from(
          new Map(
            incomingSubfolders
              .filter((s: any) => s?.id && typeof s.name === 'string' && s.name.trim().length > 0)
              .map((s: any) => [normalizeDriveNameKey(s.name), { id: s.id, name: s.name.trim() }]),
          ).values(),
        );

        const hasLegacyParent = dedupedSubfolders.some(
          (s) => normalizeDriveNameKey(s.name) === normalizeDriveNameKey('OC y FACTURAS'),
        );

        const normalizedSubfolders = hasLegacyParent
          ? dedupedSubfolders.filter((s) => {
              const key = normalizeDriveNameKey(s.name);
              return key !== normalizeDriveNameKey('OOCC') && key !== normalizeDriveNameKey('Facturas');
            })
          : dedupedSubfolders;

        // Prefer explicit binding from DB, but reject shared/cross-contract bindings
        const { data: boundContract } = await sb
          .from('contracts')
          .select('drive_folder_id')
          .eq('id', contractId)
          .single();

        let boundDriveFolderId: string | null = boundContract?.drive_folder_id || null;
        if (boundDriveFolderId) {
          const claimedByOtherContracts = await getClaimedDriveFolderIdsByOtherContracts(
            sb,
            [boundDriveFolderId],
            contractId,
          );

          if (claimedByOtherContracts.has(boundDriveFolderId)) {
            console.warn(
              `ensureProjectStructure: shared binding ${boundDriveFolderId} for contract ${contractId}, resetting`,
            );
            await sb
              .from('contracts')
              .update({ drive_folder_id: null })
              .eq('id', contractId);
            boundDriveFolderId = null;
          }
        }

        let existingFolder: { id: string; webViewLink: string } | null = null;
        let existingInFolder: string | null = null;

        if (boundDriveFolderId) {
          const boundMeta = await getFolderById(accessToken, boundDriveFolderId);
          if (boundMeta && boundMeta.mimeType === "application/vnd.google-apps.folder" && !boundMeta.trashed) {
            existingFolder = {
              id: boundMeta.id,
              webViewLink: boundMeta.webViewLink || `https://drive.google.com/drive/folders/${boundMeta.id}`,
            };

            const currentParent = boundMeta.parents?.[0] || null;
            if (currentParent === rootFolderId) {
              existingInFolder = 'root';
            } else {
              const statusEntry = Object.entries(statusFolders).find(([, folder]) => folder.id === currentParent);
              existingInFolder = statusEntry?.[0] || null;
            }
          }
        }

        // Check across ALL status folders to prevent duplicates
        if (!existingFolder) {
          for (const [folderName, folder] of Object.entries(statusFolders)) {
            const found = await pickUnclaimedDriveFolderByName(
              sb,
              accessToken,
              contractId,
              contractName,
              folder.id,
            );
            if (found) {
              existingFolder = found;
              existingInFolder = folderName;
              break;
            }
          }
        }

        // Also check root level
        if (!existingFolder) {
          existingFolder = await pickUnclaimedDriveFolderByName(
            sb,
            accessToken,
            contractId,
            contractName,
            rootFolderId,
          );
          if (existingFolder) existingInFolder = 'root';
        }

        if (existingFolder) {
          // Move to correct status folder if needed
          if (existingInFolder && existingInFolder !== statusFolderName && existingInFolder !== 'root') {
            const sourceFolder = statusFolders[existingInFolder];
            if (sourceFolder) {
              await moveToFolder(accessToken, existingFolder.id, statusFolder.id, sourceFolder.id);
              console.log(`Moved ${contractName} from ${existingInFolder} to ${statusFolderName}`);
            }
          } else if (existingInFolder === 'root') {
            await moveToFolder(accessToken, existingFolder.id, statusFolder.id, rootFolderId);
            console.log(`Moved ${contractName} from root to ${statusFolderName}`);
          }

          // Ensure subfolders exist (don't duplicate)
          const existingChildren = await listChildFolders(accessToken, existingFolder.id);
          const createdSubfolders: any[] = [];
          for (const subfolder of normalizedSubfolders) {
            const key = normalizeDriveNameKey(subfolder.name);
            let child = existingChildren[key];
            if (!child) {
              child = await createDriveFolder(accessToken, subfolder.name, existingFolder.id);
            }
            createdSubfolders.push({
              localId: subfolder.id,
              name: subfolder.name,
              driveFolderId: child.id,
              webViewLink: child.webViewLink,
            });
          }

          result = {
            exists: false,
            projectFolderId: existingFolder.id,
            webViewLink: existingFolder.webViewLink,
            subfolders: createdSubfolders,
            statusFolder: statusFolderName,
          };
        } else {
          const projectFolder = await createDriveFolder(accessToken, contractName, statusFolder.id);

          const createdSubfolders: any[] = [];
          for (const subfolder of normalizedSubfolders) {
            const subFolderResult = await createDriveFolder(accessToken, subfolder.name, projectFolder.id);
            createdSubfolders.push({
              localId: subfolder.id,
              name: subfolder.name,
              driveFolderId: subFolderResult.id,
              webViewLink: subFolderResult.webViewLink,
            });
          }

          result = {
            exists: false,
            projectFolderId: projectFolder.id,
            webViewLink: projectFolder.webViewLink,
            subfolders: createdSubfolders,
            statusFolder: statusFolderName,
          };
        }
        break;
      }

      case "ensureSubfolderExists": {
        const { parentDriveFolderId, folderName } = params;
        if (!parentDriveFolderId || !folderName) throw new Error("parentDriveFolderId and folderName are required");

        let folder = await getFolderByName(accessToken, folderName, parentDriveFolderId);
        if (!folder) {
          folder = await createDriveFolder(accessToken, folderName, parentDriveFolderId);
          console.log(`Created subfolder: ${folderName} in ${parentDriveFolderId}`);
        }
        result = folder;
        break;
      }

      case "createFolder": {
        const { name, parentDriveFolderId } = params;
        const existing = await getFolderByName(accessToken, name, parentDriveFolderId);
        if (existing) {
          result = { exists: true, ...existing };
        } else {
          const folder = await createDriveFolder(accessToken, name, parentDriveFolderId);
          result = { exists: false, ...folder };
        }
        break;
      }

      case "uploadFile": {
        const { fileName, fileContent, mimeType, driveFolderId } = params;
        const binaryContent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        const file = await uploadFileToDrive(accessToken, fileName, binaryContent, mimeType, driveFolderId);
        result = file;
        break;
      }

      case "uploadFileFromStorage": {
        // Upload a file to a known Drive folder from a temporary storage:// URL
        const { fileName: directFileName, storageUrl: directStorageUrl, mimeType: directMimeType, driveFolderId: directDriveFolderId } = params;
        if (!directFileName || !directStorageUrl || !directDriveFolderId) {
          return new Response(JSON.stringify({ error: "fileName, storageUrl, and driveFolderId are required" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const sbDirect = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const directStoragePath = extractRepositoryStoragePath(directStorageUrl);
        if (!directStoragePath) {
          return new Response(JSON.stringify({ error: "Invalid storageUrl format" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const { data: directDlData, error: directDlError } = await sbDirect.storage
          .from('repository-files')
          .download(directStoragePath);

        if (directDlError || !directDlData) {
          console.error("uploadFileFromStorage: file not found", { directStoragePath });
          return new Response(JSON.stringify({ error: "File not found in temporary storage" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const directBinary = new Uint8Array(await directDlData.arrayBuffer());
        const directDriveFile = await uploadFileToDrive(
          accessToken, directFileName, directBinary,
          directMimeType || 'application/octet-stream', directDriveFolderId,
        );

        await cleanupStorageFile(sbDirect, directStorageUrl);
        console.log("uploadFileFromStorage: success", { driveFileId: directDriveFile.id });

        result = directDriveFile;
        break;
      }


        // Upload a file to the correct hierarchical Drive folder for a repo folder
        const { fileName, fileContent, mimeType, repoFolderId, contractId } = params;
        if (!repoFolderId || !contractId || !fileName || !fileContent) {
          throw new Error("repoFolderId, contractId, fileName, and fileContent are required");
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const { data: repoFolder } = await sb
          .from('repository_folders')
          .select('id, contract_id')
          .eq('id', repoFolderId)
          .single();

        if (!repoFolder || repoFolder.contract_id !== contractId) {
          throw new Error(`repoFolderId ${repoFolderId} is not owned by contract ${contractId}`);
        }

        const targetDriveFolderId = await ensureDriveFolderForRepositoryFolder(
          sb,
          accessToken,
          contractId,
          repoFolderId,
        );

        if (!targetDriveFolderId) {
          throw new Error(`Could not resolve Drive folder for repo folder ${repoFolderId}`);
        }

        const binaryContent2 = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        const driveFile = await uploadFileToDrive(accessToken, fileName, binaryContent2, mimeType || 'application/octet-stream', targetDriveFolderId);

        result = {
          id: driveFile.id,
          driveFileId: driveFile.id,
          webViewLink: driveFile.webViewLink,
          driveUrl: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
          driveFolderId: targetDriveFolderId,
        };
        break;
      }

      case "uploadPatentFile": {
        // Upload a patent file to the contract's "Rentas y Patentes" folder in Drive
        const { contractId, itemId, fileName, fileContent, mimeType } = params;
        if (!contractId || !fileName || !fileContent) {
          throw new Error("contractId, fileName, and fileContent are required");
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        // Find the "Rentas y Patentes" folder for this contract
        const { data: patentFolder } = await sb
          .from('repository_folders')
          .select('id, drive_folder_id')
          .eq('folder_type', 'rentas_y_patentes')
          .eq('contract_id', contractId)
          .limit(1)
          .single();

        if (!patentFolder) {
          throw new Error(`No "Rentas y Patentes" folder found for contract ${contractId}`);
        }

        // Ensure the Drive folder exists
        let targetDriveFolderId = patentFolder.drive_folder_id;
        if (!targetDriveFolderId) {
          targetDriveFolderId = await ensureDriveFolderForRepositoryFolder(
            sb, accessToken, contractId, patentFolder.id
          );
        }

        if (!targetDriveFolderId) {
          throw new Error(`Could not resolve Drive folder for patent folder of contract ${contractId}`);
        }

        const binaryContentPatent = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        const driveFilePatent = await uploadFileToDrive(accessToken, fileName, binaryContentPatent, mimeType || 'application/octet-stream', targetDriveFolderId);

        // Also register in repository_files for tracking
        const fileUrl = driveFilePatent.webViewLink || `https://drive.google.com/file/d/${driveFilePatent.id}/view`;
        const ext = fileName.includes('.') ? fileName.split('.').pop() : null;
        await sb.from('repository_files').insert({
          folder_id: patentFolder.id,
          name: fileName,
          url: fileUrl,
          file_type: ext,
          drive_file_id: driveFilePatent.id,
        });

        result = {
          id: driveFilePatent.id,
          driveFileId: driveFilePatent.id,
          webViewLink: fileUrl,
        };
        break;
      }

      case "uploadRepoFileFromStorage": {
        // Upload a repo file to Drive from a temporary storage:// URL (avoids base64 memory limit)
        const { contractId: repoContractId, repoFolderId: repoFolderIdStorage, fileName: repoFileName, storageUrl: repoStorageUrl, mimeType: repoMimeType } = params;
        if (!repoContractId || !repoFolderIdStorage || !repoFileName || !repoStorageUrl) {
          return new Response(JSON.stringify({ error: "contractId, repoFolderId, fileName, and storageUrl are required" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const sbRepo = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        const repoStoragePath = extractRepositoryStoragePath(repoStorageUrl);
        if (!repoStoragePath) {
          return new Response(JSON.stringify({ error: "Invalid storageUrl format" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const repoStorageContractId = extractContractIdFromRepositoryPath(repoStoragePath);
        if (!repoStorageContractId || repoStorageContractId !== String(repoContractId).toLowerCase()) {
          return new Response(JSON.stringify({ error: `storageUrl contract mismatch` }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Validate folder ownership
        const { data: repoFolderCheck } = await sbRepo
          .from('repository_folders')
          .select('id, contract_id')
          .eq('id', repoFolderIdStorage)
          .single();

        if (!repoFolderCheck || repoFolderCheck.contract_id !== repoContractId) {
          return new Response(JSON.stringify({ error: `repoFolderId not owned by contract` }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const targetRepoFolderId = await ensureDriveFolderForRepositoryFolder(
          sbRepo, accessToken, repoContractId, repoFolderIdStorage,
        );

        if (!targetRepoFolderId) {
          return new Response(JSON.stringify({ error: `Could not resolve Drive folder for repo folder` }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Download from temp storage
        const { data: repoDlData, error: repoDlError } = await sbRepo.storage
          .from('repository-files')
          .download(repoStoragePath);

        if (repoDlError || !repoDlData) {
          console.error("uploadRepoFileFromStorage: file not found", { repoStoragePath });
          return new Response(JSON.stringify({ error: "File not found in temporary storage" }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const repoBinaryContent = new Uint8Array(await repoDlData.arrayBuffer());
        const repoDriveFile = await uploadFileToDrive(
          accessToken, repoFileName, repoBinaryContent,
          repoMimeType || 'application/octet-stream', targetRepoFolderId,
        );

        await cleanupStorageFile(sbRepo, repoStorageUrl);
        console.log("uploadRepoFileFromStorage: success", { driveFileId: repoDriveFile.id, repoContractId });

        result = {
          id: repoDriveFile.id,
          driveFileId: repoDriveFile.id,
          webViewLink: repoDriveFile.webViewLink,
          driveUrl: repoDriveFile.webViewLink || `https://drive.google.com/file/d/${repoDriveFile.id}/view`,
          driveFolderId: targetRepoFolderId,
        };
        break;
      }

      case "uploadPatentFileFromStorage": {
        // Upload a patent file to Drive from a temporary storage:// URL
        const { contractId, itemId, fileName, storageUrl, mimeType } = params;
        if (!contractId || !fileName || !storageUrl) {
          return new Response(JSON.stringify({ error: "contractId, fileName, and storageUrl are required" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const storagePath = extractRepositoryStoragePath(storageUrl);
        if (!storagePath) {
          console.error("uploadPatentFileFromStorage: invalid storageUrl format", { storageUrl });
          return new Response(JSON.stringify({ error: "Invalid storageUrl format" }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Validate contract isolation — accept both contracts/<id>/... and <id>/... legacy
        const storageContractId = extractContractIdFromRepositoryPath(storagePath);
        if (!storageContractId || storageContractId !== String(contractId).toLowerCase()) {
          console.error("uploadPatentFileFromStorage: contract mismatch", {
            storageContractId, contractId, storagePath,
          });
          return new Response(JSON.stringify({ error: `storageUrl contract mismatch (path=${storageContractId}, expected=${String(contractId).toLowerCase()})` }), {
            status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Find the "Rentas y Patentes" folder for this contract — auto-create if missing
        let { data: patentFolder } = await sb
          .from('repository_folders')
          .select('id, drive_folder_id')
          .eq('folder_type', 'rentas_y_patentes')
          .eq('contract_id', contractId)
          .limit(1)
          .single();

        if (!patentFolder) {
          console.warn("uploadPatentFileFromStorage: no patent folder for contract, auto-creating", contractId);
          // Find a parent base folder for this contract to attach the new folder
          const { data: parentFolder } = await sb
            .from('repository_folders')
            .select('id')
            .eq('contract_id', contractId)
            .is('parent_id', null)
            .limit(1)
            .single();

          const { data: created, error: createErr } = await sb
            .from('repository_folders')
            .insert({
              contract_id: contractId,
              name: 'Rentas y Patentes',
              folder_type: 'rentas_y_patentes',
              is_base_folder: !parentFolder,
              parent_id: parentFolder?.id || null,
            })
            .select('id, drive_folder_id')
            .single();

          if (createErr || !created) {
            console.error("uploadPatentFileFromStorage: failed to auto-create patent folder", createErr);
            return new Response(JSON.stringify({ error: `No patent folder found and auto-creation failed` }), {
              status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
            });
          }
          patentFolder = created;
        }

        let targetDriveFolderId = patentFolder.drive_folder_id;
        if (!targetDriveFolderId) {
          targetDriveFolderId = await ensureDriveFolderForRepositoryFolder(
            sb, accessToken, contractId, patentFolder.id,
          );
        }

        if (!targetDriveFolderId) {
          return new Response(JSON.stringify({ error: `Could not resolve Drive folder for patent folder` }), {
            status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }

        // Download from storage — try exact path first, then fallback to listing
        let fileData: Blob | null = null;
        const { data: dlData, error: dlError } = await sb.storage
          .from('repository-files')
          .download(storagePath);

        if (dlError || !dlData) {
          console.warn("uploadPatentFileFromStorage: exact download failed, trying list fallback", {
            storagePath, error: dlError?.message,
          });
          // Fallback: list files in the parent directory and find by name suffix
          const pathParts = storagePath.split('/');
          const targetFileName = pathParts.pop() || '';
          const parentPath = pathParts.join('/');
          if (parentPath && targetFileName) {
            const { data: listed } = await sb.storage.from('repository-files').list(parentPath, { limit: 50 });
            const match = (listed || []).find((f: any) => f.name === targetFileName || f.name.endsWith(targetFileName));
            if (match) {
              const altPath = `${parentPath}/${match.name}`;
              const { data: altData } = await sb.storage.from('repository-files').download(altPath);
              if (altData) fileData = altData;
            }
          }
          if (!fileData) {
            console.error("uploadPatentFileFromStorage: file not found in storage", { storagePath });
            return new Response(JSON.stringify({ error: `File not found in temporary storage` }), {
              status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
            });
          }
        } else {
          fileData = dlData;
        }

        const binaryContentPatent = new Uint8Array(await fileData.arrayBuffer());
        const driveFilePatent = await uploadFileToDrive(
          accessToken, fileName, binaryContentPatent,
          mimeType || 'application/octet-stream', targetDriveFolderId,
        );

        const fileUrl = driveFilePatent.webViewLink || `https://drive.google.com/file/d/${driveFilePatent.id}/view`;
        const ext = fileName.includes('.') ? fileName.split('.').pop() : null;
        await sb.from('repository_files').insert({
          folder_id: patentFolder.id,
          name: fileName,
          url: fileUrl,
          file_type: ext,
          drive_file_id: driveFilePatent.id,
        });

        await cleanupStorageFile(sb, storageUrl);
        console.log("uploadPatentFileFromStorage: success", { driveFileId: driveFilePatent.id, contractId });

        result = {
          id: driveFilePatent.id,
          driveFileId: driveFilePatent.id,
          webViewLink: fileUrl,
          itemId,
        };
        break;
      }

      case "listFiles": {
        const { driveFolderId } = params;
        const files = await listFilesInFolder(accessToken, driveFolderId);
        result = { files };
        break;
      }

      case "deleteFile": {
        const { driveFileId } = params;
        await deleteFile(accessToken, driveFileId);
        result = { success: true };
        break;
      }

      case "syncFolder": {
        const { name, parentDriveFolderId } = params;
        let folder = await getFolderByName(accessToken, name, parentDriveFolderId);
        if (!folder) folder = await createDriveFolder(accessToken, name, parentDriveFolderId);
        result = folder;
        break;
      }

      case "testConnection": {
        if (!rootFolderMeta) throw new Error("Root folder metadata unavailable");

        // Identify the authenticated user
        let authenticatedUser: any = null;
        try {
          const aboutRes = await fetch(
            "https://www.googleapis.com/drive/v3/about?fields=user",
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (aboutRes.ok) {
            const aboutData = await aboutRes.json();
            authenticatedUser = aboutData.user;
          }
        } catch (e) {
          console.error("about user error:", e);
        }

        // List shared drives for diagnostics
        let sharedDrives: any[] = [];
        let directDriveTest: any = null;
        try {
          const sdRes = await fetch(
            "https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(id,name)",
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (sdRes.ok) {
            const sdData = await sdRes.json();
            sharedDrives = sdData.drives || [];
          } else {
            console.error("listDrives failed:", sdRes.status, await sdRes.text().catch(() => ""));
          }
        } catch (e) {
          console.error("listDrives error:", e);
        }

        // Direct test of configured root ID
        const testId = extractDriveId(Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')?.trim() || "");
        if (testId && testId !== 'root') {
          try {
            // Test as file
            const fileRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${testId}?fields=id,name,mimeType,trashed&supportsAllDrives=true&includeItemsFromAllDrives=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            const fileBody = await fileRes.text();
            // Test as shared drive
            const driveRes = await fetch(
              `https://www.googleapis.com/drive/v3/drives/${testId}?fields=id,name`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            const driveBody = await driveRes.text();
            directDriveTest = {
              extractedId: testId,
              fileApi: { status: fileRes.status, body: fileBody },
              drivesApi: { status: driveRes.status, body: driveBody },
            };
          } catch (e: any) {
            directDriveTest = { error: e.message };
          }
        }

        result = {
          success: true,
          message: "Conexión exitosa con Google Drive",
          authMethod: (Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') && Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')) ? 'oauth' : 'service_account',
          rootFolder: {
            id: rootFolderMeta.id,
            name: rootFolderMeta.name,
            webViewLink: rootFolderMeta.webViewLink,
          },
          rootSource: rootFolderMeta.source,
          configuredRootId: Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')?.trim() || "(not set)",
          directDriveTest,
          sharedDrives,
          authenticatedUser,
        };
        break;
      }

      case "syncGeneralFolders": {
        // Ensure "Información General" root folder exists in Drive
        let generalRoot = await getFolderByName(accessToken, "Información General", rootFolderId);
        if (!generalRoot) {
          const legacyRoot = await getFolderByName(accessToken, "Carpeta General", rootFolderId);
          if (legacyRoot) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${legacyRoot.id}?supportsAllDrives=true`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Información General" }),
            });
            generalRoot = legacyRoot;
            console.log("Renamed 'Carpeta General' to 'Información General'");
          } else {
            generalRoot = await createDriveFolder(accessToken, "Información General", rootFolderId);
            console.log("Created 'Información General' root folder");
          }
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const { data: generalFolders } = await sb
          .from('general_folders')
          .select('*')
          .order('display_order', { ascending: true });

        type GeneralFolderRow = {
          id: string;
          name: string;
          parent_id: string | null;
          contract_id: string | null;
          drive_folder_id: string | null;
          display_order: number | null;
          created_at?: string;
        };

        const folders = (generalFolders || []) as GeneralFolderRow[];
        const syncedFolders: any[] = [];
        const claimedDriveIds = new Set<string>();

        const childrenByParent = new Map<string | null, GeneralFolderRow[]>();
        for (const folder of folders) {
          const arr = childrenByParent.get(folder.parent_id) || [];
          arr.push(folder);
          childrenByParent.set(folder.parent_id, arr);
        }

        // No deterministic renaming – DB names are already unique

        const findAllFoldersByName = async (
          name: string,
          parentId: string,
        ): Promise<{ id: string; name: string; webViewLink: string; createdTime?: string }[]> => {
          const sanitizedName = sanitizeForDriveQuery(sanitizeDriveName(name));
          const q = `name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`;
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.warn(`findAllFoldersByName failed for '${name}' under ${parentId}:`, res.status, txt);
            return [];
          }
          const data = await res.json();
          return data.files || [];
        };

        const renameDriveFolder = async (folderId: string, name: string) => {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: sanitizeDriveName(name) }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`Failed to rename folder ${folderId}: ${response.status} ${errorText}`);
          }
        };

        const trashDriveFolder = async (folderId: string) => {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trashed: true }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            console.warn(`Failed to trash duplicate folder ${folderId}: ${response.status} ${errorText}`);
          }
        };

        const syncFolder = async (folder: GeneralFolderRow, parentDriveId: string) => {
          const desiredName = (folder.name || "Sin nombre").trim() || "Sin nombre";
          const desiredSanitizedName = sanitizeDriveName(desiredName);
          let driveFolder: { id: string; webViewLink: string } | null = null;

          if (folder.drive_folder_id) {
            try {
              const meta = await getFolderById(accessToken, folder.drive_folder_id);
              const isValidFolder = !!meta && meta.mimeType === "application/vnd.google-apps.folder" && !meta.trashed;

              if (isValidFolder && meta && !claimedDriveIds.has(meta.id)) {
                const currentParent = meta.parents?.[0];
                if (currentParent && currentParent !== parentDriveId) {
                  await moveToFolder(accessToken, meta.id, parentDriveId, currentParent);
                }

                if (sanitizeDriveName(meta.name || "") !== desiredSanitizedName) {
                  await renameDriveFolder(meta.id, desiredName);
                }

                driveFolder = { id: meta.id, webViewLink: meta.webViewLink || "" };
              }
            } catch (err) {
              console.warn(`Invalid stored drive_folder_id for ${folder.id}:`, err);
            }
          }

          if (!driveFolder) {
            const exactMatches = await findAllFoldersByName(desiredName, parentDriveId);
            const chosenExact = exactMatches.find((m) => !claimedDriveIds.has(m.id));

            if (chosenExact) {
              driveFolder = { id: chosenExact.id, webViewLink: chosenExact.webViewLink };

              const exactDuplicates = exactMatches.filter((m) => m.id !== chosenExact.id && !claimedDriveIds.has(m.id));
              for (const duplicate of exactDuplicates) {
                await trashDriveFolder(duplicate.id);
              }
            }
          }

          if (!driveFolder) {
            driveFolder = await createDriveFolder(accessToken, desiredName, parentDriveId);
          }

          if (driveFolder.id !== folder.drive_folder_id) {
            await sb
              .from('general_folders')
              .update({ drive_folder_id: driveFolder.id })
              .eq('id', folder.id);
          }

          claimedDriveIds.add(driveFolder.id);
          syncedFolders.push({
            id: folder.id,
            name: folder.name,
            driveName: desiredName, 
            driveFolderId: driveFolder.id,
          });

          // ── Upload local files to Drive ──
          const { data: localFiles } = await sb
            .from('general_folder_files')
            .select('*')
            .eq('folder_id', folder.id);

          for (const file of (localFiles || [])) {
            if (file.drive_file_id) continue;

            if (file.url?.startsWith('storage://')) {
              const storagePath = file.url.replace('storage://repository-files/', '');
              const { data: fileData, error: dlErr } = await sb.storage.from('repository-files').download(storagePath);
              if (dlErr || !fileData) {
                console.error("Download failed:", file.name, dlErr);
                continue;
              }

              const mimeType = file.file_type === 'pdf' ? 'application/pdf' : 'application/octet-stream';
              const boundary = '-------314159265358979323846';
              const metadata = JSON.stringify({ name: sanitizeDriveName(file.name), parents: [driveFolder.id] });
              const fileBytes = new Uint8Array(await fileData.arrayBuffer());

              const parts = [
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
                `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
              ];
              const encoder = new TextEncoder();
              const head = encoder.encode(parts[0]);
              const mid = encoder.encode(parts[1]);
              const tail = encoder.encode(`\r\n--${boundary}--`);
              const body = new Uint8Array(head.length + mid.length + fileBytes.length + tail.length);
              body.set(head, 0);
              body.set(mid, head.length);
              body.set(fileBytes, head.length + mid.length);
              body.set(tail, head.length + mid.length + fileBytes.length);

              const uploadRes = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                  },
                  body,
                },
              );

              if (uploadRes.ok) {
                const uploaded = await uploadRes.json();
                await sb.from('general_folder_files').update({ drive_file_id: uploaded.id }).eq('id', file.id);
                // Clean up local storage copy now that file is in Drive
                await cleanupStorageFile(sb, file.url);
                console.log(`Uploaded file "${file.name}" to Drive (storage cleaned)`);
              } else {
                console.error("File upload failed:", file.name, uploadRes.status);
              }
            }
          }

          // ── Index files from Drive → DB ──
          const listRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${driveFolder.id}'+in+parents+and+trashed=false+and+mimeType!='application/vnd.google-apps.folder'&fields=files(id,name,mimeType,webViewLink)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (listRes.ok) {
            const listData = await listRes.json();
            const driveFiles = listData.files || [];
            const existingDriveIds = new Set(
              (localFiles || [])
                .filter((f: any) => f.drive_file_id)
                .map((f: any) => f.drive_file_id),
            );

            for (const df of driveFiles) {
              if (!existingDriveIds.has(df.id)) {
                const ext = df.name.includes('.') ? df.name.split('.').pop() : null;
                await sb.from('general_folder_files').insert({
                  folder_id: folder.id,
                  name: df.name,
                  url: df.webViewLink || '',
                  file_type: ext,
                  drive_file_id: df.id,
                });
                console.log(`Indexed Drive file "${df.name}" into folder "${folder.name}"`);
              }
            }
          }

          const children = childrenByParent.get(folder.id) || [];
          for (const child of children) {
            await syncFolder(child, driveFolder.id);
          }
        };

        const roots = childrenByParent.get(null) || [];
        for (const root of roots) {
          await syncFolder(root, generalRoot.id);
        }

        result = { success: true, generalRootId: generalRoot.id, syncedFolders };
        break;
      }

      case "bulkUploadPatentFiles": {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const batchSize = params.batchSize || 10;
        const offset = params.offset || 0;

        const { data: patentDocs, error: pdErr } = await sb
          .from('patent_documents')
          .select('id, contract_id, checklist_item_id, document_url')
          .not('document_url', 'is', null)
          .neq('document_url', '')
          .order('id')
          .range(offset, offset + batchSize - 1);

        if (pdErr) throw pdErr;

        const { data: destSettings } = await sb
          .from('file_destination_settings')
          .select('setting_key, folder_name')
          .like('setting_key', 'patent%');

        const settingsMap: Record<string, string> = {};
        for (const s of destSettings || []) {
          settingsMap[s.setting_key] = s.folder_name;
        }

        const { data: checklistItems } = await sb
          .from('patent_checklist_items')
          .select('id, section_id');
        const itemSectionMap: Record<string, string> = {};
        for (const item of checklistItems || []) {
          itemSectionMap[item.id] = item.section_id;
        }

        function getDestinations(itemId: string): { source: string; name: string }[] {
          const itemKey = `patent_item_${itemId}`;
          if (settingsMap[itemKey]) return parseDestinationEntries(settingsMap[itemKey]);

          const sectionId = itemSectionMap[itemId];
          if (sectionId) {
            const sectionKey = `patent_section_${sectionId}`;
            if (settingsMap[sectionKey]) return parseDestinationEntries(settingsMap[sectionKey]);
          }

          if (settingsMap['patent_folder']) return parseDestinationEntries(settingsMap['patent_folder']);

          return [{ source: 'repo', name: 'Doc. Patentes' }];
        }

        const uploaded: string[] = [];
        const errors: string[] = [];

        for (const doc of patentDocs || []) {
          const allUrls = doc.document_url.split('|||').filter(Boolean);
          const destinations = getDestinations(doc.checklist_item_id).filter((d) => d.source === 'repo');

          for (const storageUrl of allUrls) {
            if (!storageUrl.startsWith('storage://repository-files/')) continue;

            const storagePath = storageUrl.replace('storage://repository-files/', '');
            const fileName = storagePath.split('/').pop() || 'patent_file';

            const { data: fileData, error: dlErr } = await sb.storage
              .from('repository-files')
              .download(storagePath);

            if (dlErr || !fileData) {
              errors.push(`Download failed: ${fileName} - ${dlErr?.message}`);
              continue;
            }

            const fileBytes = new Uint8Array(await fileData.arrayBuffer());

            for (const dest of destinations) {
              const { data: folderList } = await sb
                .from('repository_folders')
                .select('id, name, drive_folder_id')
                .eq('contract_id', doc.contract_id)
                .ilike('name', dest.name);

              const exact = (folderList || []).filter(
                (f: any) => (f.name || '').trim().toLowerCase() === dest.name.trim().toLowerCase(),
              );
              const chosen = exact.find((f: any) => !!f.drive_folder_id) || exact[0] || folderList?.[0] || null;

              if (!chosen) {
                errors.push(`Folder ${dest.name} not found for contract ${doc.contract_id}`);
                continue;
              }

              let targetDriveFolderId: string | null = null;
              try {
                targetDriveFolderId = await ensureDriveFolderForRepositoryFolder(
                  sb,
                  accessToken,
                  doc.contract_id,
                  chosen.id,
                );
              } catch (folderErr: any) {
                errors.push(`Folder resolution failed for ${dest.name} (${doc.contract_id}): ${folderErr.message}`);
                continue;
              }

              if (!targetDriveFolderId) {
                errors.push(`No Drive folder available for ${dest.name} (${doc.contract_id})`);
                continue;
              }

              const { data: existingRows } = await sb
                .from('repository_files')
                .select('id, drive_file_id, folder_id, name')
                .eq('folder_id', chosen.id)
                .eq('name', fileName)
                .limit(5);

              if ((existingRows || []).some((r: any) => !!r.drive_file_id)) {
                continue;
              }

              try {
                const mimeType = fileName.endsWith('.pdf') ? 'application/pdf'
                  : fileName.endsWith('.jpeg') || fileName.endsWith('.jpg') ? 'image/jpeg'
                  : fileName.endsWith('.png') ? 'image/png'
                  : fileName.endsWith('.doc') ? 'application/msword'
                  : fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'application/octet-stream';

                const driveFile = await uploadFileToDrive(accessToken, fileName, fileBytes, mimeType, targetDriveFolderId);
                const fileUrl = driveFile.webViewLink || driveFile.webContentLink || `https://drive.google.com/file/d/${driveFile.id}/view`;
                const ext = fileName.includes('.') ? fileName.split('.').pop() : null;

                if ((existingRows || []).length > 0) {
                  await sb
                    .from('repository_files')
                    .update({
                      folder_id: chosen.id,
                      url: fileUrl,
                      file_type: ext,
                      drive_file_id: driveFile.id,
                    })
                    .eq('id', existingRows![0].id);
                } else {
                  await sb.from('repository_files').insert({
                    folder_id: chosen.id,
                    name: fileName,
                    url: fileUrl,
                    file_type: ext,
                    drive_file_id: driveFile.id,
                  });
                }

                // Clean up local storage copy now that file is in Drive
                await cleanupStorageFile(sb, storageUrl);

                uploaded.push(`${fileName} → ${dest.name}`);
              } catch (uploadErr: any) {
                errors.push(`Upload failed: ${fileName} → ${dest.name}: ${uploadErr.message}`);
              }
            }
          }
        }

        const hasMore = (patentDocs || []).length === batchSize;
        result = {
          success: true,
          uploaded: uploaded.length,
          errors: errors.length,
          uploadedFiles: uploaded,
          errorDetails: errors,
          hasMore,
          nextOffset: offset + batchSize,
          processed: (patentDocs || []).length,
        };
        break;
      }

      case "fixPatentFolderMisplacements": {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const fixes: string[] = [];
        const fixErrors: string[] = [];

        // Get all patent destination folder names
        const { data: destSettings } = await sb
          .from('file_destination_settings')
          .select('folder_name')
          .like('setting_key', 'patent%');

        const destFolderNames = new Set<string>();
        for (const s of destSettings || []) {
          for (const entry of parseDestinationEntries(s.folder_name)) {
            destFolderNames.add(entry.name);
          }
        }

        if (destFolderNames.size === 0) {
          result = { success: true, fixes: ['No patent destinations configured'], errors: [] };
          break;
        }

        // Find nested repo folders (have parent_id) with a drive_folder_id
        const { data: nestedFolders } = await sb
          .from('repository_folders')
          .select('id, name, contract_id, parent_id, drive_folder_id')
          .not('parent_id', 'is', null)
          .not('drive_folder_id', 'is', null);

        for (const folder of nestedFolders || []) {
          if (!destFolderNames.has(folder.name)) continue;

          const { data: contract } = await sb
            .from('contracts')
            .select('drive_folder_id, name')
            .eq('id', folder.contract_id)
            .single();

          if (!contract?.drive_folder_id) continue;

          try {
            // Use the recursive resolver — it validates parents, detects wrong location, and fixes
            const correctId = await ensureDriveFolderForRepositoryFolder(
              sb,
              accessToken,
              folder.contract_id,
              folder.id,
            );

            if (!correctId) {
              fixErrors.push(`Could not resolve Drive folder for '${folder.name}' in ${contract.name}`);
              continue;
            }

            if (correctId !== folder.drive_folder_id) {
              // The old drive_folder_id pointed to the wrong place; move files from old → new
              const listQuery = `'${folder.drive_folder_id}' in parents and trashed=false`;
              const listResp = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(listQuery)}&fields=files(id,name)&pageSize=500&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
              );

              if (listResp.ok) {
                const listData = await listResp.json();
                for (const df of listData.files || []) {
                  try {
                    await moveToFolder(accessToken, df.id, correctId, folder.drive_folder_id);
                    fixes.push(`Moved '${df.name}' from wrong '${folder.name}' to correct location in ${contract.name}`);
                  } catch (e: any) {
                    fixErrors.push(`Failed to move '${df.name}': ${e.message}`);
                  }
                }
              }

              // Trash old wrong folder
              try {
                await fetch(
                  `https://www.googleapis.com/drive/v3/files/${folder.drive_folder_id}?supportsAllDrives=true`,
                  {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trashed: true }),
                  },
                );
                fixes.push(`Trashed wrong Drive folder '${folder.name}' for ${contract.name}`);
              } catch (e: any) {
                fixErrors.push(`Failed to trash old folder '${folder.name}': ${e.message}`);
              }

              fixes.push(`Fixed '${folder.name}' → correct parent in ${contract.name}`);
            } else {
              // Already correct
            }
          } catch (e: any) {
            fixErrors.push(`Error fixing '${folder.name}' (${folder.drive_folder_id}) in ${contract?.name || folder.contract_id}: ${e.message}`);
          }
        }

        result = { success: true, fixes, errors: fixErrors };
        break;
      }

      case "fixOrphanDriveFiles": {
        // Fix files with drive_file_id in folders without drive_folder_id
        // Move them from wherever they are in Drive to the correct hierarchical location
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const fixes: string[] = [];
        const fixErrors: string[] = [];

        // Find all repository_files with drive_file_id in folders without drive_folder_id
        const { data: orphanFiles } = await sb
          .from('repository_files')
          .select('id, name, drive_file_id, folder_id')
          .not('drive_file_id', 'is', null);

        for (const file of orphanFiles || []) {
          const { data: folder } = await sb
            .from('repository_folders')
            .select('id, name, contract_id, drive_folder_id, parent_id')
            .eq('id', file.folder_id)
            .single();

          if (!folder || !folder.contract_id) continue;

          // Resolve correct Drive folder using the hierarchical function
          let correctDriveFolderId: string | null = null;
          try {
            correctDriveFolderId = await ensureDriveFolderForRepositoryFolder(
              sb,
              accessToken,
              folder.contract_id,
              folder.id,
            );
          } catch (e: any) {
            fixErrors.push(`Could not resolve folder for '${folder.name}': ${e.message}`);
            continue;
          }

          if (!correctDriveFolderId) continue;

          // Check where this file currently lives in Drive
          try {
            const metaResp = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.drive_file_id}?fields=id,name,parents,trashed&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );

            if (!metaResp.ok) {
              // File doesn't exist anymore — clear drive_file_id
              await sb.from('repository_files').update({ drive_file_id: null }).eq('id', file.id);
              fixes.push(`Cleared stale drive_file_id for '${file.name}'`);
              continue;
            }

            const meta = await metaResp.json();
            if (meta.trashed) {
              await sb.from('repository_files').update({ drive_file_id: null }).eq('id', file.id);
              fixes.push(`Cleared trashed drive_file_id for '${file.name}'`);
              continue;
            }

            const currentParent = meta.parents?.[0] || null;
            if (currentParent === correctDriveFolderId) {
              // Already in correct location
              continue;
            }

            // Move to correct folder
            await moveToFolder(accessToken, file.drive_file_id, correctDriveFolderId, currentParent || undefined);

            const { data: contractData } = await sb.from('contracts').select('name').eq('id', folder.contract_id).single();
            fixes.push(`Moved '${file.name}' to correct '${folder.name}' in ${contractData?.name || folder.contract_id}`);
          } catch (e: any) {
            fixErrors.push(`Error moving '${file.name}': ${e.message}`);
          }
        }

        result = { success: true, fixes, errors: fixErrors };
        break;
      }

      case "cleanupSyncedFiles": {
        // Remove files from Supabase Storage that are already synced to Drive
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const cleaned: string[] = [];
        const cleanErrors: string[] = [];

        // 1. Clean repository_files with drive_file_id and storage:// URL
        const { data: repoFiles } = await sb
          .from('repository_files')
          .select('id, name, url, drive_file_id')
          .not('drive_file_id', 'is', null)
          .like('url', 'storage://repository-files/%')
          .limit(500);

        for (const file of repoFiles || []) {
          try {
            const storagePath = file.url.replace('storage://repository-files/', '');
            const { error } = await sb.storage.from('repository-files').remove([storagePath]);
            if (error) {
              cleanErrors.push(`repo ${file.name}: ${error.message}`);
            } else {
              // Update URL to Drive URL
              const driveUrl = `https://drive.google.com/file/d/${file.drive_file_id}/view`;
              await sb.from('repository_files').update({ url: driveUrl }).eq('id', file.id);
              cleaned.push(`repo: ${file.name}`);
            }
          } catch (e: any) {
            cleanErrors.push(`repo ${file.name}: ${e.message}`);
          }
        }

        // 2. Clean general_folder_files with drive_file_id and storage:// URL
        const { data: generalFiles } = await sb
          .from('general_folder_files')
          .select('id, name, url, drive_file_id')
          .not('drive_file_id', 'is', null)
          .like('url', 'storage://repository-files/%')
          .limit(500);

        for (const file of generalFiles || []) {
          try {
            const storagePath = file.url.replace('storage://repository-files/', '');
            const { error } = await sb.storage.from('repository-files').remove([storagePath]);
            if (error) {
              cleanErrors.push(`general ${file.name}: ${error.message}`);
            } else {
              const driveUrl = `https://drive.google.com/file/d/${file.drive_file_id}/view`;
              await sb.from('general_folder_files').update({ url: driveUrl }).eq('id', file.id);
              cleaned.push(`general: ${file.name}`);
            }
          } catch (e: any) {
            cleanErrors.push(`general ${file.name}: ${e.message}`);
          }
        }

        // 3. Clean invoices with drive_file_id and storage:// attachment_url
        const { data: invoices } = await sb
          .from('invoices')
          .select('id, invoice_number, attachment_url, drive_file_id')
          .not('drive_file_id', 'is', null)
          .like('attachment_url', 'storage://repository-files/%')
          .limit(500);

        for (const inv of invoices || []) {
          try {
            const storagePath = inv.attachment_url.replace('storage://repository-files/', '');
            const { error } = await sb.storage.from('repository-files').remove([storagePath]);
            if (error) {
              cleanErrors.push(`invoice ${inv.invoice_number}: ${error.message}`);
            } else {
              const driveUrl = `https://drive.google.com/file/d/${inv.drive_file_id}/view`;
              await sb.from('invoices').update({ attachment_url: driveUrl }).eq('id', inv.id);
              cleaned.push(`invoice: ${inv.invoice_number}`);
            }
          } catch (e: any) {
            cleanErrors.push(`invoice ${inv.invoice_number}: ${e.message}`);
          }
        }

        // 4. Clean credit_notes with drive_file_id and storage:// attachment_url
        const { data: creditNotes } = await sb
          .from('credit_notes')
          .select('id, credit_note_number, attachment_url, drive_file_id')
          .not('drive_file_id', 'is', null)
          .like('attachment_url', 'storage://repository-files/%')
          .limit(500);

        for (const cn of creditNotes || []) {
          try {
            const storagePath = cn.attachment_url.replace('storage://repository-files/', '');
            const { error } = await sb.storage.from('repository-files').remove([storagePath]);
            if (error) {
              cleanErrors.push(`credit_note ${cn.credit_note_number}: ${error.message}`);
            } else {
              const driveUrl = `https://drive.google.com/file/d/${cn.drive_file_id}/view`;
              await sb.from('credit_notes').update({ attachment_url: driveUrl }).eq('id', cn.id);
              cleaned.push(`credit_note: ${cn.credit_note_number}`);
            }
          } catch (e: any) {
            cleanErrors.push(`credit_note ${cn.credit_note_number}: ${e.message}`);
          }
        }

        // 5. Clean purchase_orders with drive_file_id and storage:// attachment_url
        const { data: pos } = await sb
          .from('purchase_orders')
          .select('id, order_number, attachment_url, drive_file_id')
          .not('drive_file_id', 'is', null)
          .like('attachment_url', 'storage://repository-files/%')
          .limit(500);

        for (const po of pos || []) {
          try {
            const storagePath = po.attachment_url.replace('storage://repository-files/', '');
            const { error } = await sb.storage.from('repository-files').remove([storagePath]);
            if (error) {
              cleanErrors.push(`PO ${po.order_number}: ${error.message}`);
            } else {
              const driveUrl = `https://drive.google.com/file/d/${po.drive_file_id}/view`;
              await sb.from('purchase_orders').update({ attachment_url: driveUrl }).eq('id', po.id);
              cleaned.push(`PO: ${po.order_number}`);
            }
          } catch (e: any) {
            cleanErrors.push(`PO ${po.order_number}: ${e.message}`);
          }
        }

        const hasMore = (repoFiles?.length === 500) || (generalFiles?.length === 500) || 
                        (invoices?.length === 500) || (creditNotes?.length === 500) || (pos?.length === 500);

        result = {
          success: true,
          cleaned: cleaned.length,
          errors: cleanErrors.length,
          cleanedFiles: cleaned,
          errorDetails: cleanErrors,
          hasMore,
        };
        break;
      }

      case "syncPendingFiles": {
        // Upload repository_files with storage:// URLs and no drive_file_id to Drive
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        const targetContractId = params.contractId || null;
        const batchSize = params.batchSize || 20;
        const fetchLimit = Math.max(batchSize * 5, 100);

        // Find pending files (no drive_file_id, any URL format we can map back to repository-files)
        // Bug 1 fix: also exclude files already being synced
        let query = sb
          .from('repository_files')
          .select('id, name, url, folder_id, file_type')
          .is('drive_file_id', null)
          .is('sync_status', null)
          .not('url', 'is', null)
          .order('uploaded_at', { ascending: false })
          .limit(fetchLimit);

        if (targetContractId) {
          const { data: contractFolders } = await sb
            .from('repository_folders')
            .select('id')
            .eq('contract_id', targetContractId);
          
          if (contractFolders && contractFolders.length > 0) {
            const folderIds = contractFolders.map((f: any) => f.id);
            query = query.in('folder_id', folderIds);
          }
        }

        const { data: pendingFilesRaw, error: pfErr } = await query;
        if (pfErr) throw pfErr;

        const pendingFiles = (pendingFilesRaw || [])
          .filter((f: any) => !!extractRepositoryStoragePath(f.url))
          .slice(0, batchSize);

        const uploaded: string[] = [];
        const syncErrors: string[] = [];

        // Bug 3 fix: extract single-file processing for parallel batching
        async function processSingleFile(file: any): Promise<{ ok: boolean; msg: string }> {
          // Bug 1 fix: optimistic claim — mark as 'syncing' atomically
          const { data: claimData, error: claimErr } = await sb
            .from('repository_files')
            .update({ sync_status: 'syncing', synced_at: new Date().toISOString() })
            .eq('id', file.id)
            .is('drive_file_id', null)
            .is('sync_status', null)
            .select('id');

          if (claimErr || !claimData || claimData.length === 0) {
            return { ok: false, msg: `Skipped (already claimed): ${file.name}` };
          }

          try {
            const { data: folder } = await sb
              .from('repository_folders')
              .select('id, name, contract_id, drive_folder_id')
              .eq('id', file.folder_id)
              .single();

            if (!folder || !folder.contract_id) {
              throw new Error(`No folder/contract for file: ${file.name}`);
            }

            const storagePath = extractRepositoryStoragePath(file.url);
            if (!storagePath) {
              throw new Error(`Unsupported storage URL format: ${file.name}`);
            }

            const storageContractId = extractContractIdFromRepositoryPath(storagePath);
            if (
              storageContractId &&
              storageContractId !== (folder.contract_id || '').toLowerCase()
            ) {
              throw new Error(
                `Contract mismatch for ${file.name}: storage contract ${storageContractId} != folder contract ${folder.contract_id}`,
              );
            }

            let resolvedStoragePath = storagePath;

            let { data: fileData, error: dlErr } = await sb.storage
              .from('repository-files')
              .download(resolvedStoragePath);

            if ((dlErr || !fileData) && folder.contract_id && resolvedStoragePath.startsWith(`contracts/${folder.contract_id}/`)) {
              const contractDir = `contracts/${folder.contract_id}`;
              const targetFileName = safeDecodeURIComponent(resolvedStoragePath.split('/').pop() || file.name);

              const { data: contractFiles, error: listErr } = await sb.storage
                .from('repository-files')
                .list(contractDir, { limit: 1000 });

              if (!listErr && contractFiles && contractFiles.length > 0) {
                const fallbackFile = contractFiles.find((entry: any) => {
                  const entryName = entry?.name || '';
                  const decodedEntryName = safeDecodeURIComponent(entryName);
                  return (
                    entryName === targetFileName ||
                    decodedEntryName === targetFileName ||
                    entryName.endsWith(targetFileName) ||
                    decodedEntryName.endsWith(targetFileName)
                  );
                });

                if (fallbackFile?.name) {
                  resolvedStoragePath = `${contractDir}/${fallbackFile.name}`;
                  const retry = await sb.storage
                    .from('repository-files')
                    .download(resolvedStoragePath);
                  fileData = retry.data;
                  dlErr = retry.error;
                }
              }
            }

            if (dlErr || !fileData) {
              throw new Error(`Download failed: ${file.name} - ${dlErr?.message || 'No data'}`);
            }

            const resolvedStorageContractId = extractContractIdFromRepositoryPath(resolvedStoragePath);
            if (
              resolvedStorageContractId &&
              resolvedStorageContractId !== (folder.contract_id || '').toLowerCase()
            ) {
              throw new Error(
                `Resolved path mismatch for ${file.name}: storage contract ${resolvedStorageContractId} != folder contract ${folder.contract_id}`,
              );
            }

            let driveFolderId: string | null = folder.drive_folder_id;
            if (!driveFolderId) {
              driveFolderId = await ensureDriveFolderForRepositoryFolder(
                sb, accessToken, folder.contract_id, folder.id
              );
            }

            if (!driveFolderId) {
              throw new Error(`No Drive folder for ${file.name} in ${folder.name}`);
            }

            const fileBytes = new Uint8Array(await fileData.arrayBuffer());
            const mimeType = file.name.endsWith('.pdf') ? 'application/pdf'
              : file.name.endsWith('.jpeg') || file.name.endsWith('.jpg') ? 'image/jpeg'
              : file.name.endsWith('.png') ? 'image/png'
              : file.name.endsWith('.doc') ? 'application/msword'
              : file.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : file.name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/octet-stream';

            const driveFile = await uploadFileToDrive(accessToken, file.name, fileBytes, mimeType, driveFolderId);
            const fileUrl = driveFile.webViewLink || driveFile.webContentLink || `https://drive.google.com/file/d/${driveFile.id}/view`;

            // Update record with Drive info + mark as synced (Bug 1)
            await sb
              .from('repository_files')
              .update({
                url: fileUrl,
                drive_file_id: driveFile.id,
                sync_status: 'synced',
              })
              .eq('id', file.id);

            await cleanupStorageFile(sb, `storage://repository-files/${resolvedStoragePath}`);

            return { ok: true, msg: `${file.name} → ${folder.name}` };
          } catch (e: any) {
            // Bug 1 fix: revert sync_status on failure
            await sb
              .from('repository_files')
              .update({ sync_status: null, synced_at: null })
              .eq('id', file.id);
            throw e;
          }
        }

        // Bug 3 fix: process in parallel batches
        const concurrency = params.concurrency || 5;
        for (let i = 0; i < pendingFiles.length; i += concurrency) {
          const batch = pendingFiles.slice(i, i + concurrency);
          const results = await Promise.allSettled(batch.map((f: any) => processSingleFile(f)));
          for (const r of results) {
            if (r.status === 'fulfilled') {
              if (r.value.ok) uploaded.push(r.value.msg);
              else syncErrors.push(r.value.msg);
            } else {
              syncErrors.push(r.reason?.message || 'Unknown error');
            }
          }
        }

        const hasMore = (pendingFilesRaw || []).length >= fetchLimit || (pendingFilesRaw || []).length > pendingFiles.length;

        result = {
          success: true,
          uploaded: uploaded.length,
          errors: syncErrors.length,
          uploadedFiles: uploaded,
          errorDetails: syncErrors,
          hasMore,
        };
        break;
      }

      // ── Clean up orphan Drive folders (e.g. "Información Patentes") ──────
      case "cleanupOrphanDriveFolders": {
        const { folderNames } = params as { folderNames?: string[] };
        if (!folderNames || !Array.isArray(folderNames) || folderNames.length === 0) {
          throw new Error("folderNames array is required");
        }

        const accessTokenClean = await getAccessToken();

        const deletedFolders: string[] = [];
        const cleanErrors: string[] = [];

        // Search globally in Drive for folders with these names (paginated)
        for (const targetName of folderNames) {
          try {
            const sanitizedTarget = targetName.replace(/'/g, "\\'");
            const searchQ = `name='${sanitizedTarget}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            let pageToken: string | undefined = undefined;
            do {
              const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&fields=nextPageToken,files(id,name,parents)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives` + (pageToken ? `&pageToken=${pageToken}` : '');
              const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${accessTokenClean}` } });
              const searchData = await searchRes.json();

              for (const folder of (searchData.files || [])) {
                const trashRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${folder.id}?supportsAllDrives=true`,
                  {
                    method: "PATCH",
                    headers: {
                      Authorization: `Bearer ${accessTokenClean}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ trashed: true }),
                  }
                );
                if (trashRes.ok) {
                  deletedFolders.push(`${folder.name} (${folder.id}) parent=${(folder.parents||[])[0]||'?'}`);
                } else {
                  const errText = await trashRes.text().catch(() => '');
                  cleanErrors.push(`Failed to trash ${folder.name} (${folder.id}): ${trashRes.status} ${errText}`);
                }
              }
              pageToken = searchData.nextPageToken;
            } while (pageToken);
          } catch (e: any) {
            cleanErrors.push(`Search error for '${targetName}': ${e.message}`);
          }
        }

        result = { success: true, deleted: deletedFolders, errors: cleanErrors };
        break;
      }

      // ── Verify Drive files exist and clean stale references ──────────────
      case "verifyDriveFiles": {
        const accessTokenVerify = await getAccessToken();
        const sbVerify = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        const { data: driveFiles } = await sbVerify
          .from("repository_files")
          .select("id, name, drive_file_id, url, folder_id")
          .not("drive_file_id", "is", null);

        const { data: generalFiles } = await sbVerify
          .from("general_folder_files")
          .select("id, name, drive_file_id, url, folder_id")
          .not("drive_file_id", "is", null);

        const staleRepo: string[] = [];
        const staleGeneral: string[] = [];
        let verifiedRepo = 0;
        let verifiedGeneral = 0;

        const verifyBatch = async (files: any[], tableName: string, staleList: string[]) => {
          let count = 0;
          for (const file of (files || [])) {
            try {
              const checkRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${file.drive_file_id}?fields=id,trashed`,
                { headers: { Authorization: `Bearer ${accessTokenVerify}` } }
              );

              if (checkRes.status === 404) {
                await sbVerify
                  .from(tableName)
                  .update({ drive_file_id: null, url: `stale-drive://${file.drive_file_id}` })
                  .eq("id", file.id);
                staleList.push(`${file.name} (${file.drive_file_id})`);
              } else if (checkRes.ok) {
                const fileData = await checkRes.json();
                if (fileData.trashed) {
                  await sbVerify
                    .from(tableName)
                    .update({ drive_file_id: null, url: `stale-drive://${file.drive_file_id}` })
                    .eq("id", file.id);
                  staleList.push(`${file.name} (trashed, ${file.drive_file_id})`);
                } else {
                  count++;
                }
              }
            } catch (_e: any) {
              // Skip on error
            }
          }
          return count;
        };

        verifiedRepo = await verifyBatch(driveFiles, "repository_files", staleRepo);
        verifiedGeneral = await verifyBatch(generalFiles, "general_folder_files", staleGeneral);

        result = {
          success: true,
          verifiedRepo,
          verifiedGeneral,
          staleRepo,
          staleGeneral,
          totalStale: staleRepo.length + staleGeneral.length,
        };
        break;
      }

      // ── Remove stale-drive:// file records from DB ─────────────────────
      case "removeStaleFileRecords": {
        const sbStale = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

        const { data: staleRepoFiles } = await sbStale
          .from("repository_files")
          .select("id, name")
          .like("url", "stale-drive://%");

        const { data: staleGeneralFiles } = await sbStale
          .from("general_folder_files")
          .select("id, name")
          .like("url", "stale-drive://%");

        const removedRepo: string[] = [];
        const removedGeneral: string[] = [];

        for (const f of (staleRepoFiles || [])) {
          await sbStale.from("repository_files").delete().eq("id", f.id);
          removedRepo.push(f.name);
        }
        for (const f of (staleGeneralFiles || [])) {
          await sbStale.from("general_folder_files").delete().eq("id", f.id);
          removedGeneral.push(f.name);
        }

        result = {
          success: true,
          removedRepo,
          removedGeneral,
          totalRemoved: removedRepo.length + removedGeneral.length,
        };
        break;
      }

      case "syncPendingPatentFiles": {
        // Batch migrate patent_documents with storage:// URLs to Google Drive
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sb = createClient(supabaseUrl, supabaseKey);

        // Find all patent_documents with storage:// in document_url
        const { data: patentDocs, error: pdErr } = await sb
          .from('patent_documents')
          .select('id, contract_id, checklist_item_id, document_url')
          .like('document_url', '%storage://%');

        if (pdErr) throw pdErr;

        const uploaded: string[] = [];
        const syncErrors: string[] = [];
        let updatedCount = 0;

        for (const doc of (patentDocs || [])) {
          try {
            const segments = (doc.document_url || '').split('|||').filter(Boolean);
            const newSegments: string[] = [];
            let changed = false;

            for (const seg of segments) {
              if (!seg.startsWith('storage://')) {
                newSegments.push(seg);
                continue;
              }

              // Extract storage path
              const storagePath = extractRepositoryStoragePath(seg);
              if (!storagePath) {
                console.warn("syncPendingPatentFiles: invalid storage URL, keeping as-is", seg);
                newSegments.push(seg);
                continue;
              }

              // Find "Rentas y Patentes" folder for this contract
              let patentFolder: any = null;
              const { data: pf } = await sb
                .from('repository_folders')
                .select('id, drive_folder_id')
                .eq('folder_type', 'rentas_y_patentes')
                .eq('contract_id', doc.contract_id)
                .limit(1)
                .single();

              patentFolder = pf;

              if (!patentFolder) {
                // Auto-create
                const { data: parentFolder } = await sb
                  .from('repository_folders')
                  .select('id')
                  .eq('contract_id', doc.contract_id)
                  .is('parent_id', null)
                  .limit(1)
                  .single();

                const { data: created, error: createErr } = await sb
                  .from('repository_folders')
                  .insert({
                    contract_id: doc.contract_id,
                    name: 'Rentas y Patentes',
                    folder_type: 'rentas_y_patentes',
                    is_base_folder: !parentFolder,
                    parent_id: parentFolder?.id || null,
                  })
                  .select('id, drive_folder_id')
                  .single();

                if (createErr || !created) {
                  syncErrors.push(`No patent folder for contract ${doc.contract_id}`);
                  newSegments.push(seg);
                  continue;
                }
                patentFolder = created;
              }

              let targetDriveFolderId = patentFolder.drive_folder_id;
              if (!targetDriveFolderId) {
                targetDriveFolderId = await ensureDriveFolderForRepositoryFolder(
                  sb, accessToken, doc.contract_id, patentFolder.id,
                );
              }

              if (!targetDriveFolderId) {
                syncErrors.push(`No Drive folder for contract ${doc.contract_id}`);
                newSegments.push(seg);
                continue;
              }

              // Download from storage
              const { data: fileData, error: dlErr } = await sb.storage
                .from('repository-files')
                .download(storagePath);

              if (dlErr || !fileData) {
                console.warn("syncPendingPatentFiles: file not found", { storagePath, error: dlErr?.message });
                syncErrors.push(`File not found: ${storagePath}`);
                newSegments.push(seg);
                continue;
              }

              const fileName = storagePath.split('/').pop() || 'file';
              const mimeType = fileName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
              const binaryContent = new Uint8Array(await fileData.arrayBuffer());
              const driveFile = await uploadFileToDrive(accessToken, fileName, binaryContent, mimeType, targetDriveFolderId);
              const driveUrl = driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`;

              // Also create repository_files record
              const ext = fileName.includes('.') ? fileName.split('.').pop() : null;
              await sb.from('repository_files').insert({
                folder_id: patentFolder.id,
                name: fileName,
                url: driveUrl,
                file_type: ext,
                drive_file_id: driveFile.id,
              });

              await cleanupStorageFile(sb, seg);
              newSegments.push(driveUrl);
              changed = true;
              uploaded.push(`${fileName} (contract ${doc.contract_id})`);
            }

            if (changed) {
              const newDocUrl = newSegments.join('|||');
              await sb
                .from('patent_documents')
                .update({ document_url: newDocUrl })
                .eq('id', doc.id);
              updatedCount++;
            }
          } catch (e: any) {
            syncErrors.push(`Doc ${doc.id}: ${e.message}`);
          }
        }

        result = {
          success: true,
          totalDocs: (patentDocs || []).length,
          updatedDocs: updatedCount,
          uploadedFiles: uploaded.length,
          errors: syncErrors.length,
          uploadedDetails: uploaded,
          errorDetails: syncErrors,
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`Action ${action} completed successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in google-drive function:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
