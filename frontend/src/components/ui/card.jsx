import React from 'react'
import { cn } from '../../lib/utils'

export function Card({ className = '', children, ...props }) {
  return <div {...props} className={cn('rounded-xl border border-slate-200 bg-white/90 shadow', className)}>{children}</div>
}
export function CardHeader({ className = '', children, ...props }) {
  return <div {...props} className={cn('p-4 border-b border-slate-200', className)}>{children}</div>
}
export function CardTitle({ className = '', children, ...props }) {
  return <h2 {...props} className={cn('text-lg font-semibold tracking-tight', className)}>{children}</h2>
}
export function CardContent({ className = '', children, ...props }) {
  return <div {...props} className={cn('p-4', className)}>{children}</div>
}
