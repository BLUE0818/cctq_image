import type { InputHTMLAttributes, ReactNode } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  tone?: 'primary' | 'danger'
}

export default function Checkbox({ checked, onChange, label, tone = 'primary', className, ...props }: CheckboxProps) {
  const toneClasses = tone === 'danger'
    ? 'border-red-300/80 hover:border-red-400/80 checked:bg-red-500/85 checked:border-transparent focus:ring-red-500/20 dark:border-red-500/30 dark:hover:border-red-500/50 dark:checked:bg-red-500/60 dark:checked:border-transparent'
    : 'border-gray-300 hover:border-gray-400 checked:bg-blue-500 checked:border-blue-500 focus:ring-blue-500/20 dark:border-white/15 dark:hover:border-white/30 dark:checked:bg-blue-500 dark:checked:border-transparent'

  return (
    <label className={`flex cursor-pointer items-center gap-2.5 group ${className || ''}`}>
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className={`peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border bg-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:bg-white/5 dark:focus:ring-offset-gray-900 ${toneClasses}`}
          {...props}
        />
        <svg
          className="pointer-events-none absolute h-2.5 w-2.5 scale-50 text-white opacity-0 transition-all duration-200 peer-checked:scale-100 peer-checked:opacity-100"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.5l3.5 3.5L19 6.5" />
        </svg>
      </div>
      {label && (
        <span className="select-none text-[13px] font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
          {label}
        </span>
      )}
    </label>
  )
}
