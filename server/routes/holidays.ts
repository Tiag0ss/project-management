import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { dbProvider, pool } from '../config/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';

const router = Router();

const isValidCountryCode = (value: unknown): boolean => /^[A-Z]{2}$/.test(String(value || '').toUpperCase());
const normalizeCountryCode = (value: unknown): string => String(value || '').trim().toUpperCase();
const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const normalizeDate = (value: unknown): string => {
  if (value instanceof Date) {
    const formatted = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return isValidIsoDate(formatted) ? formatted : '';
  }

  const raw = String(value || '').trim();
  if (!raw) return '';
  const datePart = raw.split('T')[0];
  if (isValidIsoDate(datePart)) {
    return datePart;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const formatted = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    return isValidIsoDate(formatted) ? formatted : '';
  }

  return '';
};

const toHolidayDateParam = (dateText: string): string | Date => {
  if (dbProvider !== 'mssql') {
    return dateText;
  }

  const [yearText, monthText, dayText] = dateText.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
};

const checkAdmin = async (userId?: number): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT IsAdmin FROM Users WHERE Id = ?',
    [userId]
  );

  return rows.length > 0 && !!rows[0].IsAdmin;
};

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const year = Number(req.query.year || 0);
    const countryCode = normalizeCountryCode(req.query.countryCode);

    if (!year || !countryCode || !isValidCountryCode(countryCode)) {
      return res.status(400).json({
        success: false,
        message: 'Valid year and countryCode are required'
      });
    }

    const regionCode = req.query.regionCode !== undefined ? String(req.query.regionCode || '') : null;
    const cacheScope = `year:${year}:country:${countryCode}:region:${regionCode === null ? 'all' : regionCode}`;

    const holidays = await cachedJson(
      cacheKeys.holidays(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        let queryStr: string;
        let queryParams: (string | number)[];

        if (regionCode === null) {
          queryStr = `SELECT Id, Year, CountryCode, RegionCode, DATE_FORMAT(HolidayDate, '%Y-%m-%d') as HolidayDate, HolidayName, Source, IsActive
           FROM Holidays
           WHERE Year = ? AND CountryCode = ?
           ORDER BY COALESCE(RegionCode, ''), HolidayDate ASC`;
          queryParams = [year, countryCode];
        } else if (regionCode === '') {
          queryStr = `SELECT Id, Year, CountryCode, RegionCode, DATE_FORMAT(HolidayDate, '%Y-%m-%d') as HolidayDate, HolidayName, Source, IsActive
           FROM Holidays
           WHERE Year = ? AND CountryCode = ? AND (RegionCode IS NULL OR RegionCode = '')
           ORDER BY HolidayDate ASC`;
          queryParams = [year, countryCode];
        } else {
          queryStr = `SELECT Id, Year, CountryCode, RegionCode, DATE_FORMAT(HolidayDate, '%Y-%m-%d') as HolidayDate, HolidayName, Source, IsActive
           FROM Holidays
           WHERE Year = ? AND CountryCode = ? AND RegionCode = ?
           ORDER BY HolidayDate ASC`;
          queryParams = [year, countryCode, regionCode];
        }

        const [rows] = await pool.execute<RowDataPacket[]>(queryStr, queryParams);
        return rows;
      }
    );

    res.json({ success: true, holidays });
  } catch (error) {
    logger.error('Get holidays error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch holidays' });
  }
});

