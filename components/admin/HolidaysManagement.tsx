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
  RegionCode: string | null;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

interface Subdivision {
  code: string;
  name: string;
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
  const [holidayRegionCode, setHolidayRegionCode] = useState('');
  const [municipalitySelectValue, setMunicipalitySelectValue] = useState('');
  const [municipalityNewText, setMunicipalityNewText] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'national' | string>('all');
  const [subdivisions, setSubdivisions] = useState<Subdivision[]>([]);
  const [selectedSubdivision, setSelectedSubdivision] = useState('');
  const [regionalSource, setRegionalSource] = useState<'openholidays' | 'nager'>('openholidays');
  const [loadingSubdivisions, setLoadingSubdivisions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingOpenHolidays, setIsImportingOpenHolidays] = useState(false);
  const [isImportingRegional, setIsImportingRegional] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (token) {
      loadHolidays(holidayYear, holidayCountryCode);
    }
  }, [token, holidayYear, holidayCountryCode]);

  useEffect(() => {
    if (token && holidayCountryCode) {
      loadSubdivisions(holidayCountryCode, holidayYear, regionalSource);
    }
  }, [token, holidayCountryCode, holidayYear, regionalSource]);

  const loadSubdivisions = async (countryCode: string, year: number, source: 'openholidays' | 'nager') => {
    if (!token) return;
    try {
      setLoadingSubdivisions(true);
      setSelectedSubdivision('');
      const url = source === 'nager'
        ? `${getApiUrl()}/api/holidays/nager-counties/${countryCode}/${year}`
        : `${getApiUrl()}/api/holidays/subdivisions/${countryCode}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setSubdivisions(data.subdivisions || []);
    } catch {
      setSubdivisions([]);
    } finally {
      setLoadingSubdivisions(false);
    }
  };

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
          regionCode: holidayRegionCode.trim() || null,
          isActive: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add holiday');
      }

      setHolidayDate('');
      setHolidayName('');
      setHolidayRegionCode('');
      setMunicipalitySelectValue('');
      setMunicipalityNewText('');
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

  const handleImportRegional = async () => {
    if (!token || !selectedSubdivision) return;

    try {
      setIsImportingRegional(true);
      setError('');
      setSuccess('');

      const endpoint = regionalSource === 'nager'
        ? `${getApiUrl()}/api/holidays/import/nager-regional`
        : `${getApiUrl()}/api/holidays/import/openholidays-regional`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: holidayYear,
          countryCode: holidayCountryCode,
          subdivisionCode: selectedSubdivision,
          replaceExisting: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to import regional holidays');
      }

      const subName = subdivisions.find((s) => s.code === selectedSubdivision)?.name || selectedSubdivision;
      setSuccess(`Imported ${data.inserted || 0} regional holidays for ${subName}`);
      showToast({ type: 'success', title: 'Regional Holidays Imported', message: `Imported ${data.inserted || 0} holidays for ${subName}` });
      await loadHolidays(holidayYear, holidayCountryCode);
    } catch (err: any) {
      setError(err.message || 'Failed to import regional holidays');
    } finally {
      setIsImportingRegional(false);
    }
  };

  // Compute available region codes for the filter dropdown
  const availableRegions = Array.from(
    new Set(holidays.map((h) => h.RegionCode).filter(Boolean))
  ).sort() as string[];

  // Municipalities = regions in DB that are NOT formal API subdivisions
  const existingMunicipalities = availableRegions.filter(
    (r) => !subdivisions.find((s) => s.code === r)
  );

  const filteredHolidays = holidays.filter((h) => {
    if (regionFilter === 'all') return true;
    if (regionFilter === 'national') return !h.RegionCode;
    return h.RegionCode === regionFilter;
  });

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
        {/* Year + Country + National imports */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
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
              title="Imports national + regional holidays (with county codes)"
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
              title="Imports national holidays only"
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors font-medium"
            >
              {isImportingOpenHolidays ? 'Importing...' : 'Import from OpenHolidays'}
            </button>
          </div>
        </div>

        {/* Regional import */}
        <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Import Regional / Subdivision Holidays
            </label>
            <div className="flex gap-1">
              {(['openholidays', 'nager'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setRegionalSource(src)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    regionalSource === src
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-800'
                  }`}
                >
                  {src === 'openholidays' ? 'OpenHolidays' : 'Nager.Date'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              {loadingSubdivisions ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading regions…</div>
              ) : subdivisions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 italic">
                  No subdivisions available for this country / source
                </div>
              ) : (
                <select
                  value={selectedSubdivision}
                  onChange={(e) => setSelectedSubdivision(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">— select a region —</option>
                  {subdivisions.map((s) => (
                    <option key={s.code} value={s.code}>{s.name !== s.code ? `${s.name} (${s.code})` : s.code}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              onClick={handleImportRegional}
              disabled={isImportingRegional || !selectedSubdivision}
              className="h-10 px-4 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium text-sm whitespace-nowrap"
            >
              {isImportingRegional ? 'Importing…' : 'Import Region'}
            </button>
          </div>
        </div>

        {/* Add holiday form */}
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Add Holiday Manually</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Use this to add <strong>municipal / local holidays</strong> (e.g. Constância, Alcanena) that are not available via the import APIs.
            Choose a formal <em>Region / Subdivision</em> for autonomous regions, or use the <em>Municipality</em> dropdown to select an existing one or add a new name.
          </p>
          <form onSubmit={handleAddHoliday} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Holiday name</label>
              <input
                type="text"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="e.g. Dia do Município de Constância"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Region / Subdivision
                <span className="ml-1 text-gray-400 font-normal">(or leave as National)</span>
              </label>
              <select
                value={holidayRegionCode && subdivisions.find(s => s.code === holidayRegionCode) ? holidayRegionCode : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setHolidayRegionCode(val);
                  // Clear municipality when a formal subdivision is chosen
                  if (val) {
                    setMunicipalitySelectValue('');
                    setMunicipalityNewText('');
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">National / Municipality</option>
                {subdivisions.map((s) => (
                  <option key={s.code} value={s.code}>{s.name !== s.code ? `${s.name} (${s.code})` : s.code}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Municipality
                <span className="ml-1 text-gray-400 font-normal">(optional)</span>
              </label>
              {subdivisions.find(s => s.code === holidayRegionCode) ? (
                <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                  Not applicable when a subdivision is selected
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <select
                    value={municipalitySelectValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMunicipalitySelectValue(val);
                      if (val === '__new__') {
                        setHolidayRegionCode(municipalityNewText);
                      } else {
                        setHolidayRegionCode(val);
                        setMunicipalityNewText('');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">— National (no municipality) —</option>
                    {existingMunicipalities.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__new__">+ Add new municipality…</option>
                  </select>
                  {municipalitySelectValue === '__new__' && (
                    <input
                      type="text"
                      value={municipalityNewText}
                      onChange={(e) => {
                        setMunicipalityNewText(e.target.value);
                        setHolidayRegionCode(e.target.value);
                      }}
                      placeholder="e.g. Constância"
                      autoFocus
                      className="w-full px-3 py-2 text-sm border border-blue-400 dark:border-blue-500 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  )}
                </div>
              )}
            </div>
            <div className="md:col-span-12 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium text-sm"
              >
                Add Holiday
              </button>
            </div>
          </form>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Region filter */}
          {(availableRegions.length > 0 || holidays.length > 0) && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Show:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'national', label: 'National only' },
                  ...availableRegions.map((r) => {
                    const sub = subdivisions.find((s) => s.code === r);
                    return { key: r, label: sub ? `${sub.name} (${r})` : r };
                  }),
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRegionFilter(key as any)}
                    className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                      regionFilter === key
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Region</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Source</th>
                <th scope="col" className="relative px-4 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading holidays...
                  </td>
                </tr>
              ) : filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    No holidays configured for this year/country.
                  </td>
                </tr>
              ) : (
                filteredHolidays.map((holiday) => (
                  <tr key={holiday.Id}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{String(holiday.HolidayDate).split('T')[0]}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{holiday.HolidayName}</td>
                    <td className="px-4 py-2 text-sm">
                      {holiday.RegionCode ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs font-medium" title={holiday.RegionCode}>
                          {subdivisions.find(s => s.code === holiday.RegionCode)?.name || holiday.RegionCode}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">National</span>
                      )}
                    </td>
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
