"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  indeterminate = false,
  ...props
}: CheckboxPrimitive.Root.Props & {
  indeterminate?: boolean
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
        "data-checked:bg-white/90 data-checked:border-white/40",
        "data-indeterminate:bg-white/60 data-indeterminate:border-white/40",
        "data-unchecked:border-white/25 data-unchecked:bg-transparent",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "cursor-pointer",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {indeterminate ? (
          <Minus className="size-3 text-black/80" strokeWidth={3} />
        ) : (
          <Check className="size-3 text-black/80" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
