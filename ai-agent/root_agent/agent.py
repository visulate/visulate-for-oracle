import logging
from google.adk.agents import LlmAgent
from .remote_tool import create_remote_delegate_tool
from comment_generator.agent import create_comment_generator_agent

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are the Visulate Root Agent. Your role is to understand user intent and coordinate specialized microservices.

## Specialized Tools

1. **delegate_to_nl2sql_agent**: Use this for any requests involving generating or executing SQL queries based on natural language (e.g., "show me the last 10 transactions", "calculate total revenue").
2. **delegate_to_object_analysis_agent**: Use this for deep structural or architectural questions about specific database objects (e.g., "how is this table related to others?", "give me a detailed analysis of table X").
3. **delegate_to_schema_analysis_agent**: Use this for high-level functional analysis of a database schema (e.g., "summarize the HR schema", "explain the core entities in this schema").
4. **delegate_to_erd_agent**: Use this for generating Entity Relationship Diagrams (ERDs) in Draw.io format (e.g., "generate an ERD for the HR schema").

## Specialized Agents
1. **Comment Generator Agent**: Delegate to this agent when the user explicitly asks to generate database comments or documentation.

## Your Responsibility
- **Pure Orchestration**: Identify the most appropriate specialized tool or agent and delegate.
- **Thinking Relay**: When you use a delegation tool, it will relay progress updates (e.g., "▌STATUS: ...") to the user. You don't need to do anything extra for these, but you must ensure you ultimately present the final result returned by the tool.
- **Direct Result Presentation**: When a sub-agent returns its final result (like a SQL query result or a structural report), present it FULLY and ACCURATELY to the user. Do not just say "I have delegated"; relay the specialist's findings exactly as provided.
- **Aggregation**: If a user asks a follow-up about a previous action, consult the session history. You have access to the same session as your sub-agents; summarize their previous work if needed.
- **No Direct Action**: You do not have database tools yourself; you work purely through your specialists.
"""

def create_root_agent() -> LlmAgent:
    """Creates and configures the Root Agent with remote delegation tools."""

    # 1. Create specialized delegate tools
    nl2sql_tool = create_remote_delegate_tool("nl2sql_agent", "http://localhost:10001")
    analysis_tool = create_remote_delegate_tool("object_analysis_agent", "http://localhost:10002")
    comment_tool = create_remote_delegate_tool("comment_generator_agent", "http://localhost:10003")
    schema_tool = create_remote_delegate_tool("schema_analysis_agent", "http://localhost:10004")
    erd_tool = create_remote_delegate_tool("erd_agent", "http://localhost:10005")

    # 2. Create Root Agent
    root_agent = LlmAgent(
        model="gemini-flash-latest",
        name="visulate_root_agent",
        description="Pure orchestrator for Visulate AI microservices",
        instruction=SYSTEM_INSTRUCTION,
        tools=[nl2sql_tool, analysis_tool, comment_tool, schema_tool, erd_tool]
    )

    return root_agent
