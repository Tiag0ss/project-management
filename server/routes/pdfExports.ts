import express, { Response } from 'express';
import PDFDocument from 'pdfkit';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

interface TableExportRequestBody {
  title?: unknown;
  filename?: unknown;
  headers?: unknown;
  rows?: unknown;
}

const MAX_COLUMNS = 20;
const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 200;

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_LENGTH);
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'report';
}

router.post('/table', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as TableExportRequestBody;
    const title = toSafeString(body.title || 'Report').slice(0, 100);
    const filename = sanitizeFilename(toSafeString(body.filename || 'report'));

    if (!Array.isArray(body.headers) || body.headers.length === 0) {
      return res.status(400).json({ success: false, message: 'Headers are required' });
    }

    if (!Array.isArray(body.rows)) {
      return res.status(400).json({ success: false, message: 'Rows must be an array' });
    }

    const headers = body.headers.slice(0, MAX_COLUMNS).map((header: unknown) => toSafeString(header));
    const rows = body.rows.slice(0, MAX_ROWS).map((row: unknown) => {
      if (!Array.isArray(row)) {
        return headers.map(() => '');
      }
      const rowValues = row.slice(0, headers.length).map((cell: unknown) => toSafeString(cell));
      while (rowValues.length < headers.length) {
        rowValues.push('');
      }
      return rowValues;
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const safeFilename = `${filename}_${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    doc.pipe(res);

    const pageLeft = doc.page.margins.left;
    const pageRight = doc.page.width - doc.page.margins.right;
    const pageTop = doc.page.margins.top;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const availableWidth = pageRight - pageLeft;
    const columnWidth = availableWidth / headers.length;
    const rowHeight = 22;

    let y = pageTop;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(title, pageLeft, y, {
      width: availableWidth,
      align: 'left',
    });
    y += 28;

    const drawHeader = () => {
      doc.save();
      doc.rect(pageLeft, y, availableWidth, rowHeight).fill('#2563eb');
      doc.restore();

      headers.forEach((header, index) => {
        const x = pageLeft + index * columnWidth;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(header, x + 4, y + 6, {
          width: columnWidth - 8,
          height: rowHeight - 8,
          ellipsis: true,
        });
      });
      y += rowHeight;
    };

    drawHeader();

    rows.forEach((row, rowIndex) => {
      if (y + rowHeight > pageBottom) {
        doc.addPage({ margin: 40, size: 'A4', layout: 'landscape' });
        y = doc.page.margins.top;
        drawHeader();
      }

      if (rowIndex % 2 === 0) {
        doc.save();
        doc.rect(pageLeft, y, availableWidth, rowHeight).fill('#f9fafb');
        doc.restore();
      }

      row.forEach((cell, index) => {
        const x = pageLeft + index * columnWidth;
        doc.font('Helvetica').fontSize(8).fillColor('#111827').text(cell, x + 4, y + 6, {
          width: columnWidth - 8,
          height: rowHeight - 8,
          ellipsis: true,
        });
      });

      y += rowHeight;
    });

    doc.end();
  } catch (error) {
    console.error('Error exporting PDF table:', error);
    res.status(500).json({ success: false, message: 'Failed to export PDF' });
  }
});

export default router;
