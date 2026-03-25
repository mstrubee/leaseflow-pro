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
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_OAUTH_REFRESH_TOKEN');

  if (clientId && clientSecret && refreshToken) {
    return getAccessTokenFromOAuth(clientId, clientSecret, refreshToken);
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

async function getFolderByName(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string } | null> {
  const normalizedName = sanitizeDriveName(name);
  const sanitizedName = sanitizeForDriveQuery(normalizedName);
  let query = `name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Folder search failed:", response.status);
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
    const key = sanitizeDriveName(f.name);
    const createdTime: string | undefined = f.createdTime;
    const existing = folders[key];
    if (!existing) {
      folders[key] = { id: f.id, webViewLink: f.webViewLink, createdTime };
      continue;
    }
    duplicates.push({ key, keptId: existing.id, dupId: f.id });
    if (createdTime && existing.createdTime && createdTime < existing.createdTime) {
      folders[key] = { id: f.id, webViewLink: f.webViewLink, createdTime };
    }
  }

  if (duplicates.length > 0) {
    console.warn(`Found ${duplicates.length} duplicate folder(s) under parent ${parentId}`, duplicates.slice(0, 25));
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
      const driveKey = sanitizeDriveName(child.name);
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

  const fileBase64 = btoa(String.fromCharCode(...fileContent));
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
      const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID no está configurado");

      const { redirectUri } = params;
      if (!redirectUri) throw new Error("redirectUri es requerido");

      const url = buildOAuthUrl(clientId, redirectUri);
      return new Response(JSON.stringify({ url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "oauthCallback") {
      const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
      if (!clientId || !clientSecret) throw new Error("OAuth credentials not configured");

      const { code, redirectUri } = params;
      if (!code || !redirectUri) throw new Error("code and redirectUri are required");

      const tokens = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);

      // Store the refresh token as a Supabase secret via the DB
      // We'll store it in the cloud_storage_tokens table for now
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Store in a known location - use 'google_drive_oauth' as connection identifier
      const { data: existingConn } = await supabase
        .from('cloud_storage_connections')
        .select('id')
        .eq('provider', 'google_drive_oauth')
        .limit(1)
        .single();

      let connectionId: string;

      if (existingConn) {
        connectionId = existingConn.id;
      } else {
        const { data: newConn, error: connError } = await supabase
          .from('cloud_storage_connections')
          .insert({ provider: 'google_drive_oauth', name: 'Google Drive OAuth', is_active: true })
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

    if (action === "checkOAuthStatus") {
      const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: conn } = await supabase
        .from('cloud_storage_connections')
        .select('id')
        .eq('provider', 'google_drive_oauth')
        .limit(1)
        .single();

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

    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    if (!rootFolderId) throw new Error("Google Drive root folder ID not configured");

    // Try to get access token - first check DB for OAuth refresh token, then env
    let accessToken: string;
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');

    if (clientId && clientSecret) {
      // Check DB for refresh token
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: conn } = await supabase
        .from('cloud_storage_connections')
        .select('id')
        .eq('provider', 'google_drive_oauth')
        .limit(1)
        .single();

      if (conn) {
        const { data: tokenData } = await supabase
          .from('cloud_storage_tokens')
          .select('refresh_token')
          .eq('connection_id', conn.id)
          .single();

        if (tokenData?.refresh_token) {
          accessToken = await getAccessTokenFromOAuth(clientId, clientSecret, tokenData.refresh_token);
        } else {
          accessToken = await getAccessToken();
        }
      } else {
        accessToken = await getAccessToken();
      }
    } else {
      accessToken = await getAccessToken();
    }

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

            if (contract.drive_folder_id) {
              const meta = await getFolderById(accessToken, contract.drive_folder_id);
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
              let existingFolder = await getFolderByName(accessToken, contract.name, statusFolder.id);

              if (existingFolder) {
                contractFolder = existingFolder;
              } else {
                existingFolder = await getFolderByName(accessToken, contract.name, rootFolderId);

                if (existingFolder) {
                  await moveToFolder(accessToken, existingFolder.id, statusFolder.id, rootFolderId);
                  contractFolder = existingFolder;
                  console.log(`Moved ${contract.name} to ${statusFolderName}`);
                } else {
                  for (const [folderName, folder] of Object.entries(statusFolders)) {
                    if (folderName !== statusFolderName) {
                      existingFolder = await getFolderByName(accessToken, contract.name, folder.id);
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

        if (contract.drive_folder_id) {
          const meta = await getFolderById(accessToken, contract.drive_folder_id);
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
            const existingFolder = await getFolderByName(accessToken, contract.name, folder.id);
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
            const rootFolder = await getFolderByName(accessToken, contract.name, rootFolderId);
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

        const statusFolders = await ensureStatusFolders(accessToken, rootFolderId);
        const statusFolderName = getStatusFolderName(status || 'en_negociacion');
        const statusFolder = statusFolders[statusFolderName];

        const existingFolder = await getFolderByName(accessToken, contractName, statusFolder.id);

        if (existingFolder) {
          result = {
            exists: true,
            projectFolderId: existingFolder.id,
            webViewLink: existingFolder.webViewLink,
            message: `La carpeta "${contractName}" ya existe en Google Drive`,
          };
        } else {
          const projectFolder = await createDriveFolder(accessToken, contractName, statusFolder.id);

          const createdSubfolders: any[] = [];
          for (const subfolder of subfolders || []) {
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
        const rootFolderResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${rootFolderId}?fields=id,name,webViewLink&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (!rootFolderResponse.ok) {
          const error = await rootFolderResponse.text();
          throw new Error(`Cannot access root folder: ${error}`);
        }

        const rootFolderData = await rootFolderResponse.json();
        result = {
          success: true,
          message: "Conexión exitosa con Google Drive",
          authMethod: (Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') && Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')) ? 'oauth' : 'service_account',
          rootFolder: {
            id: rootFolderData.id,
            name: rootFolderData.name,
            webViewLink: rootFolderData.webViewLink,
          },
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
