import type { UserChartType, InstantiateParams } from './types';
import type { ChartSpec } from '../types';
import { validateUserChartType } from './schema';
import { instantiateUserChartType } from './instantiate';

/**
 * UserChartTypeRegistry — in-memory store for per-user + per-org
 * custom chart types.
 *
 * Phase C foundation ships an in-memory registry keyed by id. The
 * backend storage layer (user_chart_types.py) is responsible for
 * loading the user's registered types on session start and feeding
 * them into this registry via hydrate(). Deletes live at both layers.
 *
 * Validation: register() calls validateUserChartType() and refuses to
 * add an invalid definition, returning the validation result so the
 * caller can surface errors.
 */
export interface RegisterResult {
  ok: boolean;
  errors: string[];
}

export class UserChartTypeRegistry {
  private store = new Map<string, UserChartType>();

  register(def: UserChartType): RegisterResult {
    const result = validateUserChartType(def);
    if (!result.valid) return { ok: false, errors: result.errors };
    this.store.set(def.id, def);
    return { ok: true, errors: [] };
  }

  hydrate(defs: UserChartType[]): { added: number; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    let added = 0;
    for (const def of defs) {
      const result = this.register(def);
      if (result.ok) {
        added += 1;
      } else {
        errors[def.id ?? '?'] = result.errors;
      }
    }
    return { added, errors };
  }

  get(id: string): UserChartType | undefined {
    return this.store.get(id);
  }

  remove(id: string): boolean {
    return this.store.delete(id);
  }

  list(): UserChartType[] {
    return Array.from(this.store.values());
  }

  listByCategory(): Record<string, UserChartType[]> {
    const out: Record<string, UserChartType[]> = {};
    for (const t of this.store.values()) {
      const cat = t.category || 'Custom';
      if (!out[cat]) out[cat] = [];
      out[cat]!.push(t);
    }
    return out;
  }

  instantiate(id: string, params: InstantiateParams): ChartSpec {
    const def = this.store.get(id);
    if (!def) throw new Error(`UserChartType not found: ${id}`);
    return instantiateUserChartType(def, params);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

/** Process-wide singleton. Tests can instantiate their own. */
export const globalUserChartTypeRegistry = new UserChartTypeRegistry();
