'use client'

import { useState, useEffect } from 'react'

let cachedValue: boolean | null = null
let fetchPromise: Promise<boolean> | null = null

async function fetchLanguagesEnabled(): Promise<boolean> {
  if (fetchPromise) return fetchPromise
  fetchPromise = fetch('/api/settings/languages')
    .then((r) => r.json())
    .then((d) => {
      cachedValue = d.enabled === true
      fetchPromise = null
      return cachedValue as boolean
    })
    .catch(() => {
      fetchPromise = null
      return false
    })
  return fetchPromise
}

export function useLanguagesEnabled() {
  const [enabled, setEnabled] = useState<boolean>(cachedValue ?? false)
  const [loading, setLoading] = useState<boolean>(cachedValue === null)

  useEffect(() => {
    if (cachedValue !== null) {
      setEnabled(cachedValue)
      setLoading(false)
      return
    }
    fetchLanguagesEnabled().then((val) => {
      setEnabled(val)
      setLoading(false)
    })
  }, [])

  return { languagesEnabled: enabled, loading }
}
