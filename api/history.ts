import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: true,
  },
};

// Simple database in memory (shared across requests)
declare global {
  var _filesDB: any[] | undefined;
}

if (!global._filesDB) {
  global._filesDB = [];
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

    const result = items.map((item: any) => {
      const found = global._filesDB?.find((f: any) => f.id === item.id);
      
      if (!found) {
        return { id: item.id, isNotFound: true, isDeleted: true };
      }

      const { base64Data, ...publicInfo } = found;
      
      return {
        ...publicInfo,
        isLimitReached: false,
        isOwner: true,
      };
    });

    return res.status(200).json({ items: result });

  } catch (error: any) {
    console.error('[HISTORY ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to get history' });
  }
}
