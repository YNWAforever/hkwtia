"use client";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import * as React from "react";

import {cn} from "@/lib/utils";

const NavigationMenuItem = NavigationMenuPrimitive.Item;

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({children, value, ...props}, forwardedRef) => {
  const rootRef = React.useRef<HTMLElement | null>(null);

  /*
   * While a menu is open, @radix-ui/react-navigation-menu renders a VisuallyHidden focus
   * proxy next to the trigger with `aria-hidden` and `tabIndex={0}` (its NavigationMenuTrigger,
   * "open && <VisuallyHidden aria-hidden tabIndex={0} …>",
   * node_modules/@radix-ui/react-navigation-menu/dist/index.mjs:348-356). axe reports that as a
   * serious `aria-hidden-focus` violation, which tests/e2e/accessibility.spec.ts fails on because
   * it filters to serious and critical with no rule allowlist. Taking the proxy out of the tab
   * order keeps Radix's ArrowDown entry (onEntryKeyDown) and its Escape return intact, and
   * makes Tab move to the next trigger — which is what the donor header does anyway.
   *
   * Two correction paths, not one. The useLayoutEffect below, keyed on `value`, is the primary
   * one: `open` for each trigger is derived synchronously from context.value during render
   * (index.mjs:300), and with a controlled `value` prop -- which is how DesktopMegaNavigation
   * always uses this component -- useControllableState (index.mjs:50) returns that prop
   * directly rather than syncing it via its own effect. So the proxy commits to the DOM in the
   * very same React commit as this component's re-render for the new `value`, and a layout
   * effect keyed on `value` runs synchronously right after that commit, before the browser
   * paints -- observing the proxy in the same tick the triggering click was handled in, with no
   * async gap for axe (or a real keyboard user tabbing through at just the wrong moment) to see
   * tabIndex 0 in between. That gap was real: the MutationObserver alone (still below, kept as
   * a fallback) only reacted on the next microtask, which axe's own scan sometimes beat.
   *
   * The MutationObserver stays for what the value-driven path can't see: Radix's own
   * hover-intent open/close timers, or any future consumer that uses this component
   * uncontrolled. Its dependency array is empty so a single subscription for the lifetime of
   * the root catches every open; re-creating it per open would be wasted work. Writing
   * tabIndex changes the attribute and fires the observer once more; the element no longer
   * matches `[tabindex="0"]`, so it settles immediately.
   */
  const neutralise = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const proxy of root.querySelectorAll<HTMLElement>('[aria-hidden="true"][tabindex="0"]')) {
      proxy.tabIndex = -1;
    }
  }, []);

  React.useLayoutEffect(() => {
    neutralise();
  }, [value, neutralise]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    neutralise();
    const observer = new MutationObserver(neutralise);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["tabindex", "aria-hidden"],
    });
    return () => observer.disconnect();
  }, [neutralise]);

  return (
    <NavigationMenuPrimitive.Root
      ref={(node) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      value={value}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Root>
  );
});
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.List ref={ref} className={cn("desktop-nav-list", className)} {...props} />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({className, children, ...props}, ref) => (
  <NavigationMenuPrimitive.Trigger ref={ref} className={className} {...props}>
    {children}
    {/* Donor commit f91ecc5 :409 — a text chevron, rotated by `.nav-button.active span`
        (app/styles/wisetech.css:66). */}
    <span aria-hidden="true">⌄</span>
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({className, ...props}, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn("left-0 top-0 w-full", className)}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({className, ...props}, ref) => (
  // Kept a sibling of NavigationMenuList, never a child: Radix's List renders an inner
  // `position: relative` div around its items, which would re-anchor this panel to the
  // trigger row instead of the header.
  // Neither this wrapper nor .desktop-nav is positioned, so `absolute` resolves against
  // .site-header — which is what centres the donor panel under the whole header rather than
  // under the trigger row. The panel sizes itself through .mega-menu-v2.
  <div className="absolute left-0 top-full flex w-full justify-center">
    <NavigationMenuPrimitive.Viewport ref={ref} className={cn("relative w-full", className)} {...props} />
  </div>
));
NavigationMenuViewport.displayName = NavigationMenuPrimitive.Viewport.displayName;

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
};