router.get('/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const year = Number(req.query.year || new Date().getFullYear());

    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT CountryCode FROM Users WHERE Id = ?',
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const countryCode = normalizeCountryCode(users[0].CountryCode || 'PT');

    const [holidays] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Year, CountryCode, DATE_FORMAT(HolidayDate, '%Y-%m-%d') as HolidayDate, HolidayName, Source, IsActive
       FROM Holidays
       WHERE Year = ? AND CountryCode = ? AND IsActive = 1
       ORDER BY HolidayDate ASC`,
      [year, countryCode]
    );

    res.json({ success: true, year, countryCode, holidays });
  } catch (error) {
    logger.error('Get my holidays error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user holidays' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { year, countryCode, holidayDate, holidayName, isActive, regionCode } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const normalizedRegionCode = regionCode ? String(regionCode).trim().toUpperCase() : null;

    if (!year || !holidayDate || !holidayName || !isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'year, countryCode, holidayDate and holidayName are required' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        Number(year),
        normalizedCountryCode,
        normalizedRegionCode,
        toHolidayDateParam(normalizeDate(holidayDate)),
        String(holidayName).trim(),
        isActive === false ? 0 : 1,
      ]
    );

    await invalidateByEntity('holiday', {});

    res.status(201).json({ success: true, holidayId: result.insertId });
  } catch (error) {
    logger.error('Create holiday error:', error);
    res.status(500).json({ success: false, message: 'Failed to create holiday' });
  }
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const holidayId = Number(req.params.id);
    const { holidayDate, holidayName, isActive } = req.body;

    await pool.execute(
      `UPDATE Holidays
       SET HolidayDate = ?, HolidayName = ?, IsActive = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        toHolidayDateParam(normalizeDate(holidayDate)),
        String(holidayName || '').trim(),
        isActive === false ? 0 : 1,
        holidayId,
      ]
    );

    await invalidateByEntity('holiday', {});

    res.json({ success: true, message: 'Holiday updated successfully' });
  } catch (error) {
    logger.error('Update holiday error:', error);
    res.status(500).json({ success: false, message: 'Failed to update holiday' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const holidayId = Number(req.params.id);

    await pool.execute('DELETE FROM Holidays WHERE Id = ?', [holidayId]);

    await invalidateByEntity('holiday', {});

    res.json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    logger.error('Delete holiday error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete holiday' });
  }
});

router.post('/import/nager-date', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { year, countryCode, replaceExisting } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const numericYear = Number(year);

    if (!numericYear || !isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'Valid year and countryCode are required' });
    }

    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${numericYear}/${normalizedCountryCode}`);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: 'Failed to fetch holidays from Nager.Date'
      });
    }

    const holidays = await response.json() as Array<{
      date: string;
      localName?: string;
      name?: string;
      global?: boolean;
      counties?: string[] | null;
    }>;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(404).json({ success: false, message: 'No holidays returned by Nager.Date for this year/country' });
    }

    const nationalHolidays = holidays.filter((holiday) => {
      const isGlobal = holiday.global === true;
      const hasRegionalCounties = Array.isArray(holiday.counties) && holiday.counties.length > 0;
      return isGlobal && !hasRegionalCounties;
    });

    // Flatten regional holidays: one row per county code
    const regionalHolidays = holidays
      .filter((h) => Array.isArray(h.counties) && h.counties!.length > 0)
      .flatMap((h) => h.counties!.map((county) => ({
        date: h.date,
        name: String(h.localName || h.name || '').trim(),
        regionCode: county,
      })));

    if (nationalHolidays.length === 0 && regionalHolidays.length === 0) {
      return res.status(404).json({ success: false, message: 'Nager.Date returned no holidays for this year/country' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (replaceExisting !== false) {
        await connection.execute(
          'DELETE FROM Holidays WHERE Year = ? AND CountryCode = ?',
          [numericYear, normalizedCountryCode]
        );
      }

      let inserted = 0;
      for (const holiday of nationalHolidays) {
        const holidayDate = normalizeDate(holiday.date);
        const holidayName = String(holiday.localName || holiday.name || '').trim();
        if (!holidayDate || !holidayName) continue;

        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, NULL, ?, ?, 'nager', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [numericYear, normalizedCountryCode, toHolidayDateParam(holidayDate), holidayName]
        );
        inserted += 1;
      }

      for (const regional of regionalHolidays) {
        const holidayDate = normalizeDate(regional.date);
        if (!holidayDate || !regional.name) continue;
        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, ?, ?, ?, 'nager', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [numericYear, normalizedCountryCode, regional.regionCode, toHolidayDateParam(holidayDate), regional.name]
        );
        inserted += 1;
      }

      await connection.commit();

      await invalidateByEntity('holiday', {});

      res.json({
        success: true,
        message: 'Holidays imported successfully',
        inserted,
        year: numericYear,
        countryCode: normalizedCountryCode
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Import holidays error:', error);
    res.status(500).json({ success: false, message: 'Failed to import holidays from Nager.Date' });
  }
});

router.post('/import/openholidays', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { year, countryCode, replaceExisting } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const numericYear = Number(year);

    if (!numericYear || !isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'Valid year and countryCode are required' });
    }

    const validFrom = `${numericYear}-01-01`;
    const validTo = `${numericYear}-12-31`;
    const response = await fetch(
      `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${normalizedCountryCode}&languageIsoCode=EN&validFrom=${validFrom}&validTo=${validTo}`
    );

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: 'Failed to fetch holidays from OpenHolidays API'
      });
    }

    const openHolidays = await response.json() as Array<{
      startDate?: string;
      name?: Array<{ language?: string; text?: string }>;
      nationwide?: boolean;
      regionalScope?: string;
      type?: string;
    }>;

    if (!Array.isArray(openHolidays) || openHolidays.length === 0) {
      return res.status(404).json({ success: false, message: 'No holidays returned by OpenHolidays API for this year/country' });
    }

    const normalizedHolidays = openHolidays
      .filter((holiday) => holiday.nationwide === true || String(holiday.regionalScope || '').toLowerCase() === 'national')
      .map((holiday) => {
        const englishName = holiday.name?.find((nameItem) => String(nameItem.language || '').toUpperCase() === 'EN')?.text;
        const fallbackName = holiday.name?.[0]?.text;

        return {
          holidayDate: normalizeDate(holiday.startDate),
          holidayName: String(englishName || fallbackName || '').trim(),
        };
      })
      .filter((holiday) => holiday.holidayDate && holiday.holidayName);

    const uniqueMap = new Map<string, { holidayDate: string; holidayName: string }>();
    normalizedHolidays.forEach((holiday) => {
      const key = `${holiday.holidayDate}__${holiday.holidayName.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, holiday);
      }
    });

    const uniqueHolidays = Array.from(uniqueMap.values());

    if (!uniqueHolidays.length) {
      return res.status(404).json({ success: false, message: 'OpenHolidays API returned no national holidays for this year/country' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (replaceExisting !== false) {
        await connection.execute(
          'DELETE FROM Holidays WHERE Year = ? AND CountryCode = ? AND (RegionCode IS NULL OR RegionCode = \'\')',
          [numericYear, normalizedCountryCode]
        );
      }

      let inserted = 0;
      for (const holiday of uniqueHolidays) {
        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, NULL, ?, ?, 'openholidays', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            numericYear,
            normalizedCountryCode,
            toHolidayDateParam(holiday.holidayDate),
            holiday.holidayName,
          ]
        );
        inserted += 1;
      }

      await connection.commit();

      await invalidateByEntity('holiday', {});

      res.json({
        success: true,
        message: 'Holidays imported successfully',
        inserted,
        year: numericYear,
        countryCode: normalizedCountryCode
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Import OpenHolidays error:', error);
    res.status(500).json({ success: false, message: 'Failed to import holidays from OpenHolidays API' });
  }
});

