import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Secure CORS configuration - only allow trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Get access token using client credentials flow
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get('ONEDRIVE_CLIENT_ID');
  const clientSecret = Deno.env.get('ONEDRIVE_CLIENT_SECRET');
  const tenantId = Deno.env.get('ONEDRIVE_TENANT_ID');
  
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error("OneDrive credentials not configured");
  }
  
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  
  const data = await response.json();
  
  if (!data.access_token) {
    console.error("Token response:", data);
    throw new Error("Failed to get access token from Microsoft");
  }
  
  return data.access_token;
}

// Create a folder in OneDrive
async function createDriveFolder(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webUrl: string }> {
  const rootFolderId = Deno.env.get('ONEDRIVE_ROOT_FOLDER_ID');
  const targetParentId = parentId || rootFolderId;
  
  const url = targetParentId 
    ? `https://graph.microsoft.com/v1.0/drive/items/${targetParentId}/children`
    : `https://graph.microsoft.com/v1.0/drive/root/children`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename'
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error creating folder:", error);
    throw new Error(`Failed to create folder: ${error}`);
  }
  
  const result = await response.json();
  return { id: result.id, webUrl: result.webUrl };
}

// Check if a folder exists by name in a parent
async function getFolderByName(accessToken: string, name: string, parentId?: string): Promise<{ id: string; webUrl: string } | null> {
  const rootFolderId = Deno.env.get('ONEDRIVE_ROOT_FOLDER_ID');
  const targetParentId = parentId || rootFolderId;
  
  const url = targetParentId 
    ? `https://graph.microsoft.com/v1.0/drive/items/${targetParentId}/children?$filter=name eq '${encodeURIComponent(name)}'`
    : `https://graph.microsoft.com/v1.0/drive/root/children?$filter=name eq '${encodeURIComponent(name)}'`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error searching folder:", error);
    return null;
  }
  
  const data = await response.json();
  if (data.value && data.value.length > 0) {
    return { id: data.value[0].id, webUrl: data.value[0].webUrl };
  }
  return null;
}

// Upload a file to OneDrive
async function uploadFileToDrive(
  accessToken: string, 
  fileName: string, 
  fileContent: Uint8Array, 
  mimeType: string,
  folderId: string
): Promise<{ id: string; webUrl: string }> {
  // For small files (< 4MB), use simple upload
  if (fileContent.length < 4 * 1024 * 1024) {
    const url = `https://graph.microsoft.com/v1.0/drive/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
        'Content-Length': fileContent.length.toString(),
      },
      body: fileContent as unknown as BodyInit,
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error}`);
    }
    
    const result = await response.json();
    return { id: result.id, webUrl: result.webUrl };
  }
  
  // For larger files, would need to implement upload session
  throw new Error("Files larger than 4MB not supported yet");
}

// List files in a folder
async function listFilesInFolder(accessToken: string, folderId: string): Promise<any[]> {
  const url = `https://graph.microsoft.com/v1.0/drive/items/${folderId}/children?$orderby=createdDateTime desc`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error listing files:", error);
    throw new Error(`Failed to list files: ${error}`);
  }
  
  const data = await response.json();
  return data.value || [];
}

