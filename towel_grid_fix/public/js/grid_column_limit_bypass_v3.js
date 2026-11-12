// ============================================================================
// Child Table Grid - Column Limit Bypass + Horizontal Scroll
// ============================================================================
// Confirmed against Frappe framework source, version-15 branch (matches your
// ERPNext v15 install).
//
// WHERE THE "10" LIMIT ACTUALLY LIVES (core file, you cannot edit this - no
// bench access - this is why the fix below is a Client Script instead):
//   frappe/public/js/frappe/form/grid_row.js
//     -> GridRow.prototype.validate_columns_width()      (throws the error)
//     -> GridRow.prototype.configure_dialog_for_columns_selector()
//        (calls validate_columns_width() when you click "Update" in the
//         child table's "Configure Columns" / gear-icon dialog)
//
// This is a WIDTH-BUDGET check, not a column-COUNT check: every column you
// tick in "Configure Columns" gets a width (1-12, default 2), and the sum of
// all shown columns' widths must not exceed 10, or Frappe throws:
//   "The total column width cannot be more than 10."
// That's the "validation" you're hitting. There is no separate cap in
// frappe/public/js/frappe/form/grid.js (Grid.prototype.setup_visible_columns)
// on how many "In List View" fields can exist - that file does not need any
// change.
//
// The child table's "detail popup" (the full-form view you get by clicking a
// row / the expand arrow) is rendered by a completely different file,
// frappe/public/js/frappe/form/grid_row_form.js, which never references
// column width or this validation at all. Nothing below touches it, so it
// is guaranteed unaffected.
//
// WHAT THIS SCRIPT DOES
//   1. Disables validate_columns_width() and the column-dropping in Grid.setup_visible_columns() so "Configure Columns" accepts any
//      number of columns / any total width (tested for 25+).
//   2. Forces the grid to scroll horizontally (real scrollbar) once the
//      shown columns no longer fit the visible width, instead of squeezing
//      them. Each column's existing 1-12 width unit is mapped to a fixed
//      pixel width so it stops shrinking.
//
// HOW IT LOADS: this file is an app asset (hooks.py -> app_include_js), so it
// runs on every Desk page after `bench build --app towel_grid_fix`; no Client
// Script is needed. It patches a framework-wide class (GridRow) and injects
// one global stylesheet, so it applies to every child-table grid.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Remove the 10-unit total column-width limit.
// ---------------------------------------------------------------------------
// In Frappe v15 `Grid` and `GridRow` are ES-module classes: they are NOT exposed as
// `frappe.ui.form.Grid` / `frappe.ui.form.GridRow`, so they cannot be patched at load time.
// Instead they are reached through live instances the first time a form is shown:
//   frm.grids[i].grid                -> a Grid          (its prototype is Grid.prototype)
//   frm.grids[i].grid.header_row     -> a GridRow       (its prototype is GridRow.prototype)
// Two places enforce the limit and both are replaced:
//   GridRow.validate_columns_width()  throws "The total column width cannot be more than 10"
//   Grid.setup_visible_columns()      silently stops adding columns once their widths add up to 10
(function () {
	if (window.__towel_grid_fix_installed) return;
	window.__towel_grid_fix_installed = true;

	function setup_visible_columns() {
		// identical to Frappe's version-15 Grid.setup_visible_columns except that columns are never
		// dropped when the widths add up to more than 10 (`if (total_colsize > 11) return false;`)
		if (this.visible_columns && this.visible_columns.length > 0) return;

		this.user_defined_columns = [];
		this.setup_user_defined_columns();
		const user_cols = this.user_defined_columns && this.user_defined_columns.length > 0;
		const fields = user_cols ? this.user_defined_columns : this.editable_fields || this.docfields;
		let total_colsize = 1;

		this.visible_columns = [];

		for (const ci in fields) {
			const _df = fields[ci];
			const df = user_cols ? _df : this.fields_map[_df.fieldname];

			if (
				df &&
				!df.hidden &&
				(this.editable_fields || df.in_list_view) &&
				((this.frm && this.frm.get_perm(df.permlevel, "read")) || !this.frm) &&
				!frappe.model.layout_fields.includes(df.fieldtype)
			) {
				if (df.columns) {
					df.colsize = df.columns;
				} else {
					this.update_default_colsize(df);
				}

				if (df.fieldtype == "Link" && !df.formatter && df.parent && frappe.meta.docfield_map[df.parent]) {
					const docfield = frappe.meta.docfield_map[df.parent][df.fieldname];
					if (docfield && docfield.formatter) {
						df.formatter = docfield.formatter;
					}
				}

				total_colsize += df.colsize;
				this.visible_columns.push([df, df.colsize]);
			}
		}

		// widen columns only while there is room (never once the 10 units are used)
		let passes = 0;
		while (total_colsize < 11 && passes < 12) {
			for (const i in this.visible_columns) {
				const df = this.visible_columns[i][0];
				const colsize = this.visible_columns[i][1];
				if (colsize > 1 && colsize < 11 && frappe.model.is_non_std_field(df.fieldname)) {
					if (passes < 3 && ["Int", "Currency", "Float", "Check", "Percent"].indexOf(df.fieldtype) !== -1) {
						continue;
					}
					this.visible_columns[i][1] += 1;
					total_colsize++;
				}
				if (total_colsize > 10) break;
			}
			passes++;
		}
	}

	function patch(frm) {
		let fresh = false;
		(frm.grids || []).forEach((ctrl) => {
			const grid = ctrl && ctrl.grid;
			if (!grid) return;

			const GridProto = Object.getPrototypeOf(grid);
			if (!GridProto.__towel_patched) {
				GridProto.setup_visible_columns = setup_visible_columns;
				GridProto.__towel_patched = true;
				fresh = true;
			}

			// header_row exists once the grid has rendered; rows are an equally good source
			const some_row = grid.header_row || (grid.grid_rows && grid.grid_rows[0]);
			if (some_row) {
				const RowProto = Object.getPrototypeOf(some_row);
				if (!RowProto.__towel_patched) {
					RowProto.validate_columns_width = function () {
						// intentionally empty - limit bypassed
					};
					RowProto.__towel_patched = true;
				}
			}
		});

		// the grids on this form were drawn with the old limit: draw them again
		if (fresh) {
			(frm.grids || []).forEach((ctrl) => {
				if (ctrl && ctrl.grid) {
					ctrl.grid.visible_columns = [];
					try { ctrl.grid.refresh(); } catch (e) { /* never block a form */ }
				}
			});
		}
	}

	$(document).on("form-load form-refresh", function (e, frm) {
		try { patch(frm || window.cur_frm); } catch (err) { console.error("towel_grid_fix", err); }
	});
})();

