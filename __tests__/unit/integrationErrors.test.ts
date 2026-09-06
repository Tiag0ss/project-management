import { integrationWriteErrorMessage } from '../../server/utils/integrationErrors';

describe('integrationWriteErrorMessage', () => {
  it('maps encryption misconfig clearly', () => {
    expect(
      integrationWriteErrorMessage(
        new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),
        'Failed to create GitHub integration'
      )
    ).toMatch(/ENCRYPTION_KEY|JWT_SECRET/);
  });

  it('maps token column overflow clearly', () => {
    expect(
      integrationWriteErrorMessage(
        { message: 'ER_DATA_TOO_LONG', sqlMessage: "Data too long for column 'GitHubToken' at row 1" },
        'Failed to create GitHub integration'
      )
    ).toMatch(/too long/i);
  });

  it('maps missing table clearly', () => {
    expect(
      integrationWriteErrorMessage(
        { message: "Table 'db.OrganizationGitHubIntegrations' doesn't exist" },
        'Failed to create GitHub integration'
      )
    ).toMatch(/missing/i);
  });

  it('maps invalid URL clearly', () => {
    expect(
      integrationWriteErrorMessage(new Error('Invalid URL'), 'Failed to create GitHub integration')
    ).toMatch(/https:\/\//);
  });

  it('falls back when message may contain secrets', () => {
    expect(
      integrationWriteErrorMessage(
        new Error('bad token enc:abc'),
        'Failed to create GitHub integration'
      )
    ).toBe('Failed to create GitHub integration');
  });
});
