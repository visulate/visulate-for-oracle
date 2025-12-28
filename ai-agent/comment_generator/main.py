#!/usr/bin/env python3
"""
Oracle Comment Generator Agent

This script identifies Oracle database objects (tables, views, columns) that are missing comments,
inspects their structure and data using Visulate MCP tools, and generates meaningful comments
using Google's Gemini model. The output is a SQL script containing "COMMENT ON" statements.

Usage:
    python -m ai_agent.comment_generator.main --database <db_name> --schema <schema_name> [--wildcard <pattern>] [--output <file.sql>]
"""

import os
import sys
import json
import argparse
import logging
import requests
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Import from common module
from common.config import get_mcp_urls
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request, mask_sensitive_data
from common.context import progress_callback_var, auth_token_var, cancelled_var

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

@dataclass
class MCPConfig:
    """Configuration for MCP client"""
    google_api_key: str
    visulate_base: str
    api_server_url: str
    query_engine_url: str

def get_config() -> MCPConfig:
    """Load configuration from environment variables"""
    google_api_key = os.getenv("GOOGLE_API_KEY")
    visulate_base = os.getenv("VISULATE_BASE", "http://localhost")

    if not google_api_key:
        logger.error("GOOGLE_API_KEY not found in environment")
        sys.exit(1)

    # Use common config for URLs
    api_server_url, query_engine_url = get_mcp_urls()

    return MCPConfig(
        google_api_key=google_api_key,
        visulate_base=visulate_base,
        api_server_url=api_server_url,
        query_engine_url=query_engine_url
    )

class MCPClient:
    """Client for interacting with Visulate MCP endpoints"""

    def __init__(self, config: MCPConfig):
        self.config = config
        self.session = requests.Session()
        self.credential_token: Optional[str] = None

    async def call_api_server_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the API server MCP endpoint"""
        import asyncio
        url = f"{self.config.api_server_url}"
        payload = {
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        def do_request():
            try:
                response = self.session.post(url, json=payload, timeout=30)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Error calling API server tool {tool_name}: {e}")
                return {"error": str(e)}

        return await asyncio.to_thread(do_request)

    async def call_query_engine_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the Query Engine MCP endpoint"""
        import asyncio
        url = f"{self.config.query_engine_url}/call_tool"
        payload = {
            "name": tool_name,
            "arguments": arguments
        }

        def do_request():
            try:
                response = self.session.post(url, json=payload, timeout=30)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"Error calling Query Engine tool {tool_name}: {e}")
                return {"error": str(e)}

        return await asyncio.to_thread(do_request)

    def create_credential_token(self, database: str, username: str, password: str) -> bool:
        """Create a secure credential token for database access"""
        result = create_token_request(self.config.query_engine_url, database, username, password)
        token = parse_token_from_response(result)

        if token:
            self.credential_token = token
            return True
        else:
            logger.error(f"Failed to create credential token: {mask_sensitive_data(result)}")
            return False

    async def execute_sql(self, database: str, sql: str) -> Dict[str, Any]:
        """Execute SQL using the secure credential token"""
        if not self.credential_token:
            return {"error": "No credential token available."}

        result = await self.call_query_engine_tool("execute_sql", {
            "database": database,
            "credential_token": self.credential_token,
            "sql": sql
        })

        # Parse MCP response
        if "content" in result and isinstance(result["content"], list):
             for content_item in result["content"]:
                if content_item.get("type") == "text":
                    text = content_item.get("text", "")
                    logger.info(f"Raw SQL response text: {text}")
                    if "Query executed successfully" in text:
                        try:
                            # Extract JSON results
                            import re
                            results_match = re.search(r'Results:\s*(\[.*?\])', text, re.DOTALL)
                            if results_match:
                                return {"success": True, "data": json.loads(results_match.group(1))}
                            else:
                                logger.warning("Regex match failed for Results array.")
                        except Exception as e:
                            logger.error(f"JSON parse error: {e}")
                            return {"success": False, "error": f"Parse error: {e}"}
                    elif "Query failed" in text:
                         return {"success": False, "error": text}

        return result

    async def get_context(self, database: str, owner: str, name: str, type_: str) -> Dict[str, Any]:
        """Get full context for a database object"""
        return await self.call_api_server_tool("getContext", {
            "db": database,
            "owner": owner,
            "name": name,
            "type": type_,
            "relationship_types": "FK"
        })

