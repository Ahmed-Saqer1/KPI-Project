import React from 'react'
import { cn } from '../../lib/utils'

export function SelectNative({ className = '', ...props }) {
  return <select className={cn('h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-indigo-400', className)} {...props} />
}
