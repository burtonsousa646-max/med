import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

function FieldWrapper({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body-accent-sm font-medium text-bee-content-primary">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-bee-error-tertiary">{error}</p>
      ) : hint ? (
        <p className="text-caption text-bee-content-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

const inputBase =
  'h-11 w-full rounded-bee-md border bg-bee-bg-secondary px-3.5 text-body-sm text-bee-content-primary placeholder:text-bee-content-tertiary focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary disabled:cursor-not-allowed disabled:bg-bee-el-disabled'

interface CommonProps {
  label: string
  error?: string
  hint?: string
}

export const TextField = forwardRef<
  HTMLInputElement,
  CommonProps & InputHTMLAttributes<HTMLInputElement>
>(({ label, error, hint, id, className, ...rest }, ref) => {
  const fieldId = id ?? label
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        className={clsx(inputBase, error ? 'border-bee-error-primary' : 'border-bee-border-secondary', className)}
        {...rest}
      />
    </FieldWrapper>
  )
})
TextField.displayName = 'TextField'

export const TextareaField = forwardRef<
  HTMLTextAreaElement,
  CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ label, error, hint, id, className, rows = 4, ...rest }, ref) => {
  const fieldId = id ?? label
  return (
    <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={!!error}
        className={clsx(
          'w-full resize-y rounded-bee-md border bg-bee-bg-secondary px-3.5 py-2.5 text-body-sm text-bee-content-primary placeholder:text-bee-content-tertiary focus:outline-none focus:ring-2 focus:ring-bee-brand-tertiary',
          error ? 'border-bee-error-primary' : 'border-bee-border-secondary',
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  )
})
TextareaField.displayName = 'TextareaField'

interface SelectFieldProps extends CommonProps, SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, hint, id, className, options, ...rest }, ref) => {
    const fieldId = id ?? label
    return (
      <FieldWrapper label={label} htmlFor={fieldId} error={error} hint={hint}>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={clsx(inputBase, error ? 'border-bee-error-primary' : 'border-bee-border-secondary', className)}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldWrapper>
    )
  },
)
SelectField.displayName = 'SelectField'

export const CheckboxField = forwardRef<
  HTMLInputElement,
  { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>
>(({ label, error, id, className, ...rest }, ref) => {
  const fieldId = id ?? 'checkbox'
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="flex cursor-pointer items-start gap-2.5">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={!!error}
          className={clsx('mt-0.5 size-4 shrink-0 rounded accent-bee-brand-primary', className)}
          {...rest}
        />
        <span className="text-body-sm text-bee-content-primary">{label}</span>
      </label>
      {error && <p className="pl-6.5 text-caption text-bee-error-tertiary">{error}</p>}
    </div>
  )
})
CheckboxField.displayName = 'CheckboxField'
