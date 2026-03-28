/**
 * Lightweight immutable update helper.
 * Clones state deeply then applies the recipe mutation.
 * Good enough for the game's relatively flat state tree.
 */
export default function produce<T>(state: T, recipe: (draft: T) => void): T {
  const draft = structuredClone(state) as T
  recipe(draft)
  return draft
}
