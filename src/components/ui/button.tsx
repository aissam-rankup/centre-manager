import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-transparent text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline: "border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-danger/10 text-danger-ink hover:bg-danger/15",
        link: "h-auto px-0 text-brand-ink underline-offset-4 hover:underline",
        // Ambre : un seul usage par écran.
        highlight: "bg-highlight text-highlight-foreground hover:bg-highlight/90",
        success: "bg-success-strong text-white hover:bg-success-strong/90",
        danger: "bg-danger-strong text-white hover:bg-danger-strong/90",
      },
      size: {
        default: "h-11 px-4",
        icon: "size-11",
        // Mode appel : 64 px de haut minimum.
        call: "min-h-16 gap-3 px-6 text-lg font-semibold [&_svg:not([class*='size-'])]:size-6",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-11" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
