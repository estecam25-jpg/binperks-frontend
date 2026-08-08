/**
 * Helpers for reading Supabase embedded relations.
 *
 * CLAUDE.md CORE RULE 9 says "Supabase relation joins ALWAYS return arrays".
 * That is only half true, and the half that is wrong fails silently:
 *
 *   to-MANY  `visits ( ... )`               → array    ✅ rule holds
 *   to-ONE   `stores:home_store_id ( ... )` → OBJECT   ❌ rule does not
 *
 * Verified against this project on supabase-js 2.108.2. Indexing [0] on a
 * to-one embed yields undefined rather than throwing, so the symptom is a
 * blank value — "No Store", a null store name — with nothing in the logs.
 *
 * Route to-one embeds through toOne() instead of indexing, and the code keeps
 * working whichever shape the client returns.
 */

/**
 * Unwrap an embedded to-one relation to a single record.
 *
 * Accepts both shapes, so a supabase-js upgrade in either direction is a no-op
 * here. Returns undefined when the relation is absent — a nullable foreign key,
 * or a row the join did not match.
 */
export function toOne<T>(relation: T | T[] | null | undefined): T | undefined {
  if (!relation) return undefined
  return Array.isArray(relation) ? relation[0] : relation
}
