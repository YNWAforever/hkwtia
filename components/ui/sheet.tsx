'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import {cva, type VariantProps} from 'class-variance-authority';
import {X} from 'lucide-react';
import * as React from 'react';

import {cn} from '@/lib/utils';

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({className, ...props}, ref) => (
  <SheetPrimitive.Overlay
    className={cn('fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm', className)}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50',
  {
    variants: {
      side: {
        right: 'inset-y-0 right-0 h-full w-[min(24rem,88vw)] gap-4 border-l bg-background p-6 shadow-xl transition-transform',
        left: 'inset-y-0 left-0 h-full w-[min(24rem,88vw)] gap-4 border-r bg-background p-6 shadow-xl transition-transform',
        // The donor mobile menu is an opaque full-screen panel that brings its own background
        // and padding through .mobile-menu; utilities here would only fight it.
        full: 'inset-0'
      }
    },
    defaultVariants: {side: 'right'}
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Omit to place the close control inside the panel yourself with `SheetClose`. */
  closeLabel?: string;
}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({side = 'right', className, children, closeLabel, ...props}, ref) => (
    <SheetPortal>
      {/* The full-bleed variant paints an opaque panel over the whole viewport above this
          overlay, so its tint and blur are never seen — and a viewport-sized backdrop-filter is
          real work for a phone to do every frame. The element itself stays: Radix routes
          outside-pointer dismissal and the modal pointer-event block through it. */}
      <SheetOverlay className={side === 'full' ? 'bg-transparent backdrop-blur-none' : undefined} />
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({side}), className)} {...props}>
        {children}
        {closeLabel === undefined ? null : (
          <SheetPrimitive.Close
            className="absolute right-4 top-4 rounded-sm p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={closeLabel}
          >
            <X aria-hidden="true" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({className, ...props}, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({className, ...props}, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger};
