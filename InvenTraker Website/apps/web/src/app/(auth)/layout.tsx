export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0F19] px-6 py-14 text-app-text">
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  )
}
