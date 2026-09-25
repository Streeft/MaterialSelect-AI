import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Plain text with the little formatting a model or a student writes:
 * paragraphs split by blank lines, `- ` or `* ` list items, `**bold**` and
 * `*italic*`.
 *
 * Not a Markdown library (D-23), and **never** `dangerouslySetInnerHTML`: the
 * text arrives from a model reading a student's upload, so every character is
 * rendered as text by React. A `<script>` inside a source is shown as the
 * characters `<script>`, which is what it is. Anything this parser does not
 * know is left exactly as written — a stray asterisk stays an asterisk.
 */
export function RichText({
  text,
  trailing,
  className,
}: {
  text: string;
  /** Rendered at the end of the last block — a paragraph's citation chips. */
  trailing?: ReactNode;
  className?: string;
}) {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {blocks.map((block, index) => {
        const last = index === blocks.length - 1;
        const lines = block.split("\n");
        const isList = lines.every((line) => /^\s*[-*•]\s+/.test(line));
        if (isList) {
          return (
            <ul key={index} className="ml-5 list-disc space-y-1">
              {lines.map((line, i) => (
                <li key={i}>
                  {inline(line.replace(/^\s*[-*•]\s+/, ""))}
                  {last && i === lines.length - 1 ? trailing : null}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 ? <br /> : null}
                {inline(line)}
              </Fragment>
            ))}
            {last ? trailing : null}
          </p>
        );
      })}
    </div>
  );
}

const EMPHASIS = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g;

/** `**bold**` and `*italic*`; everything else is text. */
export function inline(text: string): ReactNode[] {
  return text.split(EMPHASIS).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
