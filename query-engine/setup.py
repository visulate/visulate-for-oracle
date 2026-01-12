from setuptools import find_packages, setup
setup(
    name="sql2csv",
    version="2.0.0",
    url="https://github.com/yourusername/sql2csv",
    packages=find_packages(include=['sql2csv', 'sql2csv.*']),
    install_requires=[
        "flask",
        "flask_cors",
        "simplejson",
        "sqlparse"
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: Apache Software Foundation License",
        "Operating System :: OS Independent",
    ],
    include_package_data=True,
    python_requires='>=3.11',
)