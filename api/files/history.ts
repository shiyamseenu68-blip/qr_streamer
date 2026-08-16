import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: true,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[HISTORY] Request received');
    
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const result = await Promise.all(
      items.map(async (item: any) => {
        let found = await findRecord(item.id);
        if (!found) {
          return { id: item.id, isNotFound: true, isDeleted: true };
        }
        
        const { base64Data, fileRemoteUrl, ownerToken, ...publicInfo } = found;
        const isLimitReached = found.downloadLimit !== null && found.downloadCount >= found.downloadLimit;
        
        return {
          ...publicInfo,
          isLimitReached,
          isOwner: ownerToken === item.ownerToken,
        };
      })
    );

    return res.status(200).json({ items: result });

  } catch (error: any) {
    console.error('[HISTORY ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to get history' });
  }
}
