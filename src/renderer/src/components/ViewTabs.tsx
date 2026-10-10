/**
 * The tab strip above a view column.
 *
 * Both columns draw the same strip, so the shape lives here: a flat row of
 * labels where the active tab is a plate of the editor colour with an accent
 * hairline along the top.
 */
export default function ViewTabs<T extends string>({
  tabs,
  active,
  onSelect
}: {
  tabs: { id: T; label: string; icon: React.JSX.Element }[]
  active: T
  onSelect: (tab: T) => void
}): React.JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab${active === tab.id ? ' active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
