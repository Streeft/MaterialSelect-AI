import type { ReactElement, ReactNode } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * `render` with a QueryClient around it, for components that carry a data hook
 * deep inside (the glossary hint in a table header). The client never retries,
 * so a failed request settles at once instead of after the backoff.
 */
export function renderWithQuery(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}
