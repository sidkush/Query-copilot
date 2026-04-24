import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CacheStatsDashboard from "./CacheStatsDashboard";

// Mock the api module — uses named `api` object with getCacheStats / getOpsAlerts
vi.mock("../api", () => ({
  api: {
    getCacheStats: vi.fn(() =>
      Promise.resolve({
        tenant_id: "t-1",
        schema: 0.91,
        vizql_in_process: 0.55,
        vizql_external: 0.40,
        chroma_query_memory: 0.33,
        turbo_twin: 0.22,
        prompt_cache: 0.75,
      })
    ),
    getOpsAlerts: vi.fn(() =>
      Promise.resolve({ alerts: [] })
    ),
  },
}));

describe("CacheStatsDashboard", () => {
  it("renders six cache-source tiles", async () => {
    render(<CacheStatsDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/schema cache/i)).toBeInTheDocument();
      expect(screen.getByText(/vizql in-process/i)).toBeInTheDocument();
      expect(screen.getByText(/prompt cache/i)).toBeInTheDocument();
    });
  });

  it("never shows cross-tenant data", async () => {
    render(<CacheStatsDashboard />);
    await waitFor(() => {
      expect(screen.queryByText(/t-2/)).not.toBeInTheDocument();
    });
  });
});
