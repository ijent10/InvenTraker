import Link from "next/link"

export function Button({
  children,
  variant = "primary",
  type = "button",
  className = "",
  icon,
  ...props
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost"
  type?: "button" | "submit" | "reset"
  className?: string
  icon?: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const styles = {
    primary: "border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-on-accent)] hover:bg-[var(--app-accent-strong)]",
    secondary: "border-[var(--app-control-border)] bg-[var(--app-control-bg)] text-[var(--app-control-text)] hover:bg-[var(--app-control-bg-hover)]",
    ghost: "border-transparent bg-transparent text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
  }

  return (
    <button
      type={type}
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold leading-5 transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  className = "",
  icon
}: {
  children: React.ReactNode
  href: string
  variant?: "primary" | "secondary" | "ghost"
  className?: string
  icon?: React.ReactNode
}) {
  const styles = {
    primary: "border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-on-accent)] hover:bg-[var(--app-accent-strong)]",
    secondary: "border-[var(--app-control-border)] bg-[var(--app-control-bg)] text-[var(--app-control-text)] hover:bg-[var(--app-control-bg-hover)]",
    ghost: "border-transparent bg-transparent text-[var(--app-muted)] hover:bg-[var(--app-control-bg-hover)] hover:text-[var(--app-text)]"
  }

  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold leading-5 transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] ${styles[variant]} ${className}`}
    >
      {icon}
      {children}
    </Link>
  )
}

export function Panel({
  children,
  className = "",
  ...props
}: {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={`rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] ${className}`}>
      {children}
    </section>
  )
}

export function StatusPill({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode
  tone?: "green" | "amber" | "blue" | "red" | "neutral"
}) {
  const styles = {
    blue: "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    red: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    neutral: "border-[var(--app-control-border)] bg-[var(--app-control-bg)] text-[var(--app-muted)]"
  }

  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>
}

export function Field({
  label,
  children,
  hint
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--app-muted)]">
      {label}
      <div className="mt-2">{children}</div>
      {hint ? <p className="app-tip mt-1 text-xs font-normal leading-5 text-[var(--app-subtle)]">{hint}</p> : null}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 text-sm text-[var(--app-control-text)] outline-none transition placeholder:text-[var(--app-subtle)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] ${props.className ?? ""}`}
    />
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-24 w-full rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 py-2 text-sm text-[var(--app-control-text)] outline-none transition placeholder:text-[var(--app-subtle)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] ${props.className ?? ""}`}
    />
  )
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full cursor-pointer rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] px-3 text-sm text-[var(--app-control-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] ${props.className ?? ""}`}
    />
  )
}

export function ToggleRow({
  title,
  description,
  checked = true,
  onChange,
  name
}: {
  title: string
  description: string
  checked?: boolean
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  name?: string
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 transition hover:border-[var(--app-accent)] hover:bg-[var(--app-control-bg-hover)] has-[:checked]:border-[var(--app-accent)] has-[:checked]:bg-[var(--app-accent-soft)]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 rounded border-[var(--app-control-border)] bg-[var(--app-control-bg)] accent-[var(--app-accent)]"
      />
      <span>
        <span className="block text-sm font-semibold text-[var(--app-text)]">{title}</span>
        <span className="app-tip mt-1 block text-sm leading-5 text-[var(--app-muted)]">{description}</span>
      </span>
    </label>
  )
}
