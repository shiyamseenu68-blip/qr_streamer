import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Cloud storage & multi-instance metadata sync helpers
async function fetchMetaFromCloud(metaCode: string): Promise<any | null> {
  try {
    const cleanCode = metaCode.endsWith('.json') ? metaCode : `${metaCode}.json`;
    const metaUrl = `https://litter.catbox.moe/${cleanCode}`;
    const res = await fetch(metaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QRVault/1.0',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const record = await res.json();
      if (record && record.originalName) {
        return record;
      }
    }
  } catch (e) {
    console.warn('[CLOUD META FETCH WARN]', e);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'File ID required' });
  }

  try {
    console.log('[FILE RAW] Request for ID:', id);

    const record = await findRecord(id);
    
    if (!record) {
      return res.status(404).json({ error: 'File not found' });
    }

    const isDownload = req.query.download === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Length', record.size);
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodeURIComponent(record.originalName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // 1. Serve from memory base64 buffer if available
    if (record.base64Data) {
      console.log(`[RAW FILE SERVED] ${id} (${record.originalName}) served from base64 buffer`);
      const fileBuffer = Buffer.from(record.base64Data, 'base64');
      return res.send(fileBuffer);
    }

    // 2. Fetch and stream from cloud storage if available
    if (record.fileRemoteUrl) {
      console.log(`[RAW FILE SERVED] ${id} (${record.originalName}) streaming from cloud storage: ${record.fileRemoteUrl}`);
      try {
        const cloudRes = await fetch(record.fileRemoteUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QRVault/1.0',
          },
        });
        if (cloudRes.ok && cloudRes.body) {
          const arrayBuffer = await cloudRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          return res.send(buffer);
        }
      } catch (e) {
        console.error('[RAW FILE STREAM ERROR]', e);
      }
    }

    return res.status(404).json({ error: 'File content unavailable' });

  } catch (error: any) {
    console.error('[FILE RAW ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to get file' });
  }
}
