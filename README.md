# Towel Grid Fix

Frappe / ERPNext v15 app that removes the child-table grid limit *"The total column width cannot be more than 10"*
and adds horizontal scrolling to wide grids, on every Desk page.

## Install
```bash
bench get-app https://github.com/abdulkabeerkashif9-ctrl/Towel-Grid-Fix
bench --site <site> install-app towel_grid_fix
bench build --app towel_grid_fix
bench restart
```
Then hard-refresh the browser (Ctrl+Shift+R).

## Use
Open any form with a child table, click the gear icon > **Configure Columns**, tick as many columns as you like
and press **Update**. Column widths (1-12) map to fixed pixel widths; when the columns no longer fit, the grid
scrolls sideways instead of squeezing them. The expanded row editor is not affected.

## Files
- `towel_grid_fix/public/js/grid_column_limit_bypass.js` - the patch (loaded through `app_include_js`).
- `towel_grid_fix/hooks.py` - registers the script.
