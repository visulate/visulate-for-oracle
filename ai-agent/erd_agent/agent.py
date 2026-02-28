import logging
import os
import json
from datetime import datetime
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

from common.tools import get_mcp_toolsets
from common.context import session_id_var, progress_callback_var, auth_token_var
from erd_agent.diagram_generator import DiagramGenerator

logger = logging.getLogger(__name__)

def report_progress(message: str) -> str:
    """Reports progress to the current context-local callback."""
    callback = progress_callback_var.get()
    if callback:
        callback(message)
    logger.info(message)
    return f"Progress reported: {message}"

SYSTEM_INSTRUCTION = """You are the Visulate ERD Generation Agent, a specialist in creating architectural diagrams for Oracle database schemas.

## Your Goal
Your primary objective is to generate a Draw.io (XML) Entity Relationship Diagram for a given database schema.

## Your Workflow
When asked to generate an ERD:
1. **Initial Research**: Use `getSchemaSummary` to get all tables and views in the schema.
2. **Sub-system Identification (Optional)**: If the user specifies a sub-system (e.g., "property management tables"), analyze the table names and comments from the summary to identify the relevant subset of tables.
3. **Metadata Collection (Performance Optimized)**:
   - Use `getSchemaRelationships` and `getSchemaColumns` to retrieve technical details.
   - **Important**: These tools may return a `sessionFile` reference instead of raw JSON for large schemas.
   - When calling `generate_erd_file`, you MUST pass the results from these tools directly. If a tool returned a `sessionFile` reference (a dictionary with `sessionFile` and `message`), pass that object or its string representation as the argument. The generation tool will then pull the full data from session storage, avoiding character generation lag.
4. **Filtering**:
   - IGNORE database views (only process objects with Type 'TABLE').
   - IGNORE isolated tables (tables that are neither a parent nor a child in any foreign key relationship).
   - If a sub-system was specified, further restrict the diagram to the identified tables and their immediate neighbors (one hop away in the relationship graph) to provide context.
5. **Clustering**: Group the remaining related tables into coherent pages. Each page should focus on one or more "focal entities" (central tables) and their immediate relationships.
6. **Limit**: Ensure no page exceeds 40 tables. Create multiple pages if necessary.
7. **Layout**: Identify Master-Detail relationships. In your generated diagram, detail tables should be positioned below or to the right of their masters.
8. **Generation**: Call the `generate_erd_file` tool with the filtered tables, their columns, and relationships. Provide a descriptive `diagram_name` that reflects the schema and any sub-system specified (e.g., "HR Schema Overview", "Property Management Sub-system").
9. **Delivery**: Provide the user with the download link returned by the tool.

## Guidelines
- **Thinking and Progress**: ALWAYS provide real-time updates using the `report_progress` tool at EACH step. Proactively report progress **before** starting any long-running tool calls (e.g., "Fetching columns for 30 tables...").
- Focus on architectural clarity.
- Your final response MUST include the download link in markdown format.
- **STRICT LINK USAGE**: When the  tool returns a download link to you, you MUST output that EXACT link to the user. Do not fabricate or shorten the link URL or change the file extension in your final generated response.
"""

