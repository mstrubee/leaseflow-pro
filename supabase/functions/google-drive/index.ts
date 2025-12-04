import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Get access token from service account
async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  // Create JWT header
  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  // Create JWT payload
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: credentials.token_uri,
    iat: now,
    exp: exp
  };

  // Base64url encode header and payload
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  // Import the private key
  const privateKeyPem = credentials.private_key;
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  
  // Sign the input
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  const jwt = `${signatureInput}.${signatureB64}`;
  
  // Exchange JWT for access token
  const tokenResponse = await fetch(credentials.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    console.error("Token response:", tokenData);
    throw new Error("Failed to get access token from Google");
  }
  
  return tokenData.access_token;
}

// Create a folder in Google Drive
async function createDriveFolder(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  const metadata: any = {
    name: name,
    mimeType: "application/vnd.google-apps.folder",
  };
  
  if (parentId) {
    metadata.parents = [parentId];
  }
  
  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error creating folder:", error);
    throw new Error(`Failed to create folder: ${error}`);
  }
  
  return await response.json();
}

// Check if a folder exists by name in a parent
async function getFolderByName(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string } | null> {
  let query = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error searching folder:", error);
    throw new Error(`Failed to search folder: ${error}`);
  }
  
  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

// Upload a file to Google Drive
async function uploadFileToDrive(
  accessToken: string, 
  fileName: string, 
  fileContent: Uint8Array, 
  mimeType: string,
  folderId: string
): Promise<{ id: string; webViewLink: string; webContentLink: string }> {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };
  
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
    "Content-Transfer-Encoding: base64\r\n\r\n"
  );
  
  const fileBase64 = btoa(String.fromCharCode(...fileContent));
  const fileBytes = new TextEncoder().encode(fileBase64);
  const closeBytes = new TextEncoder().encode(closeDelimiter);
  
  const requestBody = new Uint8Array(metadataBytes.length + fileBytes.length + closeBytes.length);
  requestBody.set(metadataBytes, 0);
  requestBody.set(fileBytes, metadataBytes.length);
  requestBody.set(closeBytes, metadataBytes.length + fileBytes.length);
  
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
      },
      body: requestBody,
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error uploading file:", error);
    throw new Error(`Failed to upload file: ${error}`);
  }
  
  return await response.json();
}

// List files in a folder
async function listFilesInFolder(accessToken: string, folderId: string): Promise<any[]> {
  const query = `'${folderId}' in parents and trashed=false`;
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,webContentLink,createdTime,size)&orderBy=createdTime desc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error listing files:", error);
    throw new Error(`Failed to list files: ${error}`);
  }
  
  const data = await response.json();
  return data.files || [];
}

// Delete a file from Google Drive
async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok && response.status !== 204) {
    const error = await response.text();
    console.error("Error deleting file:", error);
    throw new Error(`Failed to delete file: ${error}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountKeyStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    
    if (!serviceAccountKeyStr) {
      throw new Error("Google Service Account key not configured");
    }
    
    if (!rootFolderId) {
      throw new Error("Google Drive root folder ID not configured");
    }
    
    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountKeyStr);
    const accessToken = await getAccessToken(credentials);
    
    const { action, ...params } = await req.json();
    console.log(`Processing action: ${action}`, params);
    
    let result: any;
    
    switch (action) {
      case "ensureProjectStructure": {
        const { contractId, contractName, subfolders } = params;
        
        // Check if project folder already exists
        const existingFolder = await getFolderByName(accessToken, contractName, rootFolderId);
        
        if (existingFolder) {
          // Return warning that folder exists
          result = { 
            exists: true,
            projectFolderId: existingFolder.id,
            webViewLink: existingFolder.webViewLink,
            message: `La carpeta "${contractName}" ya existe en Google Drive`
          };
        } else {
          // Create project folder
          const projectFolder = await createDriveFolder(accessToken, contractName, rootFolderId);
          
          // Create subfolders
          const createdSubfolders: any[] = [];
          for (const subfolder of subfolders || []) {
            const subFolderResult = await createDriveFolder(accessToken, subfolder.name, projectFolder.id);
            createdSubfolders.push({
              localId: subfolder.id,
              name: subfolder.name,
              driveFolderId: subFolderResult.id,
              webViewLink: subFolderResult.webViewLink
            });
          }
          
          result = {
            exists: false,
            projectFolderId: projectFolder.id,
            webViewLink: projectFolder.webViewLink,
            subfolders: createdSubfolders
          };
        }
        break;
      }
      
      case "createFolder": {
        const { name, parentDriveFolderId } = params;
        
        // Check if already exists
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
        
        // Decode base64 file content
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
        
        // Get or create the folder
        let folder = await getFolderByName(accessToken, name, parentDriveFolderId);
        
        if (!folder) {
          folder = await createDriveFolder(accessToken, name, parentDriveFolderId);
        }
        
        result = folder;
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
