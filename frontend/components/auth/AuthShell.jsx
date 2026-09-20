import { BrandLogo } from '@/components/brand/BrandLogo';

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative min-h-[calc(100vh-8rem)] overflow-hidden bg-surface-muted/50 py-10 sm:py-14">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 100% 0%, rgba(0,109,68,0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(0,109,68,0.08), transparent 50%)',
        }}
      />
      <div className="mx-auto w-full max-w-md px-4 sm:px-6">
        <div className="mb-6 text-center sm:mb-8">
          <BrandLogo className="justify-center" size="md" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-ink-muted sm:text-base">{subtitle}</p> : null}
        </div>
        <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-7">
          {children}
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div> : null}
      </div>
    </div>
  );
}
