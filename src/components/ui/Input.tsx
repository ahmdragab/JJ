import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { inputStyles } from '../../lib/design-system';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: 'sm' | 'md' | 'lg';
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', error, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          inputStyles.base,
          inputStyles.sizes[inputSize],
          error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends Omit<InputHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  inputSize?: 'sm' | 'md' | 'lg';
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ inputSize = 'md', error, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          inputStyles.base,
          inputStyles.sizes[inputSize],
          'resize-none',
          error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';
