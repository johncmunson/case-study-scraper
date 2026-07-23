import { render, type RenderOptions } from "@testing-library/react"
import { SWRConfig, type SWRConfiguration } from "swr"
import type { ReactElement, ReactNode } from "react"

export function renderWithSwr(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
  swrConfiguration?: SWRConfiguration,
) {
  function IsolatedSwrCache({ children }: { children: ReactNode }) {
    return (
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          ...swrConfiguration,
        }}
      >
        {children}
      </SWRConfig>
    )
  }

  return render(ui, { wrapper: IsolatedSwrCache, ...options })
}
