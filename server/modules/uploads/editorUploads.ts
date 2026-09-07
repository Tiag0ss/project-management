import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import logger from '../../utils/logger';
import {
  APPLICATION_IMAGE_TYPES,
  ensureUploadDir,
  resolveImageMime,
  uploadErrorMessage,
  writePublicUpload,
} from '../../utils/publicUploads';
import path from 'node:path';

const router = Router();

export const EDITOR_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'editor');
const MAX_EDITOR_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/uploads/editor-image
 * Store a rich-text image under public/uploads/editor and return a URL path.
 */
router.post('/editor-image', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { fileName, fileData, fileSize } = req.body || {};
    const fileType = resolveImageMime(req.body?.fileType, fileName);

    if (!fileData) {
      return res.status(400).json({ success: false, message: 'fileData is required' });
    }
    if (!fileType || !APPLICATION_IMAGE_TYPES.has(fileType)) {
      return res.status(400).json({
        success: false,
        message: 'File type not allowed. Use PNG, JPEG, WebP, or SVG.',
      });
    }

    const buffer = Buffer.from(
      String(fileData).includes(',') ? String(fileData).split(',')[1] : String(fileData),
      'base64'
    );
    const size = Number(fileSize) || buffer.length;
    if (size > MAX_EDITOR_IMAGE_BYTES) {
      return res.status(400).json({ success: false, message: 'Image size must be less than 5MB' });
    }

    ensureUploadDir(EDITOR_UPLOAD_DIR);
    const { publicPath } = writePublicUpload({
      dir: EDITOR_UPLOAD_DIR,
      publicPrefix: '/uploads/editor',
      fileType,
      fileName: fileName ? String(fileName) : undefined,
      fileData: String(fileData),
      namePrefix: `editor-${userId}`,
    });

    res.json({
      success: true,
      data: { url: publicPath },
      message: 'Image uploaded',
    });
  } catch (error) {
    logger.error('Editor image upload failed', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      success: false,
      message: uploadErrorMessage(error, 'Failed to upload image'),
    });
  }
});

export default router;
