import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from test_data_generator.generator import TestDataGenerator

@pytest.fixture
def generator():
    with patch("test_data_generator.generator.genai.Client"):
        return TestDataGenerator("http://api-server", "test-session")

@pytest.mark.asyncio
async def test_is_adb_true(generator):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "title": "Oracle Cloud Autonomous Database Instance",
                "rows": [{"Autonomous Database": "Yes"}]
            }
        ]
        mock_get.return_value = mock_response

        assert await generator.is_adb("DB1") is True

@pytest.mark.asyncio
async def test_is_adb_false(generator):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "title": "Oracle Cloud Autonomous Database Instance",
                "rows": [{"Autonomous Database": "No"}]
            }
        ]
        mock_get.return_value = mock_response

        assert await generator.is_adb("DB1") is False

@pytest.mark.asyncio
async def test_is_adb_robust_keys(generator):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "title": "Oracle Cloud Autonomous Database Instance",
                "rows": [{"AUTONOMOUS DATABASE": "Yes"}]
            }
        ]
        mock_get.return_value = mock_response

        assert await generator.is_adb("DB1") is True

@pytest.mark.asyncio
async def test_generate_table_data_prompt_adb(generator):
    mock_response = MagicMock()
    mock_response.text = '{"inserts": "", "csv": "", "ctl": "", "dat": "", "external_sql": ""}'

    with patch("test_data_generator.generator.asyncio.to_thread", AsyncMock()) as mock_to_thread:
        # Side effect: execute the function passed to to_thread
        mock_to_thread.side_effect = lambda f, *args, **kwargs: f(*args, **kwargs)

        with patch.object(generator.genai_client.models, "generate_content") as mock_gen:
            mock_gen.return_value = mock_response
            await generator.generate_table_data("TABLE1", {}, use_adb_syntax=True)

            # Check call arguments
            prompt = mock_gen.call_args[1]["contents"]
            assert "DBMS_CLOUD.CREATE_EXTERNAL_TABLE" in prompt
            assert "table1.dat" in prompt # Verify lowercase filename in ADB syntax

@pytest.mark.asyncio
async def test_generate_table_data_prompt_pdb(generator):
    mock_response = MagicMock()
    mock_response.text = '{"inserts": "", "csv": "", "ctl": "", "dat": "", "external_sql": ""}'

    with patch("test_data_generator.generator.asyncio.to_thread", AsyncMock()) as mock_to_thread:
        mock_to_thread.side_effect = lambda f, *args, **kwargs: f(*args, **kwargs)

        with patch.object(generator.genai_client.models, "generate_content") as mock_gen:
            mock_gen.return_value = mock_response
            await generator.generate_table_data("TABLE1", {}, use_adb_syntax=False)

            prompt = mock_gen.call_args[1]["contents"]
            assert "ORGANIZATION EXTERNAL" in prompt
            assert "table1.dat" in prompt # Verify lowercase filename in PDB syntax
