export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-headline-sm font-medium text-bee-content-primary">{title}</h1>
      {description && <p className="max-w-2xl text-body-sm text-bee-content-secondary">{description}</p>}
      <div className="mt-4 rounded-bee-xl border border-dashed border-bee-border-secondary p-10 text-center text-body-sm text-bee-content-tertiary">
        Экран будет наполнен в следующей фазе сборки.
      </div>
    </div>
  )
}
