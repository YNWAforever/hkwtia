"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {ChevronDown} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({className, ...props}, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn("border-b border-shell-border", className)} {...props} />
));
AccordionItem.displayName = AccordionPrimitive.Item.displayName;

type AccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
  /** Replaces the chevron; the donor mobile menu uses a text `+` / `−` styled by CSS. */
  marker?: React.ReactNode;
};

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({className, children, marker, ...props}, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      // No size, padding or weight here: the only consumer is the mobile menu, and
      // app/styles/wisetech-shell.css sets min-height, padding and the donor's 400-weight serif
      // on `.mobile-accordion > h3 > button`, so utilities for those were dead weight that
      // rendered the serif heading at 600. A future consumer brings its own through `className`.
      className={cn(
        "group flex min-w-0 flex-1 items-center justify-between text-left break-words outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))] data-[current=true]:text-shell-blue",
        className,
      )}
      {...props}
    >
      {children}
      {marker ?? (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({className, children, ...props}, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4", className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export {Accordion, AccordionContent, AccordionItem, AccordionTrigger};
