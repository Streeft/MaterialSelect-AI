import { useQuery } from "@tanstack/react-query";
import { getDefaults } from "@/lib/api";

/**
 * The calculators' starting numbers (D-216), from `GET /api/padroes`.
 *
 * They are constants of the server, so one fetch per session is enough
 * (`staleTime: Infinity`): re-asking on every focus would only let a number move
 * under a reader who has already started typing.
 */
export function useDefaults() {
  return useQuery({
    queryKey: ["padroes"],
    queryFn: getDefaults,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
