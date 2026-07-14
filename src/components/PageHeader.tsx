interface PageHeaderProps {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-subtle)]">
      <div>
        <h1 className="text-[length:var(--fs-3xl)] font-[number:var(--font-medium)] tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[length:var(--fs-base)] text-[var(--text-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  )
}
