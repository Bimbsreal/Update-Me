import { cn } from '@/lib/cn';

export function Container({ children, className }) {
  return <div className={cn('container-page', className)}>{children}</div>;
}
