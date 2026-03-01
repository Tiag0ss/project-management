import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

const isValidCountryCode = (value: unknown): boolean => /^[A-Z]{2}$/.test(String(value || '').toUpperCase());
const normalizeCountryCode = (value: unknown): string => String(value || '').trim().toUpperCase();
const normalizeDate = (value: unknown): string => {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  const raw = String(value || '').trim();
  if (!raw) return '';
  const datePart = raw.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return '';
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

    const [holidays] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Year, CountryCode, DATE_FORMAT(HolidayDate, '%Y-%m-%d') as HolidayDate, HolidayName, Source, IsActive
       FROM Holidays
       WHERE Year = ? AND CountryCode = ?
       ORDER BY HolidayDate ASC`,
      [year, countryCode]
    );

    res.json({ success: true, holidays });
  } catch (error) {
    console.error('Get holidays error:', error);
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
    console.error('Get my holidays error:', error);
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

    const { year, countryCode, holidayDate, holidayName, isActive } = req.body;
    const normalizedCountryCode = normalizeCountryCode(countryCode);

    if (!year || !holidayDate || !holidayName || !isValidCountryCode(normalizedCountryCode)) {
      return res.status(400).json({ success: false, message: 'year, countryCode, holidayDate and holidayName are required' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Holidays (Year, CountryCode, HolidayDate, HolidayName, Source, IsActive)
       VALUES (?, ?, ?, ?, 'manual', ?)`,
      [Number(year), normalizedCountryCode, normalizeDate(holidayDate), String(holidayName).trim(), isActive === false ? 0 : 1]
    );

    res.status(201).json({ success: true, holidayId: result.insertId });
  } catch (error) {
    console.error('Create holiday error:', error);
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
       SET HolidayDate = ?, HolidayName = ?, IsActive = ?
       WHERE Id = ?`,
      [normalizeDate(holidayDate), String(holidayName || '').trim(), isActive === false ? 0 : 1, holidayId]
    );

    res.json({ success: true, message: 'Holiday updated successfully' });
  } catch (error) {
    console.error('Update holiday error:', error);
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

    res.json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Delete holiday error:', error);
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

    if (nationalHolidays.length === 0) {
      return res.status(404).json({ success: false, message: 'Nager.Date returned no national holidays for this year/country' });
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
          `INSERT INTO Holidays (Year, CountryCode, HolidayDate, HolidayName, Source, IsActive)
           VALUES (?, ?, ?, ?, 'nager', 1)`,
          [numericYear, normalizedCountryCode, holidayDate, holidayName]
        );
        inserted += 1;
      }

      await connection.commit();

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
    console.error('Import holidays error:', error);
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
          'DELETE FROM Holidays WHERE Year = ? AND CountryCode = ?',
          [numericYear, normalizedCountryCode]
        );
      }

      let inserted = 0;
      for (const holiday of uniqueHolidays) {
        await connection.execute(
          `INSERT INTO Holidays (Year, CountryCode, HolidayDate, HolidayName, Source, IsActive)
           VALUES (?, ?, ?, ?, 'openholidays', 1)`,
          [numericYear, normalizedCountryCode, holiday.holidayDate, holiday.holidayName]
        );
        inserted += 1;
      }

      await connection.commit();

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
    console.error('Import OpenHolidays error:', error);
    res.status(500).json({ success: false, message: 'Failed to import holidays from OpenHolidays API' });
  }
});

export default router;
