import formidable from 'formidable';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Generate secure ID
function generateSecureId(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

// Detect category
function getCategory(mimeType: string, filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  return 'other';
}

// Cloud storage & multi-instance metadata sync helpers
async function uploadFileToCloud(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string | null> {
  try {
    const blob = new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' });
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '72h');
    formData.append('fileToUpload', blob, fileName || 'file');

    console.log('[CLOUD FILE UPLOAD] Attempting to upload file to cloud storage:', fileName);
    
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QRVault/1.0',
      },
      body: formData,
      signal: AbortSignal.timeout(10000),
    });
    
    console.log('[CLOUD FILE UPLOAD] Response status:', res.status);
    
    if (res.ok) {
      const url = (await res.text()).trim();
      console.log('[CLOUD FILE UPLOAD] Cloud URL received:', url);
      if (url.startsWith('http')) {
        return url;
      }
    } else {
      console.log('[CLOUD FILE UPLOAD] Response not OK:', res.status, res.statusText);
    }
  } catch (e: any) {
    console.error('[CLOUD FILE UPLOAD ERROR]', e?.message || String(e));
  }
  return null;
}

async function saveMetaToCloud(record: any): Promise<string | null> {
  try {
    const jsonStr = JSON.stringify(record);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '72h');
    formData.append('fileToUpload', blob, 'metadata.json');

    console.log('[CLOUD SAVE] Attempting to upload metadata to cloud storage');
    
    const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QRVault/1.0',
      },
      body: formData,
      signal: AbortSignal.timeout(10000),
    });
    
    console.log('[CLOUD SAVE] Response status:', res.status);
    
    if (res.ok) {
      const url = (await res.text()).trim();
      console.log('[CLOUD SAVE] Cloud URL received:', url);
      if (url.startsWith('http')) {
        const metaCode = url.split('/').pop();
        const cleanCode = metaCode ? metaCode.replace('.json', '') : null;
        console.log('[CLOUD SAVE] Extracted meta code:', cleanCode);
        return cleanCode;
      }
    } else {
      console.log('[CLOUD SAVE] Response not OK:', res.status, res.statusText);
    }
  } catch (e: any) {
    console.error('[CLOUD META SAVE ERROR]', e?.message || String(e));
  }
  return null;
}

