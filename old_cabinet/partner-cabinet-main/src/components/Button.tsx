import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import clsx from 'clsx'

export type ButtonPriority =
  | 'primary'
  | 'secondary-on-primary'
  | 'secondary-on-secondary'
  | 'tertiary'
  | 'destructive'

export type ButtonSize = 'l' | 'm'

interface BaseProps {
  priority?: ButtonPriority
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

export const buttonPriorityClasses: Record<ButtonPriority, string> = {
  primary:
    'bg-bee-brand-primary text-bee-content-primary hover:bg-bee-brand-secondary active:bg-bee-brand-tertiary',
  'secondary-on-primary':
    'bg-bee-el-primary text-bee-content-primary border border-bee-border-secondary hover:bg-bee-el-secondary',
  'secondary-on-secondary':
    'bg-bee-el-secondary text-bee-content-primary hover:bg-bee-el-tertiary',
  tertiary: 'bg-transparent text-bee-content-primary hover:bg-bee-el-secondary',
  destructive: 'bg-bee-error-primary text-bee-light hover:bg-bee-error-secondary',
}

export const buttonSizeClasses: Record<ButtonSize, string> = {
  l: 'h-[52px] px-6 gap-2 text-body-accent-md font-medium',
  m: 'h-11 px-5 gap-1.5 text-body-accent-sm font-medium',
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current" />
    </span>
  )
}

export interface ButtonProps
  extends BaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      priority = 'primary',
      size = 'l',
      loading = false,
      fullWidth = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={clsx(
          'inline-flex items-center justify-center rounded-bee-pill transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary focus-visible:ring-offset-2',
          'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
          buttonPriorityClasses[priority],
          buttonSizeClasses[size],
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {loading ? <Dots /> : children}
      </button>
    )
  },
)
Button.displayName = 'Button'

export interface IconButtonProps
  extends BaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ priority = 'secondary-on-secondary', size = 'm', icon, className, ...rest }, ref) => {
    const dim = size === 'l' ? 'h-[52px] w-[52px]' : 'h-11 w-11'
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        className={clsx(
          'inline-flex items-center justify-center rounded-bee-pill transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary focus-visible:ring-offset-2',
          'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
          buttonPriorityClasses[priority],
          dim,
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    )
  },
)
IconButton.displayName = 'IconButton'
