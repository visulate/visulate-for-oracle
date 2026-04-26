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
import re
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams

# Import from common module
from common.config import get_mcp_urls
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request, mask_sensitive_data
from common.context import progress_callback_var, session_id_var, browser_session_id_var, auth_token_var, cancelled_var, timeout_signal_var, cancelled_sessions

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

class MCPClient:
    """Client for communicating with Visulate MCP servers."""

    def __init__(self, api_server_tools: McpToolset, query_engine_tools: McpToolset, session_id: Optional[str] = None):
        self.api_server_tools = api_server_tools
        self.query_engine_tools = query_engine_tools
        self.session_id = session_id
        self.credential_token = None

    async def _unwrap_result(self, result: Any) -> Any:
        """Unwrap JSON from MCP ToolResponse if present"""
        if hasattr(result, 'model_dump'):
            data = result.model_dump()
            is_error = data.get("isError", False)

            if "content" in data and isinstance(data["content"], list):
                for item in data["content"]:
                    if item.get("type") == "text":
                        text = item.get("text", "")
                        try:
                            # Try to parse as JSON
                            parsed = json.loads(text)
                            if isinstance(parsed, dict) and is_error and "error" not in parsed:
                                parsed["success"] = False
                                parsed["error"] = text
                            return parsed
                        except json.JSONDecodeError:
                            # If not JSON, but has results marker (specific to execute_sql)
                            if "Results:" in text:
                                return data
                            # Return as error dict if it's a plain string
                            return {"success": not is_error, "error": text if is_error else None, "data": text if not is_error else None, "content": data.get("content")}
            return data
        return result

    async def _call_mcp_tool(self, toolset: McpToolset, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Helper to call an MCP tool using the internal session manager"""
        # Get session from session manager
        session = await toolset._mcp_session_manager.create_session()
        # Call the tool
        return await session.call_tool(tool_name, arguments=arguments)

    async def call_api_server_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the API server MCP endpoint"""
        try:
            # Pass session_id if it's an ERD-related tool that uses it
            if tool_name in ["getSchemaRelationships", "getSchemaColumns"] and self.session_id:
                arguments["session_id"] = self.session_id

            result = await self._call_mcp_tool(self.api_server_tools, tool_name, arguments)
            return await self._unwrap_result(result)
        except Exception as e:
            logger.error(f"Error calling API server tool {tool_name}: {e}")
            return {"error": str(e)}

    async def call_query_engine_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the Query Engine MCP endpoint"""
        try:
            result = await self._call_mcp_tool(self.query_engine_tools, tool_name, arguments)
            return await self._unwrap_result(result)
        except Exception as e:
            logger.error(f"Error calling Query Engine tool {tool_name}: {e}")
            return {"error": str(e)}



    async def execute_sql(self, database: str, sql: str) -> Dict[str, Any]:
        """Execute SQL using the secure credential token"""
        if not self.credential_token:
            return {"error": "No credential token available."}

        result = await self.call_query_engine_tool("execute_sql", {
            "database": database,
            "credential_token": self.credential_token,
            "sql": sql,
            "session_id": browser_session_id_var.get() or self.session_id
        })

        # The rest of the script expects a dict with 'success' and 'data'
        if isinstance(result, dict) and "content" in result and isinstance(result["content"], list):
             for content_item in result["content"]:
                if content_item.get("type") == "text":
                    text = content_item.get("text", "")
                    if "Query executed successfully" in text:
                        try:
                            # Extract JSON results
                            import re
                            results_match = re.search(r'Results:\s*(\[.*?\])', text, re.DOTALL)
                            if results_match:
                                return {"success": True, "data": json.loads(results_match.group(1))}
                        except Exception as e:
                            logger.error(f"JSON parse error in execute_sql: {e}")
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
    def __init__(self, mcp_client: MCPClient, database: str, schema: str, credential_token: Optional[str] = None, session_id: str = "default", username: Optional[str] = None):
        self.client = mcp_client
        self.database = database
        self.schema_input = schema
        self.schema = schema
        self.username = username
        self.credential_token = credential_token
        self.genai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        self.session_id = session_id
        self.db_type = "oracle" 

    async def create_credential_token(self, database: str, username: str) -> bool:
        """
        Create a secure credential token for database access.
        Uses the shared security logic from common.tools.
        """
        from common.tools import get_valid_token
        token = await get_valid_token(database, username)
        if token:
            self.credential_token = token
            # Also update the client's token
            self.client.credential_token = token
            return True
        return False

    def report_progress(self, message: str):
        """Send progress update to the context-local callback if available"""
        # Check for cancellation before reporting progress
        from common.context import cancelled_sessions
        if cancelled_var.get() or timeout_signal_var.get() or self.session_id in cancelled_sessions:
             logger.info(f"Stop signal detected for session {self.session_id} in report_progress for: {message}. Raising Exception.")
             raise Exception("Task stopped")

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
        Find tables and views that need comments using the API server discovery tool.
        Returns a dictionary keyed by table name, containing 'type' and 'missing_columns' list.
        """
        logger.info(f"Finding objects missing comments in {self.schema} matching '{wildcard}' via API server...")

        objects_to_process = {}

        # Call the API server tool for documentation discovery
        result = await self.client.call_api_server_tool("getObjectsMissingComments", {
            "db": self.database,
            "owner": self.schema,
            "wildcard": wildcard
        })

        if "error" in result:
             error_msg = result.get("error", "Unknown error")
             self.report_progress(f"▌ERROR: Failed to find missing comments: {error_msg}")
             logger.error(f"Error finding missing comments: {error_msg}")
             return {}

        # The API server returns nested results: result -> content -> text (JSON string)
        # However, call_api_server_tool in MCPClient currently returns the raw JSON from the server.
        # Let's check how it handles the response.

        data = {}
        try:
            # MCP tools return { "content": [ { "type": "text", "text": "..." } ] }
            if "content" in result and isinstance(result["content"], list):
                for item in result["content"]:
                    if item.get("type") == "text":
                        data = json.loads(item.get("text", "{}"))
                        break
            else:
                data = result # Fallback if not standard MCP format
        except Exception as e:
            logger.error(f"Failed to parse getObjectsMissingComments response: {e}")
            return {}

        # Process tables
        for row in data.get("tables", []):
            table_name = row['name']
            objects_to_process[table_name] = {
                'type': row['type'],
                'missing_table_comment': True,
                'missing_columns': []
            }

        # Process columns
        for row in data.get("columns", []):
            table_name = row['tableName']
            column_name = row['columnName']

            if table_name not in objects_to_process:
                objects_to_process[table_name] = {
                    'type': 'TABLE', # Default type, get_context will resolve if it's a VIEW
                    'missing_table_comment': False,
                    'missing_columns': []
                }

            objects_to_process[table_name]['missing_columns'].append(column_name)

        return objects_to_process

    async def get_sample_rows(self, table_name: str) -> List[Dict[str, Any]]:
        """Get sample rows for a table/view"""
        if self.db_type == "postgres":
            sql = f'SELECT * FROM "{self.schema}"."{table_name}" LIMIT 3'
        else:
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
        You are a {self.db_type.capitalize()} Database expert. Generate concise but descriptive comments for the following database objects.

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

    def get_already_processed_stats(self, file_path: str) -> Dict[str, Set[str]]:
        """
        Parses an existing SQL file to find objects that already have comments.
        Returns a dict mapping table_name -> set of processed items (including '__TABLE__' for table comment).
        """
        if not os.path.exists(file_path):
            return {}
            
        processed = {} 
        # Pattern for COMMENT ON TABLE/VIEW/MATERIALIZED VIEW schema.table IS ... (handles optional quotes)
        table_pattern = re.compile(r"COMMENT ON (?:TABLE|(?:MATERIALIZED )?VIEW)\s+(?:\"?\w+\"?)\.(\"?[\w$#]+\"?)\s+IS", re.IGNORECASE)
        # Pattern for COMMENT ON COLUMN schema.table.column IS ...
        column_pattern = re.compile(r"COMMENT ON COLUMN\s+(?:\"?\w+\"?)\.(\"?[\w$#]+\"?)\.(\"?[\w$#]+\"?)\s+IS", re.IGNORECASE)
        
        try:
            with open(file_path, 'r') as f:
                for line in f:
                    # Look for table comments
                    t_match = table_pattern.search(line)
                    if t_match:
                        t_name = t_match.group(1).replace('"', '').upper()
                        if t_name not in processed:
                            processed[t_name] = set()
                        processed[t_name].add("__TABLE__")
                        continue
                        
                    # Look for column comments
                    c_match = column_pattern.search(line)
                    if c_match:
                        t_name = c_match.group(1).replace('"', '').upper()
                        c_name = c_match.group(2).replace('"', '').upper()
                        if t_name not in processed:
                            processed[t_name] = set()
                        processed[t_name].add(c_name)
        except Exception as e:
            logger.error(f"Error parsing existing SQL file {file_path}: {e}")
            
        return processed

    async def run(self, wildcard: str, output_file: str, offset: int = 0) -> int:
        """Main execution flow. Returns the number of comments generated."""

        # 0. Determine Database Type First
        databases_result = await self.client.call_query_engine_tool("list_databases", {})
        if "content" in databases_result:
            for item in databases_result["content"]:
                if item.get("type") == "text":
                    # Try to find this database in the list to get its type
                    match = re.search(fr"- {self.database}: (\w+)", item.get("text", ""))
                    if match:
                        self.db_type = match.group(1).lower()
                        logger.info(f"Detected database type for {self.database}: {self.db_type}")

        # Set schema casing based on db type
        self.schema = self.schema_input.upper() if self.db_type == "oracle" else self.schema_input

        # 1. Setup Client
        if self.credential_token:
            self.client.credential_token = self.credential_token
            self.report_progress("Verifying credential token...")
            # Test the token with dialect-aware SQL
            test_sql = "SELECT 1" if self.db_type == "postgres" else "SELECT 1 FROM DUAL"
            test_result = await self.client.execute_sql(self.database, test_sql)
            if not test_result.get("success"):
                logger.warning(f"Provided token failed validation: {test_result.get('error')}. Attempting fallback to password...")
                self.credential_token = None
            else:
                self.report_progress("Credential token verified.")

        if not self.credential_token:
            # Automated handshake using shared logic
            # Use self.username if provided, otherwise fallback to schema (Oracle style)
            p_token = await self.create_credential_token(self.database, self.username or self.schema)
            if not p_token:
                # If handshake fails, it means no credentials were found in any source
                self.report_progress("▌ACTION REQUIRED: No credentials found for this database/schema selection. Providing them enables data sampling for significantly better accuracy.")
                self.report_progress("▌PROMPT: Would you like to provide credentials now, or should I proceed with basic metadata-only generation? (To provide them, click the key icon and then tell me to 'continue').")
                # Return -1 to signal interactive stop to the agent
                return -1
            else:
                self.report_progress("New credential token created and verified via shared handshake.")


        # 2. Find objects
        objects_map = await self.find_missing_comments(wildcard)
        self.report_progress(f"Found {len(objects_map)} tables/views with missing comments (table or columns) in the database.")

        self.generated_count = 0

        # Check existing file for already processed items if we're appending or resuming
        processed_stats = self.get_already_processed_stats(output_file)
        skipped_tables = 0
        if processed_stats:
            fully_skipped_tables = []
            
            for table_name, info in list(objects_map.items()):
                t_name_upper = table_name.upper()
                if t_name_upper in processed_stats:
                    already_done = processed_stats[t_name_upper]
                    
                    # Filter missing column comments
                    if 'missing_columns' in info:
                        info['missing_columns'] = [c for c in info['missing_columns'] if c.upper() not in already_done]
                    
                    # Filter missing table comment
                    if info.get('missing_table_comment') and "__TABLE__" in already_done:
                        info['missing_table_comment'] = False
                        
                    # If nothing left for this table, remove it from map
                    if not info.get('missing_table_comment') and not info.get('missing_columns'):
                        del objects_map[table_name]
                        skipped_tables += 1
            for t_name in fully_skipped_tables:
                self.report_progress(f"▌SKIP: '{t_name}' already found in existing session file. Step 3 complete.")

            if skipped_tables > 0:
                self.report_progress(f"▌INFO: Skipped {skipped_tables} objects that are already up-to-date in the session script.")
                logger.info(f"Skipped already processed tables: {fully_skipped_tables}")

        if not objects_map:
            self.report_progress("No objects missing comments found.")
            return 0

        self.report_progress(f"Found {len(objects_map)} objects missing comments. Starting generation...")

        # 4. Integrate Resume Logic
        all_objects = list(objects_map.items())
        
        # Step 3 (file-parsing) is our primary resume mechanism. If we successfully 
        # identified and skipped objects already in the file, we ignore the manual 
        # offset to avoid double-skipping.
        file_has_content = os.path.exists(output_file) and os.path.getsize(output_file) > 0
        
        if offset > 0 and not skipped_tables > 0:
            self.report_progress(f"Applying manual resume offset {offset}...")
            to_process = all_objects[offset:]
        else:
            # Step 3 handled the resume, or no offset provided
            to_process = all_objects
        
        # Use append mode if we are resuming/continuing OR if the file already contains work
        file_has_content = os.path.exists(output_file) and os.path.getsize(output_file) > 0
        mode = 'a' if (offset > 0 or file_has_content) else 'w'
        
        self.report_progress(f"Opening output file {output_file} in mode '{mode}'...")
        
        sql_statements = []

        with open(output_file, mode) as f:
            if mode == 'w':
                f.write(f"-- Auto-generated comments for {self.schema} in {self.database}\n")
                f.write(f"-- Generated on {json.dumps(str(os.getenv('VISULATE_BASE')))}\n\n")
                f.flush()

            try:
                for table_name, info in to_process:
                    # Check for cancellation or timeout
                    if cancelled_var.get() or timeout_signal_var.get() or self.session_id in cancelled_sessions:
                        reason = "Time limit" if timeout_signal_var.get() else "Cancellation"
                        logger.info(f"▌{reason.upper()}: Process stopped while working on {table_name}.")
                        break

                    table_type = info['type']
                    missing_table_comment = info['missing_table_comment']
                    missing_columns = info['missing_columns']

                    self.report_progress(f"Processing {table_type} {table_name}...")
                    
                    table_statements = [] # Statements for THIS table

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
                        if self.db_type == "postgres":
                            if table_type.upper() == "VIEW":
                                obj_keyword = "VIEW"
                            elif "MATERIALIZED" in table_type.upper():
                                obj_keyword = "MATERIALIZED VIEW"
                            else:
                                obj_keyword = "TABLE"
                            stmt = f'COMMENT ON {obj_keyword} "{self.schema}"."{table_name}" IS \'{safe_comment}\';'
                        else:
                            stmt = f"COMMENT ON TABLE {self.schema}.{table_name} IS '{safe_comment}';"
                        table_statements.append(stmt)
                        self.generated_count += 1
                        logger.info(f"Generated table comment: {comment}")

                    # 7. Process column comments
                    for col_name in missing_columns:
                        comment_key = f'{col_name}_comment'
                        if comment_key in comments_dict:
                            comment = comments_dict[comment_key]
                            self.report_progress(f"Generated column comment for {table_name}.{col_name}")
                            safe_comment = comment.replace("'", "''")
                            if self.db_type == "postgres":
                                stmt = f'COMMENT ON COLUMN "{self.schema}"."{table_name}"."{col_name}" IS \'{safe_comment}\';'
                            else:
                                stmt = f"COMMENT ON COLUMN {self.schema}.{table_name}.{col_name} IS '{safe_comment}';"
                            table_statements.append(stmt)
                            self.generated_count += 1
                            logger.info(f"Generated column comment for {col_name}: {comment}")
                    
                    if table_statements:
                        for stmt in table_statements:
                            f.write(stmt + "\n")
                        f.write("\n") # Add blank line between objects
                        f.flush()
                        os.fsync(f.fileno()) # Ensure it hits the disk
            except Exception as e:
                if str(e) == "Task stopped":
                    logger.info("Task stopped via exception, returning partial results.")
                else:
                    raise e

        logger.info(f"Successfully finalized {self.generated_count} comments to {output_file}")
        if self.generated_count > 0:
             self.report_progress(f"▌SUCCESS: SQL script updated with {self.generated_count} new comments: {output_file}")
        return self.generated_count

def main():
    parser = argparse.ArgumentParser(description="Oracle Comment Generator Agent")
    parser.add_argument("--database", required=True, help="Target database name")
    parser.add_argument("--schema", required=True, help="Target schema name")
    parser.add_argument("--wildcard", default="%", help="Wildcard pattern for object names")
    parser.add_argument("--output", default="generated_comments.sql", help="Output SQL file")

    args = parser.parse_args()

    # Use CredentialManager to get password - handling the new (password, source) return type
    cred_manager = CredentialManager()
    password, source = cred_manager.get_password(args.database, args.schema)

    if not password:
        # Fallback logic for specific test case if needed, or error
        if args.schema.upper() == "RNTMGR2":
             password = "DevPasswd" 
             source = "Legacy Fallback"
        else:
             logger.error(f"Password not found for {args.database}.{args.schema}")
             sys.exit(1)

    api_url, qe_url = get_mcp_urls()
    api_server_tools = McpToolset(connection_params=StreamableHTTPConnectionParams(url=api_url))
    query_engine_tools = McpToolset(connection_params=StreamableHTTPConnectionParams(url=qe_url))
    client = MCPClient(api_server_tools, query_engine_tools)

    # Use the refactored HANDSHAKE logic from CommentGenerator
    generator = CommentGenerator(client, args.database, args.schema)
    
    logger.info(f"Establishing secure connection for {args.database}.{args.schema} via {source}...")
    import asyncio
    async def run_gen():
        # This will perform the automated handshake/token creation internally
        await generator.run(args.wildcard, args.output)

    asyncio.run(run_gen())

if __name__ == "__main__":
    main()
