import 'server-only';

import { pool, RowDataPacket } from '../../server/config/database';
import { inferFaviconType, resolveFaviconUrl as resolveSharedFaviconUrl } from './favicon.shared';
import { getDefaultFaviconPath, resolveFaviconUrl } from './favicon.server';

export { inferFaviconType } from './favicon.shared';

export interface PublicBranding {
  companyName: string;
  faviconUrl: string;
}

const DEFAULT_COMPANY_NAME = 'Project Management App';

export async function getPublicBranding(): Promise<PublicBranding> {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      `SELECT SettingKey, SettingValue
       FROM SystemSettings
       WHERE SettingKey IN ('companyName', 'faviconUrl')`
    );

    const settingsMap: Record<string, string> = {};
    settings.forEach((setting) => {
      settingsMap[setting.SettingKey] = setting.SettingValue;
    });

    const companyName = String(settingsMap.companyName || '').trim() || DEFAULT_COMPANY_NAME;
    const faviconUrl = resolveFaviconUrl(settingsMap.faviconUrl);

    return { companyName, faviconUrl };
  } catch {
    return {
      companyName: DEFAULT_COMPANY_NAME,
      faviconUrl: resolveSharedFaviconUrl(null, getDefaultFaviconPath()),
    };
  }
}
