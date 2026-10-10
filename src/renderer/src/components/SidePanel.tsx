import { useStore } from '../store'
import { useUi } from '../ui'
import ProjectRail from './ProjectRail'
import ReviewPanel from './ReviewPanel'

/** The left side bar. The activity bar decides which view it shows. */
export default function SidePanel(): React.JSX.Element {
  const sidebar = useUi((state) => state.sidebar)
  return sidebar === 'review' ? <ReviewSidebar /> : <ProjectRail />
}

function ReviewSidebar(): React.JSX.Element {
  const changes = useStore((state) => state.changes)
  const activeProjectId = useStore((state) => state.activeProjectId)

  const pending = changes.filter(
    (change) => change.status === 'pending' && change.projectId === activeProjectId
  ).length

  return (
    <aside className="rail">
      <div className="rail-header">
        <span>Review</span>
        <span className="rail-count">{pending} pending</span>
      </div>
      <div className="rail-scroll">
        <ReviewPanel />
      </div>
    </aside>
  )
}
