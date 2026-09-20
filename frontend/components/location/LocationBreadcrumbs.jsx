import Link from 'next/link';
import { cn } from '@/lib/cn';

export function LocationBreadcrumbs({ items = [], className }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Location breadcrumb" className={cn('text-sm text-ink-muted', className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.type}-${item.id || item.name}`} className="inline-flex items-center gap-2">
            {index > 0 ? <span aria-hidden className="text-ink-soft">→</span> : null}
            {item.href ? (
              <Link href={item.href} className="font-medium text-brand-700 hover:underline">
                {item.name}
              </Link>
            ) : (
              <span className={index === items.length - 1 ? 'font-semibold text-ink' : undefined}>
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