// Import regional holidays from OpenHolidays API for a specific subdivision
router.post('/import/openholidays-regional', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { year, countryCode, subdivisionCode, replaceExisting } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const normalizedSubdivision = String(subdivisionCode || '').trim().toUpperCase();
    const numericYear = Number(year);

    if (!numericYear || !isValidCountryCode(normalizedCountryCode) || !normalizedSubdivision) {
      return res.status(400).json({ success: false, message: 'Valid year, countryCode and subdivisionCode are required' });
    }

    const validFrom = `${numericYear}-01-01`;
    const validTo = `${numericYear}-12-31`;
    const response = await fetch(
      `https://openholidaysapi.org/PublicHolidays?countryIsoCode=${normalizedCountryCode}&subdivisionCode=${encodeURIComponent(normalizedSubdivision)}&languageIsoCode=EN&validFrom=${validFrom}&validTo=${validTo}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Failed to fetch from OpenHolidays API' });
    }

    const openHolidays = await response.json() as Array<{
      startDate?: string;
      name?: Array<{ language?: string; text?: string }>;
      nationwide?: boolean;
      regionalScope?: string;
    }>;

    if (!Array.isArray(openHolidays) || openHolidays.length === 0) {
      return res.status(404).json({ success: false, message: `No holidays returned for subdivision ${normalizedSubdivision}` });
    }

    // Split into national (nationwide=true) and truly regional entries
    const nationalEntries = openHolidays.filter(
      (h) => h.nationwide === true || String(h.regionalScope || '').toLowerCase() === 'national'
    );
    const regionalEntries = openHolidays.filter(
      (h) => h.nationwide !== true && String(h.regionalScope || '').toLowerCase() !== 'national'
    );

    const toNormalized = (list: typeof openHolidays) =>
      list
        .map((h) => {
          const englishName = h.name?.find((n) => String(n.language || '').toUpperCase() === 'EN')?.text;
          const fallbackName = h.name?.[0]?.text;
          return {
            holidayDate: normalizeDate(h.startDate),
            holidayName: String(englishName || fallbackName || '').trim(),
          };
        })
        .filter((h) => h.holidayDate && h.holidayName);

    const dedup = (list: { holidayDate: string; holidayName: string }[]) => {
      const m = new Map<string, { holidayDate: string; holidayName: string }>();
      list.forEach((h) => {
        const key = `${h.holidayDate}__${h.holidayName.toLowerCase()}`;
        if (!m.has(key)) m.set(key, h);
      });
      return Array.from(m.values());
    };

    const uniqueNational = dedup(toNormalized(nationalEntries));
    const uniqueRegional = dedup(toNormalized(regionalEntries));

    if (!uniqueNational.length && !uniqueRegional.length) {
      return res.status(404).json({ success: false, message: 'No valid holidays found for this subdivision' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (replaceExisting !== false) {
        // Only delete the regional-specific rows for this subdivision, not national ones
        await connection.execute(
          'DELETE FROM Holidays WHERE Year = ? AND CountryCode = ? AND RegionCode = ?',
          [numericYear, normalizedCountryCode, normalizedSubdivision]
        );
      }

      let inserted = 0;

      // Insert national holidays only if not already present
      for (const holiday of uniqueNational) {
        const [existing] = await connection.execute<RowDataPacket[]>(
          `SELECT Id FROM Holidays WHERE Year = ? AND CountryCode = ? AND (RegionCode IS NULL OR RegionCode = '') AND HolidayDate = ?`,
          [numericYear, normalizedCountryCode, toHolidayDateParam(holiday.holidayDate)]
        );
        if ((existing as RowDataPacket[]).length === 0) {
          await connection.execute(
            `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
             VALUES (?, ?, NULL, ?, ?, 'openholidays', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [numericYear, normalizedCountryCode, toHolidayDateParam(holiday.holidayDate), holiday.holidayName]
          );
          inserted += 1;
        }
      }

      // Insert region-specific holidays tagged with the subdivision code
      for (const holiday of uniqueRegional) {
        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, ?, ?, ?, 'openholidays', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [numericYear, normalizedCountryCode, normalizedSubdivision, toHolidayDateParam(holiday.holidayDate), holiday.holidayName]
        );
        inserted += 1;
      }

      await connection.commit();
      await invalidateByEntity('holiday', {});
      res.json({
        success: true,
        message: 'Regional holidays imported',
        inserted,
        nationalSkipped: uniqueNational.length,
        subdivisionCode: normalizedSubdivision,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Import OpenHolidays regional error:', error);
    res.status(500).json({ success: false, message: 'Failed to import regional holidays' });
  }
});

