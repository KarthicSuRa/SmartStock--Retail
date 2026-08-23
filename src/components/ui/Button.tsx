'use client';

// /src/components/ui/Button.tsx
// SmartStock Experience V1 — Enterprise Button Component

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors duration-140 select-none disabled:opacity-50 disabled:pointer-events-none rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2';

    const sizeStyles = {
      sm: 'text-xs h-8 px-2.5 gap-1.5',
      md: 'text-sm h-9 px-3.5 gap-2',
      lg: 'text-sm h-10 px-4 gap-2 font-semibold',
    };

    const variantStyles = {
      primary:
        'bg-[#14706B] text-white hover:bg-[#0E5652] active:bg-[#0A4441] border border-[#14706B] shadow-xs',
      secondary:
        'bg-white text-[#101828] hover:bg-[#F9FAFB] active:bg-[#F2F4F7] border border-[#D0D5DD] shadow-xs',
      outline:
        'bg-transparent text-[#344054] hover:bg-[#F9FAFB] active:bg-[#F2F4F7] border border-[#D0D5DD]',
      ghost:
        'bg-transparent text-[#475467] hover:bg-[#F2F4F7] hover:text-[#101828] active:bg-[#EAECF0]',
      danger:
        'bg-[#D92D20] text-white hover:bg-[#B42318] active:bg-[#912018] border border-[#D92D20] shadow-xs',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
