from setuptools import setup, find_packages

with open("requirements.txt") as f:
	# ignore blank lines and comments: an empty requirement ('') makes pip/setuptools reject the package
	install_requires = [l.strip() for l in f.read().splitlines() if l.strip() and not l.strip().startswith("#")]

# get version from __version__ variable in towel_grid_fix/__init__.py
from towel_grid_fix import __version__ as version

setup(
	name="towel_grid_fix",
	version=version,
	description="Removes Frappe's child-table grid column-width limit",
	author="HM Technologies",
	author_email="ghazimemon92@gmail.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
