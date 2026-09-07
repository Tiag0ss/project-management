import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

jest.mock('../../server/utils/publicUploads', () => {
  const actual = jest.requireActual('../../server/utils/publicUploads');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-upload-'));
  return {
    ...actual,
    EDITOR_UPLOAD_DIR: tmp,
    writePublicUpload: ({ publicPrefix, namePrefix, fileType }: any) => {
      const ext = fileType === 'image/png' ? '.png' : '.bin';
      const diskName = `${namePrefix}-test${ext}`;
      const absolutePath = path.join(tmp, diskName);
      fs.writeFileSync(absolutePath, Buffer.from('fake'));
      return { absolutePath, publicPath: `${publicPrefix}/${diskName}` };
    },
    ensureUploadDir: () => {
      fs.mkdirSync(tmp, { recursive: true });
    },
  };
});

const JWT_SECRET = 'test-jwt-secret-key-do-not-use-in-production';
const makeToken = () =>
  jwt.sign({ userId: 1, username: 'testuser', email: 'test@test.com', isAdmin: true }, JWT_SECRET);

let app: express.Application;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const router = require('../../server/modules/uploads/editorUploads').default;
  app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/uploads', router);
});

describe('POST /api/uploads/editor-image', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/uploads/editor-image').send({});
    expect(res.status).toBe(401);
  });

  it('stores an image and returns a public URL', async () => {
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res = await request(app)
      .post('/api/uploads/editor-image')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        fileName: 'dot.png',
        fileType: 'image/png',
        fileSize: 68,
        fileData: tinyPng,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(String(res.body.data.url)).toMatch(/^\/uploads\/editor\//);
  });
});
