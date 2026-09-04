import { oldPath, appOrOldPath } from '../../lib/oldPath';

describe('oldPath', () => {
  it('returns canonical authenticated routes', () => {
    expect(oldPath('/projects')).toBe('/projects');
    expect(oldPath('/approvals?tab=time')).toBe('/approvals?tab=time');
  });

  it('leaves auth and docs unchanged', () => {
    expect(oldPath('/login')).toBe('/login');
    expect(oldPath('/docs/guide')).toBe('/docs/guide');
  });

  it('strips legacy /old prefix when present', () => {
    expect(oldPath('/old/administration')).toBe('/administration');
  });

  it('appOrOldPath returns canonical paths', () => {
    expect(appOrOldPath('/administration', false)).toBe('/administration');
    expect(appOrOldPath('/administration', true)).toBe('/administration');
  });
});
