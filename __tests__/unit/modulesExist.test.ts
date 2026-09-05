import fs from 'fs';
import path from 'path';

const MODULES = [
  'auth',
  'admin',
  'organizations',
  'users',
  'customers',
  'applications',
  'notifications',
  'tickets',
  'expenses',
  'projects',
  'planning',
  'time',
  'reporting',
  'dashboard',
  'portal',
  'integrations',
  'search',
];

describe('server/modules layout', () => {
  it('has an index.ts barrel per domain', () => {
    for (const domain of MODULES) {
      const indexPath = path.join(__dirname, '../../server/modules', domain, 'index.ts');
      expect(fs.existsSync(indexPath)).toBe(true);
      const text = fs.readFileSync(indexPath, 'utf8');
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
