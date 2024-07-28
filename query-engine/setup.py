from setuptools import find_packages, setup
# setup(
#     name='sql2csv',
#     version='2.0.0',
#     packages=find_packages(),
#     include_package_data=True,
#     zip_safe=False,
#     install_requires=[
#         'flask',
#         'flask_cors',
#         'simplejson',
#         'sqlparse'
#     ],
# )
setup(
    name="sql2csv",
    version="2.0.0",
    # author="Your Name",
    # author_email="your.email@example.com",
    # description="Description of your package",
    # long_description=open('README.md').read(),
    # long_description_content_type='text/markdown',
    url="https://github.com/yourusername/sql2csv",
    packages=find_packages(include=['sql2csv', 'sql2csv.*']),  # Ensure all subpackages are included
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
    python_requires='>=3.11',
)