import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { AwaitReadModel } from "@/components/server/await-read-model";
/** Resolve only the server read boundary; render client components through React, never call their hooks directly. */
export async function resolveReadModelTree(
  node: ReactNode,
): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveReadModelTree));
  if (!isValidElement(node)) return node;
  if (node.type === AwaitReadModel)
    return resolveReadModelTree(
      await AwaitReadModel(node.props as Parameters<typeof AwaitReadModel>[0]),
    );
  const element = node as ReactElement<{ children?: ReactNode }>;
  return "children" in element.props
    ? cloneElement(element, {
        children: await resolveReadModelTree(element.props.children),
      })
    : element;
}
