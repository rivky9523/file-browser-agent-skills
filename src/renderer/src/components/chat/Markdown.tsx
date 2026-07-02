import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders Claude's Markdown replies.
 *
 * The wrapper is RTL so Hebrew text aligns to the right, while each block uses
 * `unicode-bidi: plaintext` (see .markdown in index.css) so the Unicode
 * bidirectional algorithm decides each paragraph/line's base direction from its
 * own content. That keeps embedded English words (and English-only lines or
 * code) flowing left-to-right without scrambling the surrounding Hebrew.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown" dir="rtl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Open links in the user's browser instead of navigating the app.
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