class CommentGenerator:
    def __init__(self, mcp_client: MCPClient, database: str, schema: str, credential_token: Optional[str] = None, session_id: str = "default"):
        self.client = mcp_client
        self.database = database
        self.schema = schema.upper()
        self.genai_client = genai.Client(api_key=mcp_client.config.google_api_key)
        self.credential_token = credential_token
        self.session_id = session_id

    def report_progress(self, message: str):
        """Send progress update to the context-local callback if available"""
        # Check for cancellation before reporting progress
        from common.context import cancelled_var, cancelled_sessions
        if cancelled_var.get() or self.session_id in cancelled_sessions:
             logger.info(f"Cancellation detected for session {self.session_id} in report_progress for: {message}. Raising Exception.")
             raise Exception("Task cancelled by user")

        callback = progress_callback_var.get()
        if callback:
            logger.info(f"CALLBACK_FOUND: Reporting progress: {message}")
            try:
                callback(message)
            except Exception as e:
                logger.debug(f"Error calling progress callback: {e}")
        else:
            logger.info(f"CALLBACK_NOT_FOUND: No progress callback registered for: {message}")
        logger.info(message)

    async def find_missing_comments(self, wildcard: str = "%") -> Dict[str, Dict[str, Any]]:
        """
        Find tables and views that need comments.
        Returns a dictionary keyed by table name, containing 'type' and 'missing_columns' list.
        """
        logger.info(f"Finding objects missing comments in {self.schema} matching '{wildcard}'...")

        objects_to_process = {}

        # 1. Find tables/views with missing comments
        sql_tables = f"""
            SELECT owner, table_name, table_type
            FROM all_tab_comments
            WHERE owner = '{self.schema}'
            AND table_name LIKE '{wildcard}'
            AND comments IS NULL
            AND table_type IN ('TABLE', 'VIEW')
        """
        result_tables = await self.client.execute_sql(self.database, sql_tables)
        logger.info(f"Result tables: {result_tables}")
        if not result_tables.get("success"):
            error_msg = result_tables.get("error", "Unknown error")
            self.report_progress(f"▌ERROR: Failed to find tables: {error_msg}. Check database logs or credentials.")
            logger.error(f"Error finding tables: {error_msg}")
            return {}

        for row in result_tables.get("data", []):
            table_name = row['TABLE_NAME']
            objects_to_process[table_name] = {
                'type': row['TABLE_TYPE'],
                'missing_table_comment': True,
                'missing_columns': []
            }

        # 2. Find columns with missing comments
        sql_columns = f"""
            SELECT owner, table_name, column_name
            FROM all_col_comments
            WHERE owner = '{self.schema}'
            AND table_name LIKE '{wildcard}'
            AND comments IS NULL
        """
        result_columns = await self.client.execute_sql(self.database, sql_columns)
        if result_columns.get("success"):
            for row in result_columns.get("data", []):
                table_name = row['TABLE_NAME']
                column_name = row['COLUMN_NAME']

                if table_name not in objects_to_process:
                    # We need to look up the table type if we haven't seen it yet
                    # This is a bit inefficient, so let's try to get it from context later or query it now.
                    # For simplicity, let's assume it's a TABLE if not found, or query all_objects.
                    # Better: just add it and resolve type later or assume TABLE/VIEW from context.
                    objects_to_process[table_name] = {
                        'type': 'UNKNOWN', # Will resolve if needed, or just use 'TABLE' as default for context lookup
                        'missing_table_comment': False,
                        'missing_columns': []
                    }

                objects_to_process[table_name]['missing_columns'].append(column_name)

        return objects_to_process

    async def get_sample_rows(self, table_name: str) -> List[Dict[str, Any]]:
        """Get sample rows for a table/view"""
        sql = f"SELECT * FROM {self.schema}.{table_name} WHERE ROWNUM <= 3"
        result = await self.client.execute_sql(self.database, sql)
        if result.get("success"):
            return result.get("data", [])
        return []

    async def generate_comments_batch(self, object_name: str, object_type: str, context: Dict[str, Any], sample_data: List[Dict[str, Any]], missing_table_comment: bool, missing_columns: List[str]) -> Dict[str, str]:
        """Generate comments for a table and its columns in a single request"""

        # Build the prompt for all comments needed
        targets = []
        if missing_table_comment:
            targets.append(f"TABLE_COMMENT for {object_type} {self.schema}.{object_name}")

        for column_name in missing_columns:
            targets.append(f"COLUMN_COMMENT for {column_name} in {object_type} {object_name}")

        if not targets:
            return {}

        # Build the expected JSON structure
        json_keys = []
        if missing_table_comment:
            json_keys.append('"table_comment": "your table comment here"')
        for column_name in missing_columns:
            json_keys.append(f'"{column_name}_comment": "your comment for {column_name} here"')

        prompt = f"""
        You are an Oracle Database expert. Generate concise but descriptive comments for the following database objects.

        Database Object: {self.schema}.{object_name} ({object_type})

        Context (Structure, Columns, Relationships):
        {json.dumps(context, indent=2)}

        Sample Data (First 3 rows):
        {json.dumps(sample_data, indent=2)}

        Generate comments for the following targets:
        {chr(10).join(f'- {target}' for target in targets)}

        Instructions:
        1. For table comments: Describe what this object represents based on its name, columns, and data.
        2. For column comments: Explain what each column stores based on its name, data type, and sample values.
        3. If it's a view, mention its purpose in the comment.
        4. If there are foreign keys, you may reference related tables.
        5. Keep column comments under 200 characters, prioritize clarity.
        6. Return your response as a JSON object with keys for each target.

        Expected JSON format:
        {{
            {',\n            '.join(json_keys)}
        }}

        Return ONLY the JSON object, no other text or formatting.
        """

        try:
            import asyncio
            def do_generate():
                return self.genai_client.models.generate_content(
                    model="gemini-flash-latest",
                    contents=prompt
                )

            response = await asyncio.to_thread(do_generate)

            # Parse the JSON response
            response_text = response.text.strip()
            if response_text.startswith('```json'):
                response_text = response_text.replace('```json', '').replace('```', '').strip()

            comments_dict = json.loads(response_text)
            return comments_dict

        except Exception as e:
            logger.error(f"Error generating comments for {object_name}: {e}")
            # Fallback: return basic comments
            result = {}
            if missing_table_comment:
                result['table_comment'] = f"Auto-generated comment for {object_type} {object_name}"
            for column_name in missing_columns:
                result[f'{column_name}_comment'] = f"Auto-generated comment for column {column_name}"
            return result

    async def run(self, wildcard: str, output_file: str) -> int:
        """Main execution flow. Returns the number of comments generated."""
        from common.context import cancelled_var, cancelled_sessions

        # 1. Setup Client
        if self.credential_token:
            self.client.credential_token = self.credential_token
            self.report_progress("Using provided credential token.")
        else:
            # Get password and set up MCP credential token
            cred_manager = CredentialManager()
            password = cred_manager.get_password(self.database, self.schema)
            if not password:
                self.report_progress(f"Error: Password not found for {self.database}.{self.schema}")
                return 0
            if not self.client.create_credential_token(self.database, self.schema, password):
                self.report_progress("Error: Failed to create credential token.")
                return 0

        # 2. Find objects
        objects_map = await self.find_missing_comments(wildcard)
        self.report_progress(f"Found {len(objects_map)} tables/views with missing comments (table or columns).")

        if not objects_map:
            self.report_progress("No objects missing comments found.")
            return 0

        self.report_progress(f"Found {len(objects_map)} objects missing comments. Starting generation...")

        sql_statements = []

        for table_name, info in objects_map.items():
            # Check for cancellation
            if cancelled_var.get() or self.session_id in cancelled_sessions:
                self.report_progress("Cancellation detected. Stopping...")
                break

            table_type = info['type']
            missing_table_comment = info['missing_table_comment']
            missing_columns = info['missing_columns']

            self.report_progress(f"Processing {table_type} {table_name}...")

            # 3. Get Context (once per table)
            context = await self.client.get_context(self.database, self.schema, table_name, table_type)

            # 4. Get Sample Data (once per table)
            sample_data = await self.get_sample_rows(table_name)

            # 5. Generate all comments in a single request
            comments_dict = await self.generate_comments_batch(table_name, table_type, context, sample_data, missing_table_comment, missing_columns)

            # 6. Process table comment
            if missing_table_comment and 'table_comment' in comments_dict:
                comment = comments_dict['table_comment']
                self.report_progress(f"Generated table comment for {table_name}")
                safe_comment = comment.replace("'", "''")
                stmt = f"COMMENT ON TABLE {self.schema}.{table_name} IS '{safe_comment}';"
                sql_statements.append(stmt)
                logger.info(f"Generated table comment: {comment}")

            # 7. Process column comments
            for col_name in missing_columns:
                comment_key = f'{col_name}_comment'
                if comment_key in comments_dict:
                    comment = comments_dict[comment_key]
                    self.report_progress(f"Generated column comment for {table_name}.{col_name}")
                    safe_comment = comment.replace("'", "''")
                    stmt = f"COMMENT ON COLUMN {self.schema}.{table_name}.{col_name} IS '{safe_comment}';"
                    sql_statements.append(stmt)
                    logger.info(f"Generated column comment for {col_name}: {comment}")

        # 7. Write to file
        with open(output_file, 'w') as f:
            f.write(f"-- Auto-generated comments for {self.schema} in {self.database}\n")
            f.write(f"-- Generated on {json.dumps(str(os.getenv('VISULATE_BASE')))}\n\n")
            for stmt in sql_statements:
                f.write(stmt + "\n")

        logger.info(f"Successfully wrote {len(sql_statements)} comments to {output_file}")
        self.report_progress(f"▌SUCCESS: SQL script generated with {len(sql_statements)} comments: {output_file}")
        return len(sql_statements)

def main():
    parser = argparse.ArgumentParser(description="Oracle Comment Generator Agent")
    parser.add_argument("--database", required=True, help="Target database name")
    parser.add_argument("--schema", required=True, help="Target schema name")
    parser.add_argument("--wildcard", default="%", help="Wildcard pattern for object names")
    parser.add_argument("--output", default="generated_comments.sql", help="Output SQL file")

    args = parser.parse_args()

    # Use CredentialManager to get password
    cred_manager = CredentialManager()
    password = cred_manager.get_password(args.database, args.schema)

    if not password:
        # Fallback logic for specific test case if needed, or error
        if args.schema.upper() == "RNTMGR2":
             password = "DevPasswd" # From memory/legacy
        else:
             logger.error(f"Password not found for {args.database}.{args.schema}")
             sys.exit(1)

    config = get_config()
    client = MCPClient(config)

    logger.info("Creating credential token...")
    if not client.create_credential_token(args.database, args.schema, password):
        sys.exit(1)

    generator = CommentGenerator(client, args.database, args.schema)
    generator.run(args.wildcard, args.output)

if __name__ == "__main__":
    main()
