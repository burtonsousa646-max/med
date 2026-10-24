import { Link, type LinkProps } from 'react-router-dom'
import clsx from 'clsx'
import { buttonPriorityClasses, buttonSizeClasses, type ButtonPriority, type ButtonSize } from './Button'

interface LinkButtonProps extends LinkProps {
  priority?: ButtonPriority
  size?: ButtonSize
}

/** Ссылка, оформленная как Button — для навигационных CTA (react-router Link не может быть button). */
export function LinkButton({ priority = 'primary', size = 'l', className, children, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={clsx(
        'inline-flex items-center justify-center rounded-bee-pill transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bee-brand-tertiary focus-visible:ring-offset-2',
        'active:scale-[0.98]',
        buttonPriorityClasses[priority],
        buttonSizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}
