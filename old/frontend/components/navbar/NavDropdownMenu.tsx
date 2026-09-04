import { RefObject } from 'react';

interface NavDropdownMenuItem {
  label: string;
  href: string;
  visible: boolean;
  onClick: () => void;
}

interface NavDropdownMenuProps {
  menuRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  title: string;
  onToggle: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  items: NavDropdownMenuItem[];
}

export default function NavDropdownMenu({
  menuRef,
  isOpen,
  title,
  onToggle,
  onMouseEnter,
  onMouseLeave,
  items,
}: NavDropdownMenuProps) {
  const visibleItems = items.filter((item) => item.visible);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="relative"
      ref={menuRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        onClick={onToggle}
        className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1"
      >
        <span>{title}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
          {visibleItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={item.onClick}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
