import React from 'react'
import { cn } from '../../lib/utils'

export function Checkbox({ className = '', ...props }) {
  return <input type="checkbox" className={cn('h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400', className)} {...props} />
}
