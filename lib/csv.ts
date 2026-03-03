export type CsvRow = Record<string, string>;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseCsv(text: string): CsvRow[] {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return [];

  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell.trim());
  rows.push(currentRow);

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const mapped: CsvRow = {};
      headers.forEach((header, index) => {
        mapped[header] = (row[index] || '').trim();
      });
      return mapped;
    });
}

export function toCsv(rows: CsvRow[], headers: string[]): string {
  const escapeCell = (cell: unknown): string => {
    const stringValue = String(cell ?? '');
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCell(row[header] ?? '')).join(','));
  });

  return `${lines.join('\n')}\n`;
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseBooleanLike(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

export function parseNumberLike(value: string): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}
