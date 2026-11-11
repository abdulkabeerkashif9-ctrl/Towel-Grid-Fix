from . import __version__ as app_version

app_name = "towel_grid_fix"
app_title = "Towel Grid Fix"
app_publisher = "HM Technologies"
app_description = "Removes Frappe's child-table grid 'total column width cannot be more than 10' limit and adds horizontal scrolling for wide grids, on every Desk page."
app_email = "ghazimemon92@gmail.com"
app_license = "mit"


# Includes in <head>
# ------------------

# include js in header of desk.html - loads on EVERY Desk page, so the
# column-limit patch applies to every child-table grid in every doctype
# automatically. No per-doctype Client Script needed.
app_include_js = "/assets/towel_grid_fix/js/grid_column_limit_bypass.js"

# app_include_css = "/assets/towel_grid_fix/css/towel_grid_fix.css"


# Installation
# ------------

# before_install = "towel_grid_fix.install.before_install"
# after_install = "towel_grid_fix.install.after_install"