// Fetch available subdivisions for a country from OpenHolidays API
router.get('/subdivisions/:countryCode', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const normalizedCountryCode = normalizeCountryCode(req.params.countryCode);
    if (!isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'Valid countryCode is required' });
    }

    const response = await fetch(
      `https://openholidaysapi.org/Subdivisions?countryIsoCode=${normalizedCountryCode}&languageIsoCode=EN`
    );

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Failed to fetch subdivisions from OpenHolidays API' });
    }

    const raw = await response.json() as Array<{
      code?: string;
      isoCode?: string;
      shortName?: string;
      name?: Array<{ language?: string; text?: string }>;
    }>;

    if (!Array.isArray(raw)) {
      return res.json({ success: true, subdivisions: [] });
    }

    const subdivisions = raw.map((s) => {
      const code = String(s.isoCode || s.code || '').trim();
      const englishName = s.name?.find((n) => String(n.language || '').toUpperCase() === 'EN')?.text;
      const fallbackName = s.name?.[0]?.text || s.shortName || code;
      return { code, name: String(englishName || fallbackName).trim() };
    }).filter((s) => s.code);

    res.json({ success: true, subdivisions });
  } catch (error) {
    logger.error('Fetch subdivisions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subdivisions' });
  }
});

// Fetch available counties for a country/year from Nager.Date
router.get('/nager-counties/:countryCode/:year', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const normalizedCountryCode = normalizeCountryCode(req.params.countryCode);
    const numericYear = Number(req.params.year);
    if (!isValidCountryCode(normalizedCountryCode) || !numericYear) {
      return res.status(400).json({ success: false, message: 'Valid countryCode and year are required' });
    }

    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${numericYear}/${normalizedCountryCode}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Failed to fetch from Nager.Date' });
    }

    const holidays = await response.json() as Array<{
      counties?: string[] | null;
    }>;

    if (!Array.isArray(holidays)) {
      return res.json({ success: true, subdivisions: [] });
    }

    const countySet = new Set<string>();
    holidays.forEach((h) => {
      if (Array.isArray(h.counties)) {
        h.counties.forEach((c) => countySet.add(c));
      }
    });

    const subdivisions = Array.from(countySet).sort().map((c) => ({ code: c, name: c }));
    res.json({ success: true, subdivisions });
  } catch (error) {
    logger.error('Fetch Nager counties error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counties' });
  }
});

