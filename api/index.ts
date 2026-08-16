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
    };
    
    global._filesDB.push(record);

    console.log('[UPLOAD] File stored with ID:', fileId);

    const { base64Data: _bd, ...publicRecord } = record;

    return res.status(200).json({
      success: true,
      file: publicRecord
    });

  } catch (error: any) {
    console.error('[UPLOAD ERROR]', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
