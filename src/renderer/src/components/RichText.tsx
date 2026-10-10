import type { ReactNode } from 'react'

/**
 * A deliberately small formatter: fenced code blocks, inline code and blank
 * lines. No HTML injection anywhere — everything becomes React nodes.
 */
export function RichText({ text }: { text: string }): React.JSX.Element {
  const blocks = splitBlocks(text)
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <pre key={index}>
              <code>{block.content}</code>
            </pre>
          )
        }
        return <p key={index} style={{ margin: index === 0 ? 0 : '8px 0 0' }}>{inline(block.content)}</p>
      })}
    </>
  )
}

function splitBlocks(text: string): { type: 'text' | 'code'; content: string }[] {
  const blocks: { type: 'text' | 'code'; content: string }[] = []
  const pattern = /```[a-zA-Z0-9]*\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    blocks.push({ type: 'code', content: match[1].replace(/\n$/, '') })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) blocks.push({ type: 'text', content: text.slice(lastIndex) })

  // Collapse leftover blank lines between paragraphs.
  return blocks
    .map((block) => (block.type === 'text' ? { ...block, content: block.content.replace(/^\n+|\n+$/g, '') } : block))
    .filter((block) => block.content.length > 0 || block.type === 'code')
}

function inline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code className="inline-code" key={index}>
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}
