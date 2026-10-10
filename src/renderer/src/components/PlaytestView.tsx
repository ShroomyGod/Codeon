import { Bot, Eraser, Play, Square } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'

export default function PlaytestView(): React.JSX.Element {
  const studio = useStore((state) => state.studio)
  const output = useStore((state) => state.output)
  const running = useStore((state) => state.playtestRunning)
  const start = useStore((state) => state.startPlaytest)
  const stop = useStore((state) => state.stopPlaytest)
  const clear = useStore((state) => state.clearOutput)
  const send = useStore((state) => state.send)
  const setSidebar = useUi((state) => state.setSidebar)

  const errorCount = output.filter((line) => line.level === 'error').length

  return (
    <div className="playtest">
      <div className="playtest-controls">
        {running ? (
          <button className="btn danger" onClick={() => void stop()}>
            <Square size={14} /> Stop playtest
          </button>
        ) : (
          <button className="btn primary" disabled={!studio?.connected} onClick={() => void start()}>
            <Play size={14} /> Start playtest
          </button>
        )}

        <button
          className="btn"
          disabled={!studio?.connected || output.length === 0}
          onClick={() => {
            const tail = output
              .slice(-80)
              .map((line) => `${line.level}: ${line.message}`)
              .join('\n')
            setSidebar('review')
            void send(
              `Here is the recent Studio output from a playtest. Find the root cause of anything that looks wrong and propose fixes as reviewable changes.\n\n\`\`\`\n${tail}\n\`\`\``
            )
          }}
        >
          <Bot size={14} /> Ask Codeon to analyse
        </button>

        <button className="btn ghost" onClick={() => void clear()}>
          <Eraser size={14} /> Clear
        </button>

        <span className={`status-chip ${running ? 'ok' : ''}`}>
          <span className="dot" />
          {running ? 'Run mode active' : 'Idle'}
          {errorCount > 0 ? ` · ${errorCount} error${errorCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      <p className="playtest-note">
        Playtests use Studio's Run mode, which the MCP server can start and stop. Character "Play" sessions
        can be started manually — Codeon still captures every line printed to the Output window while you
        test.
      </p>

      <div className="output">
        {output.length === 0 && <span className="dim">No output captured yet.</span>}
        {output.map((line) => (
          <div className={`log-line ${line.level}`} key={line.id}>
            <span className="time">{new Date(line.at).toLocaleTimeString()}</span>
            <span>{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
