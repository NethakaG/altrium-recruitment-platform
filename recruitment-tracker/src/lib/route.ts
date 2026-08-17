import { useEffect, useState } from 'react'

const navigationEvent = 'altrium:navigate'

export function navigate(path: string) {
  if (window.location.pathname === path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event(navigationEvent))
}

export function usePathname() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    window.addEventListener(navigationEvent, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(navigationEvent, update)
    }
  }, [])

  return path
}
