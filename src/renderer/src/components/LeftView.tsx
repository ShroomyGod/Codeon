import { ListTree, Rocket } from 'lucide-react'
import { useStore, type LeftViewTab } from '../store'
import ExplorerTree from './ExplorerTree'
import PlaytestView from './PlaytestView'
import ViewTabs from './ViewTabs'

/**
 * The left column: the DataModel explorer and the playtest console.
 *
 * The Explorer keeps the whole body because it draws its own toolbar and
 * scrolls internally.
 */
export default function LeftView(): React.JSX.Element {
  const leftTab = useStore((state) => state.leftTab)
  const setTab = useStore((state) => state.setTab)

  const tabs: { id: LeftViewTab; label: string; icon: React.JSX.Element }[] = [
    { id: 'explorer', label: 'Explorer', icon: <ListTree size={13} /> },
    { id: 'playtest', label: 'Playtest', icon: <Rocket size={13} /> }
  ]

  return (
    <section className="panel">
      <ViewTabs tabs={tabs} active={leftTab} onSelect={setTab} />
      <div className={`tab-body${leftTab === 'explorer' ? ' flush' : ''}`}>
        {leftTab === 'explorer' && <ExplorerTree />}
        {leftTab === 'playtest' && <PlaytestView />}
      </div>
    </section>
  )
}
