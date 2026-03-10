import * as React from "react"

import { cn } from "@/lib/utils"

type Orientation = "vertical" | "horizontal" | "both"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: Orientation
}

function ScrollArea({
  className,
  orientation = "vertical",
  children,
  ...props
}: ScrollAreaProps) {
  const orientationClass =
    orientation === "horizontal"
      ? "overflow-x-auto overflow-y-hidden"
      : orientation === "both"
        ? "overflow-auto"
        : "overflow-y-auto overflow-x-hidden"

  return (
    <div
      className={cn("relative [&>*]:shrink-0", orientationClass, className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface ScrollBarProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: Exclude<Orientation, "both">
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollBarProps) {
  const sizeClass =
    orientation === "horizontal"
      ? "h-1.5 w-full"
      : "w-1.5 h-full"

  return (
    <div
      className={cn(
        "pointer-events-none select-none rounded-full bg-foreground/20",
        sizeClass,
        className,
      )}
      {...props}
    />
  )
}

export { ScrollArea, ScrollBar }

