'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';
import { COUNTRY_OPTIONS } from '@/lib/constants/countries';
import SearchableSelect from '@/components/SearchableSelect';
import { useToast } from '@/contexts/ToastContext';

interface HolidayItem {
  Id: number;
  Year: number;
  CountryCode: string;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

export default function HolidaysManagement() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const countryOptions = COUNTRY_OPTIONS.map((country) => ({
    value: country.code,
    label: `${country.name} (${country.code})`
  }));
  const [holidayYear, setHolidayYear] = useState<number>(new Date().getFullYear());
  const [holidayCountryCode, setHolidayCountryCode] = useState<string>('PT');
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingOpenHolidays, setIsImportingOpenHolidays] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (token) {
      loadHolidays(holidayYear, holidayCountryCode);
    }
  }, [token, holidayYear, holidayCountryCode]);

  const loadHolidays = async (year: number, countryCode: string) => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError('');

      const response = await fetch(
        `${getApiUrl()}/api/holidays?year=${year}&countryCode=${countryCode}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load holidays');
      }

      setHolidays(data.holidays || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load holidays');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!holidayDate || !holidayName.trim()) {
      setError('Date and holiday name are required');
      return;
    }

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          holidayDate,
          holidayName: holidayName.trim(),
          isActive: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add holiday');
      }

      setHolidayDate('');
      setHolidayName('');
      setSuccess('Holiday added successfully');
      showToast({ type: 'success', title: 'Holiday', message: 'Holiday added successfully' });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || 'Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (holidayId: number) => {
    if (!token) return;

    try {
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/${holidayId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete holiday');
      }

      setSuccess('Holiday deleted successfully');
      showToast({ type: 'success', title: 'Holiday', message: 'Holiday deleted successfully' });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || 'Failed to delete holiday');
    }
  };

  const handleImportFromNagerDate = async () => {
    if (!token) return;

    try {
      setIsImporting(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/import/nager-date`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to import holidays');
      }

      setSuccess(`Imported ${data.inserted || 0} holidays from Nager.Date`);
      showToast({ type: 'success', title: 'Holidays Imported', message: `Imported ${data.inserted || 0} holidays from Nager.Date` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || 'Failed to import holidays');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFromOpenHolidays = async () => {
    if (!token) return;

    try {
      setIsImportingOpenHolidays(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiUrl()}/api/holidays/import/openholidays`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to import holidays');
      }

      setSuccess(`Imported ${data.inserted || 0} holidays from OpenHolidays API`);
      showToast({ type: 'success', title: 'Holidays Imported', message: `Imported ${data.inserted || 0} holidays from OpenHolidays API` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || 'Failed to import holidays');
    } finally {
      setIsImportingOpenHolidays(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Holidays</h2>
        <p className="text-gray-600 dark:text-gray-400">Configure holidays per year and country.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Year</label>
            <input
              type="number"
              value={holidayYear}
              onChange={(e) => setHolidayYear(parseInt(e.target.value || String(new Date().getFullYear()), 10))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Country</label>
            <SearchableSelect
              value={holidayCountryCode}
              onChange={(value) => setHolidayCountryCode(value || 'PT')}
              options={countryOptions}
              placeholder="Country"
              emptyText=""
              className="w-full"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleImportFromNagerDate}
              disabled={isImporting}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors font-medium"
            >
              {isImporting ? 'Importing...' : 'Import from Nager.Date'}
            </button>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleImportFromOpenHolidays}
              disabled={isImportingOpenHolidays}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors font-medium"
            >
              {isImportingOpenHolidays ? 'Importing...' : 'Import from OpenHolidays'}
            </button>
          </div>
        </div>

        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input
            type="date"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <input
            type="text"
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="Holiday name"
            className="md:col-span-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
          >
            Add Holiday
          </button>
        </form>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Source</th>
                <th scope="col" className="relative px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading holidays...
                  </td>
                </tr>
              ) : holidays.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    No holidays configured for this year/country.
                  </td>
                </tr>
              ) : (
                holidays.map((holiday) => (
                  <tr key={holiday.Id}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{String(holiday.HolidayDate).split('T')[0]}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{holiday.HolidayName}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{holiday.Source}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(holiday.Id)}
                        title="Delete holiday"
                        aria-label="Delete holiday"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
