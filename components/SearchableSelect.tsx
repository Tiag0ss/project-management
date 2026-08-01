'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  autoSelectSingleOption?: boolean;
  dropdownMode?: 'inline' | 'portal';
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  emptyText = 'None',
  className = '',
  disabled = false,
  autoSelectSingleOption = false,
  dropdownMode = 'portal',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search
  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected option label
  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const hasSelectedValue = value !== '' && value !== null && value !== undefined && String(value) !== '0' && !!selectedOption;
  const displayValue = selectedOption?.label || emptyText;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      const clickedInsideTrigger = !!containerRef.current?.contains(targetNode);
      const clickedInsideDropdown = !!dropdownRef.current?.contains(targetNode);
      if (!clickedInsideTrigger && !clickedInsideDropdown) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || dropdownMode !== 'portal') {
      return;
    }

    const updatePosition = () => {
      const triggerRect = containerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const menuEstimatedHeight = 280;
      const shouldOpenUpward = triggerRect.bottom + menuEstimatedHeight > window.innerHeight && triggerRect.top > menuEstimatedHeight;

      setMenuStyle({
        position: 'fixed',
        left: triggerRect.left,
        width: triggerRect.width,
        top: shouldOpenUpward ? triggerRect.top - 6 : triggerRect.bottom + 6,
        transform: shouldOpenUpward ? 'translateY(-100%)' : undefined,
        zIndex: 2147483000,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, dropdownMode]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // Auto-select when there is exactly one valid option (create flows)
  useEffect(() => {
    if (!autoSelectSingleOption || disabled) return;
    const hasValue = value !== '' && value !== null && value !== undefined && String(value) !== '0';
    if (hasValue) return;
    if (options.length !== 1) return;

    const singleOptionValue = String(options[0].value ?? '').trim();
    if (!singleOptionValue || singleOptionValue === '0') return;

    onChange(String(options[0].value));
  }, [autoSelectSingleOption, disabled, value, options, onChange]);

  const handleSelect = (optionValue: string | number) => {
    onChange(String(optionValue));
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setSearch('');
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
        <span className={hasSelectedValue ? '' : 'text-gray-400 dark:text-gray-500'}>
          {displayValue}
        </span>
        <div className="flex items-center gap-1">
          {hasSelectedValue && !disabled && (
            <span
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1"
              title="Clear"
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
        <>
        {dropdownMode === 'portal' ? createPortal(
          <div ref={dropdownRef} style={menuStyle} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
            {/* Search input */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-600">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${placeholder.toLowerCase()}...`}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options list */}
            <div className="overflow-y-auto max-h-48">
              {emptyText && (
                <div
                  onClick={() => handleSelect('')}
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-gray-500 dark:text-gray-400 italic"
                >
                  {emptyText}
                </div>
              )}
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-2 text-gray-500 dark:text-gray-400 italic text-sm">
                  {search ? 'No results found' : 'No options available'}
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option.value)}
                    className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${
                      String(option.value) === String(value)
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {option.label}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        ) : (
          <div ref={dropdownRef} className="absolute z-[9999] w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto max-h-48">
            {emptyText && (
              <div
                onClick={() => handleSelect('')}
                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-gray-500 dark:text-gray-400 italic"
              >
                {emptyText}
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-2 text-gray-500 dark:text-gray-400 italic text-sm">
                {search ? 'No results found' : 'No options available'}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    String(option.value) === String(value)
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
