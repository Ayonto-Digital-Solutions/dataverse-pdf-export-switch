# Changelog

## 1.1.2

- Copyright holder set: Ayonto UG (haftungsbeschränkt).
- The save lock is part of the state, not just the DOM. Redrawing the table
  from the search box, a filter or the discard button no longer re-enables the
  toggles mid-save, and a second save cannot start while one is running.
- Local databases are no longer pre-selected when clearing cached data. The
  dialog says when to tick them, and the tip after saving names it as the
  second step if the command bar still shows the old state.
- The two language checks never looked at anything: the block they searched
  for did not match, so they passed on empty input. They now locate both
  blocks, assert they are non-empty, and verify that the detectors fire on
  known-bad samples before trusting a clean result.

## 1.1.1

- Block saving when the read returns no ETag, instead of silently falling back
  to `If-Match: *`. The write helper now refuses a PATCH without one.
- Keep a change that is made while a save is in flight. The toggles are locked
  for the duration, and only the entries that were actually written are
  cleared from the pending set.
- The privilege dialog distinguishes allowed, not allowed and unknown. An
  unanswerable check was shown as a refusal.
- The cache dialog's pre-selection is now one constant, `CACHE_DEFAULTS`.

## 1.1.0

- Count only activated Word templates. Excel templates were counted as if they
  produced a PDF; drafts are now shown separately.
- Write with the record's ETag and report a concurrent change instead of
  overwriting it.
- Require the stored setting to be a JSON object of boolean entries. A valid
  but wrongly shaped value was accepted and would have been replaced on save.
- Read security roles from `roleprivilegescollection` with `roleid`. The
  previous query used an entity set and a column name that do not exist, so
  the role list always failed.
- Clearing cached data: itemised dialog with the names found, each group
  deselectable, service workers no longer pre-selected, and a database that
  another tab holds open reported as not confirmed instead of cleared.
- Repair German texts and CSS class names damaged when the public version was
  derived mechanically.
- CI runs on Node 24 and 26 with `npm ci` and a committed lock file.

## 1.0.0

Initial release.

- Lists every table in the environment with display name, object type code and
  the number of Word templates attached to it.
- Switches the PDF export on or off per table, several tables in one save.
- Search plus filters: all, switched on, custom tables, with template only.
- Warns about tables that are switched on without a template and about entries
  for tables that no longer exist.
- Blocks saving when there is no setting record, more than one, or the stored
  value is not valid JSON.
- Checks the current user's write privilege and lists the security roles that
  have it.
- Clears the browser caches for this environment so the command bar picks up
  the change.
- German and English, selected from the browser language.
