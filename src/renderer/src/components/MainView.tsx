import { Code2, SlidersHorizontal } from 'lucide-react'
import { useStore, type MainViewTab } from '../store'
import Breadcrumbs from './Breadcrumbs'
import CodeView from './CodeView'
import PropertiesView from './PropertiesView'
import ViewTabs from './ViewTabs'

/**
 * The middle column: the script editor and the property inspector.
 *
 * It carries the breadcrumb trail, because these are the views that follow a
 * single instance — the script that is open, or the properties of the selection.
 */
export default function MainView(): React.JSX.Element {
  const mainTab = useStore((state) => state.mainTab)
  const setTab = useStore((state) => state.setTab)
  const editor = useStore((state) => state.editor)
  const selectedPath = useStore((state) => state.selectedPath)
  const instance = useStore((state) => state.instance)
  const selectPath = useStore((state) => state.selectPath)

  const tabs: { id: MainViewTab; label: string; icon: React.JSX.Element }[] = [
    { id: 'code', label: 'Code', icon: <Code2 size={13} /> },
    { id: 'properties', label: 'Properties', icon: <SlidersHorizontal size={13} /> }
  ]

  const showingCode = mainTab === 'code'
  const crumbPath = (showingCode ? editor?.path : selectedPath) ?? null
  const crumbClass = showingCode ? editor?.className : instance?.className

  return (
    <section className="panel">
      <ViewTabs tabs={tabs} active={mainTab} onSelect={setTab} />

      <Breadcrumbs
        path={crumbPath}
        className={crumbClass}
        onPick={(path) => void selectPath(path)}
      />

      <div className="tab-body">
        {showingCode && <CodeView />}
        {!showingCode && <PropertiesView />}
      </div>

      {editor?.dirty && !showingCode && (
        <div className="editor-toolbar">
          <span className="editor-dot" />
          <span className="dim">Unsaved changes in {editor.path}</span>
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setTab('code')}>
            Open editor
          </button>
        </div>
      )}
    </section>
  )
}