async function fetchMetaFromCloud(metaCode: string): Promise<any | null> {
  try {
    const cleanCode = metaCode.endsWith('.json') ? metaCode : `${metaCode}.json`;
    const metaUrl = `https://litter.catbox.moe/${cleanCode}`;
    console.log('[CLOUD FETCH] Attempting to fetch from:', metaUrl);
    
    const res = await fetch(metaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QRVault/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    console.log('[CLOUD FETCH] Response status:', res.status);
    
    if (res.ok) {
      const record = await res.json();
      console.log('[CLOUD FETCH] Successfully parsed JSON, has originalName:', !!record?.originalName);
      if (record && record.originalName) {
        return record;
      }
    } else {
      console.log('[CLOUD FETCH] Response not OK:', res.status, res.statusText);
    }
  } catch (e) {
    console.error('[CLOUD META FETCH ERROR]', e);
  }
  return null;
}

// Simple database in memory (shared across requests)
declare global {
  var _filesDB: any[] | undefined;
}

if (!global._filesDB) {
  global._filesDB = [];
}

function readDB(): any[] {
  if (global._filesDB) {
    return global._filesDB;
  }
  global._filesDB = [];
  return global._filesDB;
}

function writeDB(records: any[]) {
  global._filesDB = records;
}

async function findRecord(id: string): Promise<any | null> {
  const records = readDB();
  let record = records.find((r) => r.id === id);
  if (record) return record;

  // Multi-instance cloud resolver for Vercel serverless instances
  if (id.startsWith('QV_')) {
    const parts = id.split('_');
    if (parts.length >= 2) {
      const metaCode = parts[1];
      console.log(`[CLOUD RESOLVER] Attempting to fetch metadata for code: ${metaCode}`);
      const cloudRecord = await fetchMetaFromCloud(metaCode);
      if (cloudRecord) {
        cloudRecord.id = id; // ensure exact requested ID matches
        records.push(cloudRecord);
        writeDB(records);
        console.log(`[CLOUD RESOLVER SUCCESS] Resolved file ${id} (${cloudRecord.originalName}) across serverless instances`);
        return cloudRecord;
      }
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[UPLOAD] Request received');

    // Parse form data using formidable
    const form = formidable({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    
    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('[UPLOAD] File received:', file.originalFilename, file.mimetype, file.size);

    const fileId = generateSecureId(12);
    const ownerToken = generateSecureId(24);
    const category = getCategory(file.mimetype || 'application/octet-stream', file.originalFilename || 'unknown');
    const createdAt = Date.now();

    // Handle expiration
    const expirationOpt = fields.expiration?.[0] || 'never';
    let expiresAt: number | null = null;
    if (expirationOpt === '10m') expiresAt = createdAt + 10 * 60 * 1000;
    else if (expirationOpt === '1h') expiresAt = createdAt + 60 * 60 * 1000;
    else if (expirationOpt === '24h') expiresAt = createdAt + 24 * 60 * 60 * 1000;
    else if (expirationOpt === '7d') expiresAt = createdAt + 7 * 24 * 60 * 60 * 1000;
    else if (expirationOpt === '30d') expiresAt = createdAt + 30 * 24 * 60 * 60 * 1000;

    // Handle download limit
    const limitOpt = fields.downloadLimit?.[0];
    let downloadLimit: number | null = null;
    if (limitOpt && limitOpt !== 'unlimited') {
      const parsed = parseInt(limitOpt, 10);
      if (!isNaN(parsed) && parsed > 0) downloadLimit = parsed;
    }

    // Handle confirmation requirement
    const requireConfirmation = fields.requireConfirmation?.[0] === 'true' || fields.requireConfirmation?.[0] === true;

    // Read file content
    const fileBuffer = fs.readFileSync(file.filepath);
    const base64Data = fileBuffer.toString('base64');

    // Asynchronously or safely attempt remote cloud storage
    let fileRemoteUrl: string | undefined = undefined;
    try {
      fileRemoteUrl = (await uploadFileToCloud(fileBuffer, file.originalFilename || 'file', file.mimetype || 'application/octet-stream')) || undefined;
    } catch (e: any) {
      console.warn('[UPLOAD STORAGE WARN] Cloud payload storage skipped:', e?.message || String(e));
    }

    // Store in memory database
    const record = {
      id: fileId,
      originalName: file.originalFilename,
      mimeType: file.mimetype,
      size: file.size,
      createdAt: createdAt,
      expiresAt: expiresAt,
      downloadLimit: downloadLimit,
      downloadCount: 0,
      requireConfirmation: requireConfirmation,
      isExpired: false,
      isDeleted: false,
      category: category,
      ownerToken: ownerToken,
      base64Data: base64Data,
      fileRemoteUrl: fileRemoteUrl,
    };
    
    global._filesDB.push(record);

    // Upload metadata index to cloud for multi-instance Vercel resolution
    let metaCode: string | null = null;
    try {
      metaCode = await saveMetaToCloud(record);
      console.log('[UPLOAD] Cloud metadata upload result:', metaCode ? 'SUCCESS' : 'FAILED');
    } catch (e: any) {
      console.error('[UPLOAD META ERROR] Meta cloud sync failed:', e?.message || String(e));
    }

    // Use QV_ prefix only if cloud storage succeeded
    // If cloud storage failed, use plain ID (single-instance only)
    const finalFileId = metaCode ? `QV_${metaCode}_${generateSecureId(6)}` : fileId;
    
    console.log('[UPLOAD] Final file ID determination:');
    console.log('[UPLOAD] Meta code:', metaCode);
    console.log('[UPLOAD] Original file ID:', fileId);
    console.log('[UPLOAD] Final file ID:', finalFileId);
    console.log('[UPLOAD] Final file ID starts with QV_:', finalFileId.startsWith('QV_'));
    console.log('[UPLOAD] Cloud storage URL:', fileRemoteUrl);
    console.log('[UPLOAD] Cloud resolution enabled:', !!metaCode);
    console.log('[UPLOAD] Single-instance mode:', !metaCode);

    // Update record with final ID
    record.id = finalFileId;

    console.log('[UPLOAD] File stored with ID:', finalFileId, 'MetaCode:', metaCode || 'local');
    console.log('[UPLOAD] Final ID length:', finalFileId.length);
    console.log('[UPLOAD] Final ID starts with QV_:', finalFileId.startsWith('QV_'));
    console.log('[UPLOAD] Record.id after update:', record.id);

    const { base64Data: _bd, fileRemoteUrl: _fru, ...publicRecord } = record;

    console.log('[UPLOAD] Returning file record with ID:', publicRecord.id);
    console.log('[UPLOAD] Response payload:', JSON.stringify({ success: true, file: publicRecord }));

    return res.status(200).json({
      success: true,
      file: publicRecord
    });

  } catch (error: any) {
    console.error('[UPLOAD ERROR]', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
