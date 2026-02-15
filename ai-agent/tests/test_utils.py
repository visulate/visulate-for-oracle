import os
import shutil
import tempfile
import zipfile
import pytest
from common.utils import create_zip_archive

def test_create_zip_archive():
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    try:
        # Create some test files
        file1_path = os.path.join(temp_dir, "test1.txt")
        file2_path = os.path.join(temp_dir, "test2.txt")
        with open(file1_path, "w") as f:
            f.write("content 1")
        with open(file2_path, "w") as f:
            f.write("content 2")

        archive_name = "test.zip"
        zip_path = create_zip_archive(temp_dir, archive_name)

        assert os.path.exists(zip_path)
        assert zip_path == os.path.join(temp_dir, archive_name)

        # Verify zip contents
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            namelist = zipf.namelist()
            assert "test1.txt" in namelist
            assert "test2.txt" in namelist
            assert archive_name not in namelist

    finally:
        # Cleanup
        shutil.rmtree(temp_dir)
