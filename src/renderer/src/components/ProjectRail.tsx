import { MessageSquarePlus, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'

export default function ProjectRail(): React.JSX.Element {
  const projects = useStore((state) => state.projects)
  const activeProjectId = useStore((state) => state.activeProjectId)
  const activeSessionId = useStore((state) => state.activeSessionId)
  const selectProject = useStore((state) => state.selectProject)
  const selectSession = useStore((state) => state.selectSession)
  const createSession = useStore((state) => state.createSession)
  const deleteSession = useStore((state) => state.deleteSession)
  const deleteProject = useStore((state) => state.deleteProject)
  const setNewProjectOpen = useUi((state) => state.setNewProjectOpen)

  return (
    <aside className="rail">
      <div className="rail-header">
        <span>Projects</span>
        <button className="icon-btn" title="New project" onClick={() => setNewProjectOpen(true)}>
          <Plus size={15} />
        </button>
      </div>

      <div className="rail-scroll">
        {projects.length === 0 && (
          <p className="dim" style={{ padding: '6px 8px', fontSize: 12.5 }}>
            No projects yet. Create one to keep chats, files and review history together.
          </p>
        )}

        {projects.map((project) => {
          const active = project.id === activeProjectId
          return (
            <div key={project.id}>
              <div
                className={`project-item${active ? ' active' : ''}`}
                onClick={() => selectProject(project.id)}
              >
                <div className="project-row">
                  <span className="project-dot" style={{ background: project.color }} />
                  <span className="project-name">{project.name}</span>
                  <button
                    className="icon-btn"
                    title="Delete project"
                    onClick={(event) => {
                      event.stopPropagation()
                      void deleteProject(project.id)
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="project-meta">
                  {project.sessions.length} session{project.sessions.length === 1 ? '' : 's'}
                  {project.placeName ? ` · ${project.placeName}` : ''}
                  {` · ${project.files.length} file${project.files.length === 1 ? '' : 's'}`}
                </div>
              </div>

              {active && (
                <div className="session-list">
                  {project.sessions.map((session) => (
                    <div
                      key={session.id}
                      className={`session-item${session.id === activeSessionId ? ' active' : ''}`}
                      onClick={() => void selectSession(session.id)}
                    >
                      <span className="label">{session.title}</span>
                      <span className="actions">
                        <button
                          className="icon-btn"
                          title="Delete session"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteSession(session.id)
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rail-footer">
        <button
          className="btn sm"
          style={{ width: '100%' }}
          disabled={!activeProjectId}
          onClick={() => void createSession()}
        >
          <MessageSquarePlus size={13} /> New session
        </button>
      </div>
    </aside>
  )
}
