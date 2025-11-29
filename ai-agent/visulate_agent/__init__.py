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