// Import regional holidays from Nager.Date for a specific county
router.post('/import/nager-regional', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { year, countryCode, subdivisionCode, replaceExisting } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const normalizedSubdivision = String(subdivisionCode || '').trim().toUpperCase();
    const numericYear = Number(year);

    if (!numericYear || !isValidCountryCode(normalizedCountryCode) || !normalizedSubdivision) {
      return res.status(400).json({ success: false, message: 'Valid year, countryCode and subdivisionCode are required' });
    }

    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${numericYear}/${normalizedCountryCode}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: 'Failed to fetch from Nager.Date' });
    }

    const holidays = await response.json() as Array<{
      date: string;
      localName?: string;
      name?: string;
      global?: boolean;
      counties?: string[] | null;
    }>;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(404).json({ success: false, message: 'No holidays returned by Nager.Date' });
    }

    // National = global with no county restrictions
    const nationalHolidays = holidays.filter(
      (h) => h.global === true && (!Array.isArray(h.counties) || h.counties.length === 0)
    );
    // Subdivision-specific = has county list that includes the requested code
    const regionalHolidays = holidays.filter(
      (h) => Array.isArray(h.counties) && h.counties.includes(normalizedSubdivision)
    );

    if (!nationalHolidays.length && !regionalHolidays.length) {
      return res.status(404).json({ success: false, message: `No holidays found for county ${normalizedSubdivision}` });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      if (replaceExisting !== false) {
        await connection.execute(
          'DELETE FROM Holidays WHERE Year = ? AND CountryCode = ? AND RegionCode = ?',
          [numericYear, normalizedCountryCode, normalizedSubdivision]
        );
      }

      let inserted = 0;

      // National holidays: insert only if not already present
      for (const h of nationalHolidays) {
        const holidayDate = normalizeDate(h.date);
        const holidayName = String(h.localName || h.name || '').trim();
        if (!holidayDate || !holidayName) continue;
        const [existing] = await connection.execute<RowDataPacket[]>(
          `SELECT Id FROM Holidays WHERE Year = ? AND CountryCode = ? AND (RegionCode IS NULL OR RegionCode = '') AND HolidayDate = ?`,
          [numericYear, normalizedCountryCode, toHolidayDateParam(holidayDate)]
        );
        if ((existing as RowDataPacket[]).length === 0) {
          await connection.execute(
            `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
             VALUES (?, ?, NULL, ?, ?, 'nager', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [numericYear, normalizedCountryCode, toHolidayDateParam(holidayDate), holidayName]
          );
          inserted += 1;
        }
      }

      // Regional holidays tagged with subdivision code
      for (const h of regionalHolidays) {
        const holidayDate = normalizeDate(h.date);
        const holidayName = String(h.localName || h.name || '').trim();
        if (!holidayDate || !holidayName) continue;
        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, RegionCode, HolidayDate, HolidayName, Source, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, ?, ?, ?, 'nager', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [numericYear, normalizedCountryCode, normalizedSubdivision, toHolidayDateParam(holidayDate), holidayName]
        );
        inserted += 1;
      }

      await connection.commit();
      await invalidateByEntity('holiday', {});
      res.json({ success: true, message: 'Regional holidays imported', inserted, subdivisionCode: normalizedSubdivision });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Import Nager regional error:', error);
    res.status(500).json({ success: false, message: 'Failed to import regional holidays from Nager.Date' });
  }
});

// Get distinct region codes stored in the database for a given country
// Used to populate the user region picker (includes manually added regions)
router.get('/regions/:countryCode', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const normalizedCountryCode = String(req.params.countryCode || '').trim().toUpperCase();
    if (!isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'Invalid country code' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT RegionCode FROM Holidays
       WHERE CountryCode = ? AND RegionCode IS NOT NULL AND RegionCode <> ''
       ORDER BY RegionCode`,
      [normalizedCountryCode]
    );

    const regions = (rows as RowDataPacket[]).map((r) => ({
      code: r.RegionCode as string,
      name: r.RegionCode as string,
    }));

    res.json({ success: true, regions });
  } catch (error) {
    logger.error('Get regions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch regions' });
  }
});

export default router;
