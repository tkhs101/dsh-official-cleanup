/**
 * dsh-official-cleanup — Host half.
 *
 * Two official surfaces are pinned off here, both of which the profile would
 * otherwise let a user turn back on:
 *
 * 1. The official-model Session-log upload. Its only switch is the volatile
 *    `enabled` field of `@deepseek-ai/dsh-session-log-deepseek`, and the field
 *    defaults to `true`. `enabled: false` in this bundle's `cordis.patch.yml`
 *    is only a default — a bundle layer sits BELOW the profile patch, so the
 *    Settings toggle would persist `true` into the profile patch and win on
 *    every later boot. The `internal/config` waterfall below therefore pins the
 *    value where the session-log plugin actually reads it: the fiber's resolved
 *    configuration, which is re-resolved on boot, on a Settings write, and on
 *    any recomposition.
 *
 * 2. The official DeepSeek provider card. It is removed by its data source,
 *    not by hiding DOM: `cordis.patch.yml` disables the loader entry
 *    `llm-deepseek`, whose registration owns the configurable-provider
 *    directory entry and the adapter routes in one effect. The Models page
 *    tolerates the absence (`adapter-absent`) and the card disappears.
 */

/** Cordis plugin name. */
export const name = 'dsh-official-cleanup';

/** Profile row id of the official Session-log package. */
const SESSION_LOG_ROW = 'session-log-deepseek';

/** Volatile field that decides whether a request carries `dsh_session_log`. */
const SESSION_LOG_FIELD = 'enabled';

/**
 * Pin the official Session-log upload off in the resolved configuration.
 *
 * The waterfall runs before `resolveConfig()` turns `enabled` into a volatile
 * ref, so the payload is the plain raw config. A copy carries `maxBytes` (and
 * any future sibling field) through untouched; only the upload switch is forced.
 * Every other fiber and every other payload passes through unchanged.
 *
 * @param config - raw config of the fiber being resolved.
 * @param next - the remaining waterfall.
 * @returns the config the fiber will use.
 */
function pinSessionLogOff(config, next) {
  const resolved = next();
  // `this` is the fiber whose config is being resolved. Anything unexpected —
  // another fiber, a non-object payload, or a future event signature — passes
  // through untouched rather than risking a config-resolution failure.
  if (this?.entry?.id !== SESSION_LOG_ROW) return resolved;
  if (resolved === null || typeof resolved !== 'object') return resolved;
  if (resolved[SESSION_LOG_FIELD] === false) return resolved;
  return { ...resolved, [SESSION_LOG_FIELD]: false };
}

/**
 * Register the pin.
 *
 * Registration is best-effort by design: this plugin must never be the reason a
 * profile fails to boot. The bundle patch already ships `enabled: false`, so a
 * refused hook degrades to "off by default, a Settings write can turn it on
 * until the next restart" instead of a dead Harness.
 *
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  try {
    // A global listener so the hook runs for that other fiber, not only for
    // contexts this plugin owns.
    ctx.on('internal/config', pinSessionLogOff, { global: true });
  } catch (error) {
    const logger = ctx.logger('dsh-official-cleanup');
    logger.error(
      'could not register the runtime Session-log pin; the uploaded-log switch stays off by default only',
    );
    logger.error(error);
  }
}

export default apply;
