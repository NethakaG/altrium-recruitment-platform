import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { navigate } from '../lib/route'

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
  children: ReactNode
  current?: boolean
}

export function AppLink({ to, children, className, current = false, onClick, ...props }: AppLinkProps) {
  return (
    <a
      href={to}
      aria-current={current ? 'page' : undefined}
      className={className}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.ctrlKey || event.metaKey || event.shiftKey) return
        event.preventDefault()
        navigate(to)
      }}
      {...props}
    >
      {children}
    </a>
  )
}
