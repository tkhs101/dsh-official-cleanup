window.__ModuleLoader__.load({
  id: 'dsh-official-cleanup',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------- policy
    //
    // Feature 1 — the sidebar 更多 / More menu.
    //
    // The account menu (client-ui-settings-account `AccountMenu`) builds its rows
    // from hard-coded JSX, so there is no extension point and no `id` on the
    // rendered markup. The rows are hidden the way this Harness's own layout
    // plugins hide host UI: mark the node and let this plugin's own
    // `!important` stylesheet do the hiding.
    //
    // The row is NOT removed from the DOM. `Menu` reconciles a plain array, so
    // deleting a row makes React's next commit call removeChild on a node that
    // is already gone; that throw would abdicate the whole launcher cell.
    // Hiding keeps React's tree intact, and marking the row `disabled` keeps the
    // menu's live-DOM keyboard walk, which collects `button:not(:disabled)`, off
    // the hidden row.
    //
    // Rows are recognised by their locale-independent leading icon geometry, so
    // the filter follows the language the menu is actually rendered in.

    const HIDDEN_ATTR = 'data-dsh-official-cleanup-hidden';

    /** `IconPaperPlaneOutline` artwork — the 意见反馈 / Feedback row. */
    const FEEDBACK_ICON = 'M4.74024 9.11029';
    /** `IconUserOutline` artwork — the signed-out 登录 / Login row. */
    const LOGIN_ICON = 'M8 8.25C9.51878 8.25';

    const ROW_SELECTOR = '[role="menu"] button[role="menuitem"]';
    const FEEDBACK_SELECTOR = `${ROW_SELECTOR}:has(svg path[d^="${FEEDBACK_ICON}"])`;
    const LOGIN_SELECTOR = `${ROW_SELECTOR}:has(svg path[d^="${LOGIN_ICON}"])`;

    const STYLES = `
${FEEDBACK_SELECTOR},${LOGIN_SELECTOR}{display:none!important}
.doc-launcher{user-select:none;box-sizing:border-box;flex:1;min-width:0;border-radius:var(--dsw-radius-md);height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:8px;padding:6px 2px 6px 6px;font-size:14px;line-height:20px;display:flex}
.doc-launcher:hover{background:var(--dsw-alias-interactive-bg-hover)}
.doc-launcher:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline:none}
.doc-launcher[data-collapsed=true]{flex:none;justify-content:center;gap:0;width:36px;height:36px;padding:0}
.doc-launcher-icon{display:inline-flex;flex:none;align-items:center;justify-content:center}
.doc-launcher-label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.doc-session-log-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.doc-session-log-title{font-size:14px;line-height:20px}
.doc-session-log-note{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px;line-height:18px}
.doc-session-log-switch{box-sizing:border-box;display:inline-flex;align-items:center;flex:none;width:36px;height:20px;padding:2px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid);opacity:.6}
.doc-session-log-thumb{width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-subtle)}
`;

    /** Rows hidden by the stylesheet, kept so the marks can be removed again. */
    const blockedRows = new Set();

    /** Mark one menu row as hidden; idempotent. */
    function blockRow(row) {
      if (!(row instanceof Element)) return;
      if (blockedRows.has(row)) {
        // A re-render can re-enable the row React owns; re-assert the marker.
        if (row.disabled !== true) row.disabled = true;
        return;
      }
      blockedRows.add(row);
      row.setAttribute(HIDDEN_ATTR, '1');
      row.disabled = true;
      row.setAttribute('aria-hidden', 'true');
      row.setAttribute('tabindex', '-1');
    }

    /** Hide every blocked row currently rendered in an open menu. */
    function sweepMenuRows() {
      for (const row of document.querySelectorAll(`${FEEDBACK_SELECTOR},${LOGIN_SELECTOR}`)) {
        blockRow(row);
      }
    }

    /** Keep the marks on, including across menu re-opens and re-renders. */
    function guardMenuRows() {
      const observer = new MutationObserver(() => {
        sweepMenuRows();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled'],
      });
      sweepMenuRows();
      return () => {
        observer.disconnect();
        for (const row of blockedRows) {
          row.removeAttribute(HIDDEN_ATTR);
          row.removeAttribute('aria-hidden');
          row.removeAttribute('tabindex');
          // `disabled` was set by this plugin; React's value is undefined, and
          // React re-applies a changed prop on its next commit anyway.
          if (row.disabled === true) row.disabled = false;
        }
        blockedRows.clear();
      };
    }

    /** Belt and braces: a hidden row must never be activated. */
    function blockRowClicks(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest(FEEDBACK_SELECTOR) ?? target.closest(LOGIN_SELECTOR);
      if (row === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    // ------------------------------------------- Session-log upload preference

    const SESSION_LOG_NS = 'session-log-deepseek';

    function configFormOf(ctx) {
      const service = ctx.configForms ?? ctx.get?.('configForms');
      if (service === undefined || service === null) return undefined;
      return service.get?.(SESSION_LOG_NS) ?? undefined;
    }

    function currentEnabled(form) {
      if (typeof form.getSnapshot !== 'function') return undefined;
      try {
        return form.getSnapshot()?.value?.enabled;
      } catch (_error) {
        return undefined;
      }
    }

    /**
     * The Host half already pins the resolved config off; this corrects the
     * stored value too, so the switch never renders as "on".
     */
    function createSessionLogPin(form) {
      const busy = { value: false };
      const listeners = new Set();
      const publish = () => {
        for (const listener of listeners) listener();
      };
      const enforce = () => {
        if (busy.value || typeof form.set !== 'function') return;
        if (currentEnabled(form) !== true) return;
        busy.value = true;
        publish();
        Promise.resolve(form.set('enabled', false))
          .catch(() => undefined)
          .finally(() => {
            busy.value = false;
            publish();
          });
      };
      return {
        enforce,
        busy,
        subscribe(listener) {
          listeners.add(listener);
          const off = form.subscribe?.(listener);
          return () => {
            listeners.delete(listener);
            if (typeof off === 'function') off();
          };
        },
      };
    }

    function SessionLogRow(props) {
      const upload = props.hooks?.upload;
      const pin = props.pin;
      const t = props.t;
      React.useEffect(() => {
        pin.enforce();
      }, [pin, upload]);
      React.useSyncExternalStore(
        pin.subscribe,
        () => pin.busy.value,
        () => pin.busy.value,
      );
      return h('div', { className: 'doc-session-log-row' }, [
        h('div', { key: 'copy' }, [
          h('div', { className: 'doc-session-log-title', key: 'title' }, t('title')),
          h('div', { className: 'doc-session-log-note', key: 'note' }, t('locked')),
        ]),
        h('span', {
          key: 'switch',
          className: 'doc-session-log-switch',
          role: 'switch',
          'aria-checked': 'false',
          'aria-disabled': 'true',
          'aria-label': t('title'),
          title: t('locked'),
        }, h('span', { className: 'doc-session-log-thumb' })),
      ]);
    }

    // ------------------------------------------------------ sidebar launcher

    /**
     * `IconSettingsOutline` artwork, copied verbatim from the host's primitive
     * (rc.2 frontend bundle) so the button carries the product's own icon.
     */
    const GEAR_PATHS = [
      'M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z',
      'M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z',
    ];

    /** The host's own settings gear, at the medium stroke the host uses. */
    function gearIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          fill: 'none',
          strokeWidth: 1.3,
          strokeMiterlimit: '10',
          'aria-hidden': 'true',
        },
        GEAR_PATHS.map((d, index) => h('path', { d, stroke: 'currentColor', key: index })),
      );
    }

    /**
     * Replace the sidebar account launcher with a direct settings button.
     *
     * The shipped `AccountMenu` is registered into the `single` slot
     * `settings.launcher` at the default priority; a `single` slot renders its
     * lowest priority, so registering at `-1` shadows it. The account menu
     * itself keeps working everywhere it is not this button: its settings
     * section, the models-page sign-in editor and the quota notice all live in
     * their own slots and are untouched.
     *
     * @param props - launcher seat geometry plus the shell's own settings opener.
     */
    function SettingsLauncher(props) {
      const t = props.t;
      const label = t('settings');
      const shortcut = props.settingsShortcut;
      const keys = shortcut === undefined ? '' : shortcut.keys.join(' + ');
      return h(
        'button',
        {
          type: 'button',
          className: 'doc-launcher',
          'data-collapsed': props.wide ? undefined : 'true',
          'aria-label': label,
          'aria-keyshortcuts': shortcut?.aria,
          title: keys === '' ? label : `${label} (${keys})`,
          onClick: () => {
            props.openSettings();
          },
        },
        [
          h('span', { className: 'doc-launcher-icon', key: 'icon' }, gearIcon()),
          props.wide ? h('span', { className: 'doc-launcher-label', key: 'label' }, label) : null,
        ],
      );
    }

    // ------------------------------------------------------------------ styles

    /** Own the plugin stylesheet with its own lifetime. */
    function installStyles() {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-official-cleanup';
      tag.textContent = STYLES;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }

    // -------------------------------------------------------------- host half

    const inject = ['slots', 'locale'];

    /**
     * Register one effect, isolating a wiring failure.
     *
     * This half runs inside the browser boot: a throw while `apply` runs could
     * take down the whole client-plugin table, which is exactly the "installed
     * it and the UI will not open" failure mode. The host's own screen is a
     * cosmetic filter, so a refused registration degrades to "filter not
     * installed" and is reported on the console instead.
     *
     * @param ctx - Client plugin context.
     * @param label - owner label for one resource.
     * @param setup - registers the resource and returns its disposer.
     */
    function safeEffect(ctx, label, setup) {
      try {
        ctx.effect(setup, label);
      } catch (error) {
        console.error('[dsh-official-cleanup] could not register ' + label, error);
      }
    }

    function apply(ctx) {
      // Feature 1 — sidebar 更多 menu rows.
      safeEffect(ctx, 'dsh-official-cleanup: stylesheet', () => installStyles());
      safeEffect(ctx, 'dsh-official-cleanup: menu rows', () => guardMenuRows());
      safeEffect(ctx, 'dsh-official-cleanup: menu row activation', () => {
        document.addEventListener('click', blockRowClicks, true);
        return () => {
          document.removeEventListener('click', blockRowClicks, true);
        };
      });

      // Feature 3 — the Session-log upload preference row.
      safeEffect(ctx, 'dsh-official-cleanup: locale', () => ctx.locale.register('dsh-official-cleanup', {
        en: {
          title: 'Upload Session Log when using the official model API',
          locked: 'Kept off by dsh-official-cleanup.',
          settings: 'Settings',
        },
        zh: {
          title: '在使用官方模型 API 时上传 Session Log',
          locked: '已被 dsh-official-cleanup 固定为关闭。',
          settings: '设置',
        },
      }));

      safeEffect(ctx, 'dsh-official-cleanup: settings launcher', () =>
        ctx.slots.inject('settings.launcher', () => ctx.slots.register({
          name: 'settings.launcher',
          // A `single` slot renders its lowest priority and refuses a
          // same-priority collision, so -1 shadows the shipped account menu
          // without unregistering it.
          priority: -1,
          locale: 'dsh-official-cleanup',
        }, SettingsLauncher)));

      safeEffect(ctx, 'dsh-official-cleanup: session-log preference row', () => {
        const service = ctx.configForms ?? ctx.get?.('configForms');
        if (typeof service?.whileServed !== 'function') return () => {};
        return service.whileServed([SESSION_LOG_NS], () => {
          const form = configFormOf(ctx);
          if (form === undefined) return () => {};
          const pin = createSessionLogPin(form);
          const t = ctx.locale.bind('dsh-official-cleanup');
          return ctx.slots.register({
            name: 'settings.general.item',
            id: 'official-cleanup-session-log',
            order: 91,
            inject: () => ({ hooks: { upload: form }, pin, t }),
          }, SessionLogRow);
        });
      });
    }

    return { inject, apply };
  },
});
