import { buildBurndownSeries, toDateOnlyString } from '../../server/utils/burndownSeries';

describe('toDateOnlyString', () => {
  it('keeps YYYY-MM-DD strings as-is', () => {
    expect(toDateOnlyString('2026-03-29')).toBe('2026-03-29');
    expect(toDateOnlyString('2026-03-29T15:30:00.000Z')).toBe('2026-03-29');
  });

  it('formats Date values with UTC calendar day', () => {
    expect(toDateOnlyString(new Date(Date.UTC(2026, 2, 29)))).toBe('2026-03-29');
  });
});

describe('buildBurndownSeries', () => {
  it('does not duplicate dates across EU spring DST (2026-03-29)', () => {
    const series = buildBurndownSeries({
      startDate: '2026-03-25',
      endDate: '2026-04-05',
      maxDate: '2026-04-05',
      totalEstimatedHours: 80,
      dailyMap: { '2026-03-29': 4 },
    });

    const dates = series.map((s) => s.date);
    expect(dates).toEqual([...new Set(dates)]);
    expect(dates).toContain('2026-03-28');
    expect(dates).toContain('2026-03-29');
    expect(dates).toContain('2026-03-30');
    expect(dates.filter((d) => d === '2026-03-29')).toHaveLength(1);
  });

  it('accumulates worked hours and remaining', () => {
    const series = buildBurndownSeries({
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      maxDate: '2026-01-03',
      totalEstimatedHours: 10,
      dailyMap: { '2026-01-01': 2, '2026-01-02': 3 },
    });

    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ date: '2026-01-01', worked: 2, cumulative: 2, remaining: 8 });
    expect(series[1]).toMatchObject({ date: '2026-01-02', worked: 3, cumulative: 5, remaining: 5 });
    expect(series[2]).toMatchObject({ date: '2026-01-03', worked: 0, cumulative: 5, remaining: 5 });
  });
});
