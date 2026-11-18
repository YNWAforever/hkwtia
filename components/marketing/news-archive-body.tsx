import type {ReactNode} from "react";

import type {ArchiveBlock, InlineNode} from "@/lib/news/archive-document";

export function NewsArchiveBody({
  blocks,
  labels,
}: Readonly<{
  blocks: readonly ArchiveBlock[];
  labels: Readonly<{externalHint: string; missingPhoto: string; missingFile: string; photoAlt: string}>;
}>) {
  return <div className="news-archive-body">{blocks.map((block, index) => renderBlock(block, index, labels))}</div>;
}

function renderBlock(block: ArchiveBlock, index: number, labels: {externalHint: string; missingPhoto: string; missingFile: string; photoAlt: string}): ReactNode {
  const key = `block-${index}`;
  if (block.type === "heading") {
    const text = inlineNodes(block.children, `${key}-h`, labels.externalHint);
    if (block.level === 2) return <h2 key={key}>{text}</h2>;
    if (block.level === 3) return <h3 key={key}>{text}</h3>;
    return <h4 key={key}>{text}</h4>;
  }
  if (block.type === "paragraph") return <p key={key}>{inlineNodes(block.children, key, labels.externalHint)}</p>;
  if (block.type === "list") {
    const items = block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inlineNodes(item, `${key}-${itemIndex}`, labels.externalHint)}</li>);
    return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
  }
  if (block.type === "table") {
    return (
      <div className="news-archive-table" key={key}>
        <table>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${key}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${key}-${rowIndex}-${cellIndex}`}>{inlineNodes(cell, `${key}-${rowIndex}-${cellIndex}`, labels.externalHint)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "figure") {
    if (!block.localPath) return <p key={key}>{labels.missingPhoto}</p>;
    const alt = block.alt || labels.photoAlt;
    return (
      <figure key={key}>
        {/* Archival photographs have no fixed frame, so a generated ratio would crop them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} src={block.localPath} />
        {block.originalPath && block.originalPath !== block.localPath ? (
          <figcaption><a href={block.originalPath}>{block.alt || labels.photoAlt}</a></figcaption>
        ) : null}
      </figure>
    );
  }
  if (block.type === "file") {
    const href = block.localPath ?? block.sourceUrl;
    return <p key={key}><a href={href} rel="noopener noreferrer">{block.label}</a>{block.localPath ? null : ` ${labels.missingFile}`}</p>;
  }
  return <p key={key}><a href={block.sourceUrl} rel="noopener noreferrer" target="_blank">{block.label}<span className="sr-only">{labels.externalHint}</span></a></p>;
}

function inlineNodes(nodes: readonly InlineNode[], keyPrefix: string, externalHint: string): ReactNode[] {
  return nodes.map((node, index) => inlineNode(node, `${keyPrefix}-${index}`, externalHint));
}

function inlineNode(node: InlineNode, key: string, externalHint: string): ReactNode {
  if (node.type === "text") return node.text;
  if (node.type === "strong") return <strong key={key}>{inlineNodes(node.children, key, externalHint)}</strong>;
  if (node.type === "em") return <em key={key}>{inlineNodes(node.children, key, externalHint)}</em>;
  const external = /^https?:/i.test(node.href);
  return (
    <a href={node.href} key={key} {...(external ? {target: "_blank", rel: "noopener noreferrer"} : {})}>
      {inlineNodes(node.children, key, externalHint)}
      {external ? <span className="sr-only">{externalHint}</span> : null}
    </a>
  );
}
