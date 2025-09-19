import React from 'react'
import { cn } from '../../lib/utils'

export function Badge({ variant = 'default', className = '', children }) {
  const variants = {
    default: 'bg-slate-100 text-slate-900 border border-slate-200',
    success: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border border-amber-200',
    destructive: 'bg-red-100 text-red-700 border border-red-200',
  }
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', variants[variant] || variants.default, className)}>{children}</span>
}
