import { Fragment, type ReactNode } from "react";

/**
 * A tiny, dependency-free markdown renderer — enough for the library files the
 * agent writes (headings, bullets, bold, links, paragraphs). We render the
 * agent's actual file content rather than parsing it into a fixed shape, so the
 * view is robust to whatever layout the model chose.
 */

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold** and [label](url) while keeping the delimiters.
  const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      const label = token.slice(1, token.indexOf("]"));
      const url = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(
        <a key={key++} href={url} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
          {label}
        </a>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length) {
      out.push(
        <ul key={key++} className="ml-4 list-disc space-y-0.5 text-sm text-[#5b7173]">
          {bullets}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) {
      flushBullets();
      out.push(
        <h3 key={key++} className="mt-3 text-sm font-bold text-[#132a2b]">
          {renderInline(line.replace(/^#\s+/, ""))}
        </h3>,
      );
    } else if (/^##\s+/.test(line)) {
      flushBullets();
      out.push(
        <h4 key={key++} className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#6b8382]">
          {renderInline(line.replace(/^##+\s+/, ""))}
        </h4>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      bullets.push(<li key={key++}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>);
    } else if (line.trim() === "") {
      flushBullets();
    } else {
      flushBullets();
      out.push(
        <p key={key++} className="text-sm leading-relaxed text-[#5b7173]">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return <Fragment>{out}</Fragment>;
}
