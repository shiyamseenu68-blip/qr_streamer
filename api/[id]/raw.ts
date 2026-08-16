import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Simple database in memory (shared with upload)
declare global {
  var _filesDB: any[] | undefined;
}

if (!global._filesDB) {
  global._filesDB = [];
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

    const record = global._filesDB?.find((f: any) => f.id === id);
    
    if (!record) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (!record.base64Data) {
      return res.status(404).json({ error: 'File content not available' });
    }

    // Convert base64 back to buffer
    const fileBuffer = Buffer.from(record.base64Data, 'base64');

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.originalName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    return res.send(fileBuffer);

  } catch (error: any) {
    console.error('[FILE RAW ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to get file' });
  }
}
