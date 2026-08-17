import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: true,
  },
};

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
  console.log('[FIND RECORD] Searching for ID:', id);
  
  const records = readDB();
  let record = records.find((r) => r.id === id);
  if (record) {
    console.log('[FIND RECORD] Found in local memory');
    return record;
  }

  // Multi-instance cloud resolver for Vercel serverless instances
  if (id.startsWith('QV_')) {
    const parts = id.split('_');
    console.log('[FIND RECORD] QV ID detected, parts:', parts);
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
      } else {
        console.log('[CLOUD RESOLVER] Failed to fetch from cloud for code:', metaCode);
      }
    }
  }

  console.log('[FIND RECORD] Record not found in local memory or cloud');
  return null;
}

export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Token');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'File ID required' });
  }

  try {
    // GET - File info
    if (req.method === 'GET') {
      console.log('[FILE GET] Request for ID:', id);

      const record = await findRecord(id);
      
      if (!record) {
        return res.status(404).json({ error: 'File not found' });
      }

      const { base64Data, fileRemoteUrl, ...publicRecord } = record;

      return res.status(200).json({
        ...publicRecord,
        isExpired: false,
        isDeleted: false,
        isLimitReached: false,
        isOwner: true,
      });
    }

    // PATCH - Update file settings
    if (req.method === 'PATCH') {
      console.log('[FILE PATCH] Request for ID:', id);

      const record = await findRecord(id);
      
      if (!record) {
        return res.status(404).json({ error: 'File not found' });
      }

      const { expiration, downloadLimit, requireConfirmation } = req.body;

      if (expiration !== undefined) {
        if (expiration === 'never') record.expiresAt = null;
        else if (expiration === '10m') record.expiresAt = record.createdAt + 10 * 60 * 1000;
        else if (expiration === '1h') record.expiresAt = record.createdAt + 60 * 60 * 1000;
        else if (expiration === '24h') record.expiresAt = record.createdAt + 24 * 60 * 60 * 1000;
        else if (expiration === '7d') record.expiresAt = record.createdAt + 7 * 24 * 60 * 60 * 1000;
        else if (expiration === '30d') record.expiresAt = record.createdAt + 30 * 24 * 60 * 60 * 1000;
        record.isExpired = record.expiresAt ? Date.now() > record.expiresAt : false;
      }

      if (downloadLimit !== undefined) {
        if (downloadLimit === 'unlimited' || downloadLimit === null) {
          record.downloadLimit = null;
        } else {
          const parsed = parseInt(downloadLimit, 10);
          record.downloadLimit = !isNaN(parsed) && parsed > 0 ? parsed : null;
        }
      }

      if (requireConfirmation !== undefined) {
        record.requireConfirmation = Boolean(requireConfirmation);
      }

      const { base64Data, fileRemoteUrl, ...publicRecord } = record;
      
      return res.status(200).json({ success: true, file: publicRecord });
    }

    // DELETE - Delete file
    if (req.method === 'DELETE') {
      console.log('[FILE DELETE] Request for ID:', id);

      const recordIndex = readDB().findIndex((f: any) => f.id === id);
      
      if (recordIndex === -1) {
        return res.status(404).json({ error: 'File not found' });
      }

      const records = readDB();
      records.splice(recordIndex, 1);
      writeDB(records);
      
      return res.status(200).json({ success: true, message: 'File deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('[FILE API ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to process request' });
  }
}
