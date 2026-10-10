import { create } from 'zustand'

/** Which view the left side bar shows, driven by the activity bar. */
export type SidebarView = 'projects' | 'review'

interface UiState {
  settingsOpen: boolean
  newProjectOpen: boolean
  sidebar: SidebarView
  /** False while the side bar is collapsed, as Ctrl+B does in VS Code. */
  sidebarVisible: boolean
  setSettingsOpen: (value: boolean) => void
  setNewProjectOpen: (value: boolean) => void
  setSidebar: (value: SidebarView) => void
  setSidebarVisible: (value: boolean) => void
  toggleSidebar: () => void
}

export const useUi = create<UiState>((set) => ({
  settingsOpen: false,
  newProjectOpen: false,
  sidebar: 'projects',
  sidebarVisible: true,
  setSettingsOpen: (value) => set({ settingsOpen: value }),
  setNewProjectOpen: (value) => set({ newProjectOpen: value }),
  setSidebar: (value) => set({ sidebar: value }),
  setSidebarVisible: (value) => set({ sidebarVisible: value }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible }))
}))
