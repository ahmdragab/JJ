import { forwardRef, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  triggerClassName?: string;
  label?: string;
  id?: string;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      value,
      onChange,
      options,
      placeholder = 'Select...',
      disabled = false,
      error = false,
      size = 'md',
      className,
      triggerClassName,
      label,
      id,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Find the selected option
    const selectedOption = options.find((opt) => opt.value === value);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isOpen]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          setIsOpen(!isOpen);
          break;
        case 'Escape':
          setIsOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            const currentIndex = options.findIndex((opt) => opt.value === value);
            const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
            if (!options[nextIndex].disabled) {
              onChange(options[nextIndex].value);
            }
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (isOpen) {
            const currentIndex = options.findIndex((opt) => opt.value === value);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
            if (!options[prevIndex].disabled) {
              onChange(options[prevIndex].value);
            }
          }
          break;
      }
    };

    const handleSelect = (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    const sizeClasses = {
      sm: 'py-1.5 px-3 text-sm',
      md: 'py-2.5 px-4 text-sm',
      lg: 'py-3 px-4 text-base',
    };

    return (
      <div ref={ref} className={cn('relative', className)}>
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-neutral-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div ref={containerRef} className="relative">
          {/* Trigger Button */}
          <button
            ref={triggerRef}
            id={id}
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              'w-full inline-flex items-center justify-between gap-2',
              'bg-white border rounded-xl',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary',
              sizeClasses[size],
              disabled && 'opacity-50 cursor-not-allowed bg-neutral-50',
              error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
              !error && !disabled && 'border-neutral-200 hover:border-neutral-300',
              triggerClassName
            )}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
          >
            <span
              className={cn(
                'truncate text-left whitespace-nowrap',
                selectedOption ? 'text-neutral-800' : 'text-neutral-400'
              )}
            >
              {selectedOption?.label || placeholder}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 shrink-0 text-neutral-400 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div
              className="absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden"
              role="listbox"
            >
              <div className="max-h-60 overflow-auto py-1">
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5 text-sm text-left',
                      'transition-colors duration-100',
                      option.value === value
                        ? 'bg-brand-primary/5 text-brand-primary'
                        : 'text-neutral-700 hover:bg-neutral-50',
                      option.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    role="option"
                    aria-selected={option.value === value}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === value && (
                      <Check className="w-4 h-4 shrink-0 text-brand-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

Select.displayName = 'Select';
