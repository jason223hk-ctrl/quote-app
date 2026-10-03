import { useEffect, useState } from 'react'
import { listPending, RENAME_PENDING_EVENT, type RenamePending } from './renamePending'

/** 而家呢部機有咩「改名未完成」。⭐ 改名完／另一個分頁改咗都會即刻更新。 */
export function useRenamePending(): RenamePending[] {
  const [items, setItems] = useState<RenamePending[]>(() => listPending(new Date()))
  useEffect(() => {
    const refresh = () => setItems(listPending(new Date()))
    window.addEventListener(RENAME_PENDING_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RENAME_PENDING_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return items
}