async def generate_erd_file(database: str, schema: str, tables_json: str, relationships_json: str, columns_json: str, diagram_name: str = "ERD") -> str:
    """
    Generates a Draw.io XML file for the given schema data.

    Args:
        database: The database name.
        schema: The schema name.
        tables_json: JSON string containing the list of tables from getSchemaSummary.
        relationships_json: JSON string containing foreign key relationships.
        columns_json: JSON string containing column definitions from getSchemaColumns.
        diagram_name: A descriptive name for the diagram (e.g., 'HR Schema').
    """
    try:
        session_id = session_id_var.get()
        all_tables = json.loads(tables_json)

        # Support metadata caching to avoid "data couriering" lag
        downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
        cache_dir = os.path.join(downloads_base, "metadata")

        def load_metadata(json_input, entity_type):
            try:
                # If input is already a list or dict, skip json.loads
                if isinstance(json_input, (list, dict)):
                    data = json_input
                else:
                    data = json.loads(str(json_input))

                # Check for explicit cacheFile reference from MCP tool
                if isinstance(data, dict) and 'cacheFile' in data:
                    report_progress(f"Reading {entity_type} from cache: {data['cacheFile']}")
                    file_path = os.path.join(cache_dir, data['cacheFile'])
                    if os.path.exists(file_path):
                        with open(file_path, 'r') as f:
                            return json.loads(f.read())
                    else:
                        logger.warning(f"Cache file not found: {file_path}")

                # Check for explicit sessionFile reference (backward compatibility)
                if isinstance(data, dict) and 'sessionFile' in data:
                    report_progress(f"Reading {entity_type} from session storage: {data['sessionFile']}")
                    file_path = os.path.join(downloads_base, session_id, data['sessionFile'])
                    if os.path.exists(file_path):
                        with open(file_path, 'r') as f:
                            return json.loads(f.read())

                # Fallback: check for standard schema-based cache file
                standard_file = f"{database.lower()}_{schema.lower()}_{entity_type}.json"
                file_path = os.path.join(cache_dir, standard_file)
                if os.path.exists(file_path):
                    # Only use fallback if input is a small summary/placeholder
                    input_len = len(str(json_input))
                    if input_len < 500:
                        report_progress(f"Reading {entity_type} from schema cache: {standard_file}")
                        with open(file_path, 'r') as f:
                            return json.loads(f.read())

                # If it's a list, return it. If it's a dict but we couldn't load file, return []
                return data if isinstance(data, list) else []
            except Exception as e:
                logger.warning(f"Metadata load failure for {entity_type}: {e}")
                return []

        relationships = load_metadata(relationships_json, "relationships")
        all_columns = load_metadata(columns_json, "columns")

        # 1. Map columns to tables
        report_progress("Mapping columns to tables...")
        col_map = {}
        for col in all_columns:
            # Normalize column data (Legacy cache support)
            norm_col = {
                'tableName': col.get('tableName') or col.get('Table Name'),
                'columnName': col.get('columnName') or col.get('Column Name'),
                'dataType': col.get('dataType') or col.get('Data Type'),
                'nullable': col.get('nullable') or col.get('Nullable')
            }
            t_name = norm_col['tableName']
            if not t_name: continue
            if t_name not in col_map: col_map[t_name] = []
            col_map[t_name].append(norm_col)

        # 2. Identify tables with relationships
        report_progress("Identifying related tables...")
        related_tables = set()
        norm_relationships = []
        for rel in relationships:
            # Normalize relationship data (Legacy cache support)
            norm_rel = {
                'tableName': rel.get('tableName') or rel.get('Table Name'),
                'referencedTable': rel.get('referencedTable') or rel.get('Referenced Table'),
                'constraintName': rel.get('constraintName') or rel.get('Constraint Name'),
                'referencedOwner': rel.get('referencedOwner') or rel.get('Referenced Owner')
            }
            t_name = norm_rel['tableName']
            ref_t_name = norm_rel['referencedTable']
            if t_name: related_tables.add(t_name)
            if ref_t_name: related_tables.add(ref_t_name)
            norm_relationships.append(norm_rel)

        relationships = norm_relationships

        # 3. Filter tables (Type TABLE only + MUST have relationships)
        report_progress("Filtering schema objects...")
        tables = []
        for t in all_tables:
            if t['type'] == 'TABLE' and t['name'] in related_tables:
                t['columns'] = col_map.get(t['name'], [])
                tables.append(t)

        if not tables:
            return f"No tables with foreign key relationships were found in {schema}. ERD generation skipped."

        report_progress(f"Starting XML generation for {len(tables)} tables...")

        generator = DiagramGenerator()

        # Simple paging logic: 40 tables per page
        page_size = 40
        for i in range(0, len(tables), page_size):
            page_tables = tables[i:i + page_size]
            page_name = f"Page {i // page_size + 1}"
            report_progress(f"Generating {page_name} ({len(page_tables)} tables)...")

            # Filter relationships for these tables
            page_table_names = {t['name'] for t in page_tables}
            page_rels = [r for r in relationships if r['tableName'] in page_table_names and r['referencedTable'] in page_table_names]

            generator.add_page(page_name, page_tables, page_rels)

        report_progress("Finalizing Draw.io XML structure...")
        xml_content = generator.to_xml()

        # Save to downloads
        downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
        output_dir = os.path.join(downloads_base, session_id)

        # Clean and unique filename
        safe_name = "".join([c if c.isalnum() else "_" for c in diagram_name]).strip("_")
        safe_schema = "".join([c if c.isalnum() else "_" for c in schema]).strip("_")
        safe_database = "".join([c if c.isalnum() else "_" for c in database]).strip("_")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{safe_name}_{safe_schema}_{safe_database}_{timestamp}.drawio"
        output_path = os.path.join(output_dir, filename)

        os.makedirs(output_dir, exist_ok=True)
        with open(output_path, "w") as f:
            f.write(xml_content)

        download_link = f"/download/{session_id}/{filename}"
        report_progress(f"ERD generated successfully: {filename}")

        return f"Successfully generated ERD for {schema}. [Download Draw.io File]({download_link})"

    except Exception as e:
        logger.error(f"Error in generate_erd_file: {e}")
        return f"Error generating ERD: {str(e)}"

def create_erd_agent() -> LlmAgent:
    api_server_tools, _ = get_mcp_toolsets()

    # Create progress reporting tool
    progress_tool = FunctionTool(report_progress)
    generate_tool = FunctionTool(generate_erd_file)

    return LlmAgent(
        model="gemini-flash-latest",
        name="erd_agent",
        description="Specialized agent for generating Draw.io ERDs from database schemas",
        instruction=SYSTEM_INSTRUCTION,
        tools=[api_server_tools, progress_tool, generate_tool]
    )
