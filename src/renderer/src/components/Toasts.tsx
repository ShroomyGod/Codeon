import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useStore } from '../store'

export default function Toasts(): React.JSX.Element {
  const toasts = useStore((state) => state.toasts)
  const dismiss = useStore((state) => state.dismissToast)

  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind}`}
          onClick={() => dismiss(toast.id)}
          role="status"
        >
          {toast.kind === 'error' ? (
            <AlertTriangle size={15} />
          ) : toast.kind === 'success' ? (
            <CheckCircle2 size={15} />
          ) : (
            <Info size={15} />
          )}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
