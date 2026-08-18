/**
 * Node half of dsh-strata — deliberately empty.
 *
 * Everything this plugin does happens in the browser (see ./client.js): it
 * reads the conversation scrollport's own layout through the official anchor
 * attributes and paints a minimap into the shell overlay layer. There is no
 * host state, no tool, no remote, and no session data crossing the wire for
 * it, so the host-side plugin only has to exist for the composition row to
 * resolve.
 */

export const name = 'strata'

/** Mount point; the browser half carries the feature. */
export function apply() {}
