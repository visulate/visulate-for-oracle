import os
import json
import logging
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from google import genai
from common.context import progress_callback_var, session_id_var

logger = logging.getLogger(__name__)

class TestDataGenerator:
    def __init__(self, api_server_url: str, session_id: str):
        self.api_server_url = api_server_url.rstrip('/')
        self.session_id = session_id
        self.genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def report_progress(self, message: str):
        """Send progress update to the context-local callback if available"""
        callback = progress_callback_var.get()
        if callback:
            try:
                callback(message)
            except Exception as e:
                logger.debug(f"Error calling progress callback: {e}")
        logger.info(message)

    async def get_object_details(self, db: str, owner: str, name: str, object_type: str = "TABLE") -> Dict[str, Any]:
        """Call the API server's REST endpoint for object context"""
        url = f"{self.api_server_url}/context/{db}"
        try:
            payload = {
                "owner": owner,
                "type": object_type,
                "name": name,
                "relationship_types": "FK"
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Error fetching details for {name} from {url}: {e}")
            return {"error": str(e)}

    async def generate_table_data(self, table_name: str, context: Dict[str, Any]) -> Dict[str, str]:
        """Ask GenAI to generate the 3 formats for a single table"""

        prompt = f"""
        You are an Oracle Database expert. Generate test data (10 rows) for the following table.

        Table Name: {table_name}
        Context (Columns, PKs, FKs):
        {json.dumps(context, indent=2)}

        Requirements:
        1. **SQL Inserts**: Standard `INSERT INTO ...` statements.
        2. **CSV Data**: Comma-separated values, optionally enclosed in quotes.
        3. **SQL*Loader CTL**: Control file using `FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'`.
        4. **Fixed-Length Data (.dat)**: Each column padded (with spaces) to its full defined length from the metadata.
        5. **External Table DDL**: `CREATE TABLE ... ORGANIZATION EXTERNAL` with `ORACLE_LOADER` and `POSITION` specs matching the .dat file.

        Return your response as a JSON object with these keys:
        - "inserts": string
        - "csv": string
        - "ctl": string
        - "dat": string
        - "external_sql": string

        Return ONLY the JSON object, no other text or explanation. Ensure the JSON is valid.
        """

        try:
            def do_generate():
                return self.genai_client.models.generate_content(
                    model="gemini-flash-latest",
                    config=genai.types.GenerateContentConfig(
                        response_mime_type="application/json"
                    ),
                    contents=prompt
                )

            response = await asyncio.to_thread(do_generate)
            text = response.text.strip()
            return json.loads(text)
        except Exception as e:
            logger.error(f"GenAI error for {table_name}: {e}")
            return {"error": str(e)}

    async def run(self, db: str, owner: str, tables: List[str], output_dir: str) -> Dict[str, Any]:
        """Main loop to generate and save data for all tables"""
        all_files = []
        errors = []

        # Combined files
        master_inserts = []
        master_external_ddl = []

        for table in tables:
            self.report_progress(f"Analyzing structure for `{table}`...")
            details = await self.get_object_details(db, owner, table)
            if "error" in details:
                err_msg = f"Skipping `{table}`: {details['error']}"
                self.report_progress(f"WARNING: {err_msg}")
                errors.append(err_msg)
                continue

            self.report_progress(f"Generating data formats for `{table}`...")
            data = await self.generate_table_data(table, details)
            if "error" in data or not isinstance(data, dict):
                err_msg = f"Generation failed for `{table}`: {data.get('error', 'Invalid response format')}"
                self.report_progress(f"WARNING: {err_msg}")
                errors.append(err_msg)
                continue

            # Save individual files
            for ext in ['csv', 'ctl', 'dat']:
                if ext in data:
                    filename = f"{table}.{ext}"
                    with open(os.path.join(output_dir, filename), "w") as f:
                        f.write(data[ext])
                    all_files.append(filename)

            if 'inserts' in data:
                master_inserts.append(f"-- Table: {table}\n{data['inserts']}")
            if 'external_sql' in data:
                master_external_ddl.append(f"-- Table: {table}\n{data['external_sql']}")

        # Save master files
        if master_inserts:
            with open(os.path.join(output_dir, "inserts.sql"), "w") as f:
                f.write("\n\n-- Combined Inserts\n")
                f.write("\n\n".join(master_inserts))
                f.write("\nCOMMIT;\n")
            all_files.append("inserts.sql")

        if master_external_ddl:
            with open(os.path.join(output_dir, "external_tables.sql"), "w") as f:
                f.write("\n\n-- External Table Definitions\n")
                f.write("\n\n".join(master_external_ddl))
            all_files.append("external_tables.sql")

        return {"files": all_files, "errors": errors}
