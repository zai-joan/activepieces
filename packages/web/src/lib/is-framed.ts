/**
 * Whether this document is running inside a frame.
 *
 * The demo chat shows the flow builder in a panel beside the conversation, and
 * the builder is a route, so the panel loads the app into a frame. Being framed
 * is how that copy knows to drop the rail, the sidebar and the standing notices
 * that the page around it is already showing.
 *
 * Deliberately not the embedding SDK's isEmbedded flag: that one also swaps the
 * browser router for a memory router, because an SDK host drives navigation by
 * postMessage rather than by URL. A panel has no host and nothing to send it, so
 * a memory router would ignore the flow URL and show the default page instead.
 */
export function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // A cross-origin parent makes the comparison throw, which is itself the answer.
    return true;
  }
}
