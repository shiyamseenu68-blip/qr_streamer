import crypto from 'crypto';
import path from 'path';

export const config = {
  api: {
    bodyParser: true,
  },
};

// Simple database in memory (shared with upload)
declare global {
  var _filesDB: any[] | undefined;
}

if (!global._filesDB) {
  global._filesDB = [];
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

      const record = global._filesDB?.find((f: any) => f.id === id);
      
      if (!record) {
        return res.status(404).json({ error: 'File not found' });
      }

      const { base64Data, ...publicRecord } = record;

      return res.status(200).json({
        ...publicRecord,
        isExpired: false,
        isDeleted: false,
        downloadCount: 0,
        downloadLimit: null,
        isLimitReached: false,
        isOwner: true,
      });
    }

    // PATCH - Update file settings
    if (req.method === 'PATCH') {
      console.log('[FILE PATCH] Request for ID:', id);

      const record = global._filesDB?.find((f: any) => f.id === id);
      
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

      const { base64Data, ...publicRecord } = record;
      
      return res.status(200).json({ success: true, file: publicRecord });
    }

    // DELETE - Delete file
    if (req.method === 'DELETE') {
      console.log('[FILE DELETE] Request for ID:', id);

      const recordIndex = global._filesDB?.findIndex((f: any) => f.id === id);
      
      if (recordIndex === -1) {
        return res.status(404).json({ error: 'File not found' });
      }

      global._filesDB?.splice(recordIndex, 1);
      
      return res.status(200).json({ success: true, message: 'File deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('[FILE API ERROR]', error);
    return res.status(500).json({ error: error.message || 'Failed to process request' });
  }
}
