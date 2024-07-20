from setuptools import find_packages, setup
setup(
    name='sql2csv',
    version='2.0.0',
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        'flask',
        'flask_cors',
        'simplejson',
        'sqlparse'
    ],
)