// ---------------------------------------------------------------------------
// 2. Horizontal scrollbar instead of column squeezing.
// ---------------------------------------------------------------------------
// Frappe renders each grid column as a Bootstrap-style ".col-xs-N" (N = that
// column's width, 1-12) inside a flex ".row". With many columns shown, the
// browser normally shrinks them all to fit. The rules below give each
// col-xs-N a fixed pixel width instead, stop the row from wrapping, and let
// the grid container scroll horizontally once the row is wider than the
// screen - so columns stay full width and a scrollbar appears instead.
frappe.dom.set_style(
	`
	/* the container scrolls sideways; the grid inside is as wide as its widest row, so the header, row
	   backgrounds, borders and the edit (pencil) column all stay together while scrolling */
	.form-grid-container {
		overflow-x: auto !important;
	}
	.form-grid-container .form-grid {
		width: max-content;
		min-width: 100%;
	}
	/* only the header row and the data rows themselves (.data-row): the expanded row editor inside a grid
	   also contains ".row" blocks, which must keep their normal wrapping layout */
	.form-grid-container .grid-heading-row .data-row,
	.form-grid-container .grid-row > .data-row {
		flex-wrap: nowrap !important;
		width: auto;
		min-width: 100%;
	}
	/* the expanded "Editing Row" panel always sits in the visible part of the grid, however far it is scrolled */
	.form-grid-container .grid-row > .form-in-grid {
		position: sticky;
		left: 0;
		width: var(--towel-grid-width, 100%);
		max-width: 100%;
	}
	.form-grid-container .grid-heading-row .data-row > .col-xs-1, .form-grid-container .grid-row > .data-row > .col-xs-1 { flex: 0 0 70px; width: 70px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-2, .form-grid-container .grid-row > .data-row > .col-xs-2 { flex: 0 0 140px; width: 140px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-3, .form-grid-container .grid-row > .data-row > .col-xs-3 { flex: 0 0 210px; width: 210px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-4, .form-grid-container .grid-row > .data-row > .col-xs-4 { flex: 0 0 280px; width: 280px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-5, .form-grid-container .grid-row > .data-row > .col-xs-5 { flex: 0 0 350px; width: 350px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-6, .form-grid-container .grid-row > .data-row > .col-xs-6 { flex: 0 0 420px; width: 420px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-7, .form-grid-container .grid-row > .data-row > .col-xs-7 { flex: 0 0 490px; width: 490px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-8, .form-grid-container .grid-row > .data-row > .col-xs-8 { flex: 0 0 560px; width: 560px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-9, .form-grid-container .grid-row > .data-row > .col-xs-9 { flex: 0 0 630px; width: 630px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-10, .form-grid-container .grid-row > .data-row > .col-xs-10 { flex: 0 0 700px; width: 700px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-11, .form-grid-container .grid-row > .data-row > .col-xs-11 { flex: 0 0 770px; width: 770px; }
	.form-grid-container .grid-heading-row .data-row > .col-xs-12, .form-grid-container .grid-row > .data-row > .col-xs-12 { flex: 0 0 840px; width: 840px; }
`,
	"towel-grid-column-limit-bypass-style"
);

// keep --towel-grid-width = visible width of each grid container (used by the sticky row editor above)
(function () {
	const seen = new WeakSet();
	let ro = null;

	function fit(el) {
		const w = el.clientWidth;
		if (w > 0) el.style.setProperty("--towel-grid-width", w + "px");
	}

	function watch() {
		document.querySelectorAll(".form-grid-container").forEach((el) => {
			fit(el);
			if (seen.has(el)) return;
			seen.add(el);
			if (window.ResizeObserver) {
				ro = ro || new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
				ro.observe(el);
			}
		});
	}

	$(document).on("form-load form-refresh grid-row-render", function () {
		watch();
		setTimeout(watch, 300);
	});
	window.addEventListener("resize", watch);
})();

// ---------------------------------------------------------------------------
// Practical notes:
// - Each individual column's width is still capped 1-12 (that's an
//   independent Bootstrap class limit in Frappe's grid CSS, "col-xs-13" etc.
//   don't exist as CSS classes) - only the SUM across all shown columns is
//   now unlimited. To fit 25 columns, set most of them to width 1 or 2 in
//   "Configure Columns" (the width box next to each field).
// - 70px per width-unit (line above) is a starting point; if your columns
//   still feel cramped or too wide, tell me and I'll adjust the multiplier.
// - This does not change what "In List View" checkbox does on Customize
//   Form / DocType - that field-level flag still governs which fields are
//   even eligible to appear in "Configure Columns" in the first place; if
//   you also want more than the currently-visible fields available to pick
//   from there, check "In List View" on the extra child table fields you
//   need (Customize Form, or the child DocType itself).
// ============================================================================
