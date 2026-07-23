import { render, type RenderOptions } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactElement, ReactNode } from "react"

function IsolatedSwrCache({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
      }}
    >
      {children}
    </SWRConfig>
  )
}

export function renderWithSwr(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: IsolatedSwrCache, ...options })
}
