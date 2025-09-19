import React from 'react'
import { cn } from '../../lib/utils'

export function Textarea({ className = '', ...props }) {
  return <textarea className={cn('min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-indigo-400', className)} {...props} />
}