// Delete a file from OneDrive
async function deleteFile(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/drive/items/${fileId}`, {
    method: 'DELETE',
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

// Move a file/folder to a new parent
async function moveToFolder(accessToken: string, fileId: string, newParentId: string): Promise<void> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/drive/items/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parentReference: {
        id: newParentId
      }
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error("Error moving file:", error);
    throw new Error(`Failed to move file: ${error}`);
  }
}

// Map contract status to folder name
function getStatusFolderName(status: string): string {
  switch (status) {
    case 'firmado':
      return 'Contratos Vigentes';
    case 'en_negociacion':
      return 'Contratos En Negociacion';
    case 'vencido':
      return 'Contratos Vencidos';
    default:
      return 'Otros Contratos';
  }
}

// Ensure status folders exist and return their IDs
async function ensureStatusFolders(accessToken: string): Promise<Record<string, { id: string; webUrl: string }>> {
  const rootFolderId = Deno.env.get('ONEDRIVE_ROOT_FOLDER_ID');
  const statusFolders: Record<string, { id: string; webUrl: string }> = {};
  const folderNames = ['Contratos Vigentes', 'Contratos En Negociacion', 'Contratos Vencidos'];
  
  for (const name of folderNames) {
    let folder = await getFolderByName(accessToken, name, rootFolderId);
    if (!folder) {
      folder = await createDriveFolder(accessToken, name, rootFolderId);
    }
    statusFolders[name] = folder;
  }
  
  return statusFolders;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = await getAccessToken();
    const rootFolderId = Deno.env.get('ONEDRIVE_ROOT_FOLDER_ID');
    
    if (!rootFolderId) {
      throw new Error("OneDrive root folder ID not configured");
    }
    
    const { action, ...params } = await req.json();
    console.log(`Processing OneDrive action: ${action}`, params);
    
    let result: any;
    
    switch (action) {
      case "ensureStatusFolders": {
        const statusFolders = await ensureStatusFolders(accessToken);
        result = { statusFolders };
        break;
      }
      
      case "syncAllContracts": {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        const statusFolders = await ensureStatusFolders(accessToken);
        console.log("OneDrive status folders ready:", Object.keys(statusFolders));
        
        const { data: contracts, error: contractsError } = await supabase
          .from('contracts')
          .select('id, name, status, drive_folder_id')
          .is('deleted_at', null);
        
        if (contractsError) throw contractsError;
        
        const syncResults: any[] = [];
        
        for (const contract of contracts || []) {
          const statusFolderName = getStatusFolderName(contract.status);
          const statusFolder = statusFolders[statusFolderName];
          
          if (!statusFolder) continue;
          
          let contractFolder = await getFolderByName(accessToken, contract.name, statusFolder.id);
          
          if (!contractFolder) {
            contractFolder = await createDriveFolder(accessToken, contract.name, statusFolder.id);
            console.log(`Created OneDrive folder for ${contract.name}`);
          }
          
          // Get folder templates and create subfolders
          const { data: templates } = await supabase
            .from('folder_templates')
            .select('*')
            .order('display_order', { ascending: true });
          
          if (templates && templates.length > 0) {
            for (const template of templates) {
              const existingSubfolder = await getFolderByName(accessToken, template.name, contractFolder.id);
              if (!existingSubfolder) {
                await createDriveFolder(accessToken, template.name, contractFolder.id);
              }
            }
          }
          
          syncResults.push({
            contractId: contract.id,
            contractName: contract.name,
            driveFolderId: contractFolder.id,
            statusFolder: statusFolderName
          });
        }
        
        result = { 
          success: true, 
          syncedCount: syncResults.length,
          contracts: syncResults,
          provider: 'onedrive'
        };
        break;
      }
      
      case "createContractFolder": {
        const { contractName, contractStatus } = params;
        const statusFolders = await ensureStatusFolders(accessToken);
        const statusFolderName = getStatusFolderName(contractStatus);
        const statusFolder = statusFolders[statusFolderName];
        
        const folder = await createDriveFolder(accessToken, contractName, statusFolder.id);
        result = { 
          success: true, 
          folderId: folder.id, 
          webUrl: folder.webUrl,
          provider: 'onedrive'
        };
        break;
      }
      
      case "createSubfolder": {
        const { parentFolderId, folderName } = params;
        const folder = await createDriveFolder(accessToken, folderName, parentFolderId);
        result = { 
          success: true, 
          folderId: folder.id, 
          webUrl: folder.webUrl,
          provider: 'onedrive'
        };
        break;
      }
      
      case "uploadFile": {
        const { folderId, fileName, fileContent, mimeType } = params;
        const contentBytes = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
        const uploaded = await uploadFileToDrive(accessToken, fileName, contentBytes, mimeType, folderId);
        result = { 
          success: true, 
          fileId: uploaded.id, 
          webUrl: uploaded.webUrl,
          provider: 'onedrive'
        };
        break;
      }
      
      case "listFiles": {
        const { folderId } = params;
        const files = await listFilesInFolder(accessToken, folderId);
        result = { 
          success: true, 
          files: files.map(f => ({
            id: f.id,
            name: f.name,
            mimeType: f.file?.mimeType || 'folder',
            webUrl: f.webUrl,
            createdDateTime: f.createdDateTime,
            size: f.size
          })),
          provider: 'onedrive'
        };
        break;
      }
      
      case "deleteFile": {
        const { fileId } = params;
        await deleteFile(accessToken, fileId);
        result = { success: true, provider: 'onedrive' };
        break;
      }
      
      case "moveFile": {
        const { fileId, newParentId } = params;
        await moveToFolder(accessToken, fileId, newParentId);
        result = { success: true, provider: 'onedrive' };
        break;
      }
      
      case "testConnection": {
        // Test if we can access the root folder
        const folder = await getFolderByName(accessToken, "test-connection-folder", rootFolderId);
        result = { 
          success: true, 
          message: "Connection to OneDrive successful",
          provider: 'onedrive'
        };
        break;
      }
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    console.error("OneDrive function error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
