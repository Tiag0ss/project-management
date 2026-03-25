'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { CustomFieldDefinition, CustomFieldValues, normalizeCustomFieldInputValue } from '@/lib/customFields';

interface CustomFieldsFormSectionProps {
  tableName: string;
  token?: string;
  values: CustomFieldValues;
  onChange: (values: CustomFieldValues) => void;
  title?: string;
  disabled?: boolean;
}

export default function CustomFieldsFormSection({
  tableName,
  token,
  values,
  onChange,
  title = 'Custom Fields',
  disabled = false,
}: CustomFieldsFormSectionProps) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setFields([]);
      return;
    }

    let isMounted = true;

    const loadFields = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${getApiUrl()}/api/custom-fields/${tableName}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (isMounted) setFields([]);
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setFields(data.customFields || []);
        }
      } catch {
        if (isMounted) {
          setFields([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadFields();

    return () => {
      isMounted = false;
    };
  }, [tableName, token]);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.DisplayName.localeCompare(b.DisplayName)),
    [fields],
  );

  const updateValue = (fieldName: string, dataType: string, value: string | number | boolean | null | undefined) => {
    onChange({
      ...values,
      [fieldName]: normalizeCustomFieldInputValue(dataType, value),
    });
  };

  if (!token || (!isLoading && sortedFields.length === 0)) {
    return null;
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading custom fields...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedFields.map((field) => {
            const value = values[field.FieldName] ?? null;
            const isRequired = Number(field.IsRequired) === 1;

            if (field.DataType === 'tinyint(1)') {
              return (
                <div key={field.Id} className="md:col-span-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => updateValue(field.FieldName, field.DataType, event.target.checked)}
                      disabled={disabled}
                      className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {field.DisplayName}
                        {isRequired && <span className="text-red-500 ml-1">*</span>}
                      </div>
                      {field.Description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.Description}</div>
                      )}
                    </div>
                  </label>
                </div>
              );
            }

            const commonLabel = (
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {field.DisplayName}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
            );

            const commonHint = field.Description ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.Description}</p>
            ) : null;

            if (field.DataType === 'text') {
              return (
                <div key={field.Id} className="md:col-span-2">
                  {commonLabel}
                  <textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => updateValue(field.FieldName, field.DataType, event.target.value)}
                    rows={3}
                    required={isRequired}
                    disabled={disabled}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {commonHint}
                </div>
              );
            }

            const inputType = field.DataType === 'date'
              ? 'date'
              : field.DataType === 'int' || field.DataType.startsWith('decimal(')
                ? 'number'
                : 'text';

            const step = field.DataType === 'int'
              ? '1'
              : field.DataType.startsWith('decimal(')
                ? '0.01'
                : undefined;

            return (
              <div key={field.Id}>
                {commonLabel}
                <input
                  type={inputType}
                  step={step}
                  value={value === null || value === undefined ? '' : String(value)}
                  onChange={(event) => updateValue(field.FieldName, field.DataType, event.target.value)}
                  required={isRequired}
                  disabled={disabled}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {commonHint}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
