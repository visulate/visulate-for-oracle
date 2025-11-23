"""
Visulate Oracle Database Agent

An intelligent AI agent powered by Google ADK that provides natural language
access to Oracle database operations through secure MCP endpoints.

This package provides:
- Intelligent database object search and analysis
- Secure SQL execution with credential token management
- Natural language interface to Oracle databases
- A2A-compatible agent service

Usage:
    # Direct import
    from visulate_ai_agent.agent import create_oracle_agent

    # Or use the package-level import
    from visulate_ai_agent import agent

    # Start the agent service
    python -m visulate_ai_agent.agent
"""

from . import agent

# __version__ = "2.1.0"
# __author__ = "Visulate LLC"
# __description__ = "Intelligent Oracle database agent using Google ADK and MCP"

# # Export main components for easy access
# __all__ = [
#     "agent",
#     "create_oracle_agent",
#     "main"
# ]

# # Make key functions available at package level
# create_oracle_agent = agent.create_oracle_agent
# main = agent.main