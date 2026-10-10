import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'

export default function NewProjectDialog(): React.JSX.Element {
  const setNewProjectOpen = useUi((state) => state.setNewProjectOpen)
  const createProject = useStore((state) => state.createProject)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function submit(): Promise<void> {
    if (!name.trim()) return
    await createProject(name.trim(), description.trim())
    setNewProjectOpen(false)
  }

  return (
    <div className="backdrop" onClick={() => setNewProjectOpen(false)}>
      <div className="dialog narrow" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h2>New project</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setNewProjectOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="Obby remake"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit()
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="textarea"
              value={description}
              placeholder="What are we building in this place?"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <span className="hint">
            A project keeps its own sessions, reviewed changes and file snapshots, so you can switch places
            without losing context.
          </span>
        </div>
        <div className="dialog-footer">
          <button className="btn ghost" onClick={() => setNewProjectOpen(false)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => void submit()}>
            Create project
          </button>
        </div>
      </div>
    </div>
  )
}
