// Where a cart came from, remembered only while this page stays open.
//
// The audit log does not record a cart's source (TD-027), so after a reload the page
// cannot say whether a cart came from the AI agent or the simulated shop, and it says so.
// While the page stays open the person did see the label, so it can be shown again,
// captioned "as labelled when proposed". It is a plain variable in memory: nothing is
// written to the browser's storage (a test checks), and a reload clears it.

export type CartSource = "ai" | "simulated";
export type RememberedSource = { readonly source: CartSource; readonly label: string };

const remembered = new Map<string, RememberedSource>();

export function rememberCartSource(attemptId: string, entry: RememberedSource): void {
  remembered.set(attemptId, entry);
}

export function recallCartSource(attemptId: string): RememberedSource | null {
  return remembered.get(attemptId) ?? null;
}
