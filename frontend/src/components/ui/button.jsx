import React from 'react'
import { cn } from '../../lib/utils'

export function Button({ variant = 'default', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-9 px-4'
  const variants = {
    default: 'bg-indigo-600 text-white hover:bg-indigo-500',
    outline: 'border border-slate-200 hover:bg-slate-50',
    ghost: 'hover:bg-slate-100',
    secondary: 'bg-slate-900 text-white hover:bg-slate-800',
  }
  return <button className={cn(base, variants[variant] || variants.default, className)} {...props} />
}
