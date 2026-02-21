'use client';

import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string | number;
  label: string;
  subtitle?: string;
}

interface SearchableMultiSelectProps {
  values: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}: SearchableMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase()) ||
    option.subtitle?.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected options
  const selectedOptions = options.filter(opt => values.includes(opt.value));
  const displayValue = selectedOptions.length > 0
    ? `${selectedOptions.length} selected`
    : placeholder;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleToggle = (optionValue: string | number) => {
    const newValues = values.includes(optionValue)
      ? values.filter(v => v !== optionValue)
      : [...values, optionValue];
    onChange(newValues);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected value display / trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-left flex items-center justify-between ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        <span className={values.length > 0 ? '' : 'text-gray-400 dark:text-gray-500'}>
          {displayValue}
        </span>
        <div className="flex items-center gap-1">
          {values.length > 0 && !disabled && (
            <span
              onClick={handleClearAll}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1"
              title="Clear all"
            >
              ✕
            </span>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search...`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-2 text-gray-500 dark:text-gray-400 italic text-sm">
                {search ? 'No results found' : 'No options available'}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <div
                    key={option.value}
                    onClick={() => handleToggle(option.value)}
                    className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-3 ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className={`text-sm ${isSelected ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                        {option.label}
                      </div>
                      {option.subtitle && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{option.subtitle}</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selected count footer */}
          {values.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
              {values.length} item{values.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
