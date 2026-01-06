* TOC
{:toc id="toc"}

# Agentic AI How-to Guide

Visulate for Oracle integrates **Google Gemini AI** to provide autonomous agents that assist with database analysis, query generation, and documentation.

## Chatbot Interface
The primary way to interact with Visulate's AI is through the chat window.

1. **Select a Database and Schema**: The AI needs context to provide accurate answers.
2. **Open Chat**: Click the chat icon or look for the chat panel on the right.
3. **Ask Questions**: You can ask plain English questions like:
    - *"Show me all tables related to 'EMPLOYEES'."*
    - *"Explain the business logic in the 'SALARY_CALC' package."*
    - *"Are there any circular dependencies in this schema?"*

## Natural Language to SQL (NL2SQL)
Visulate can translate your natural language requests into executable SQL based on your schema.

1. **Request SQL**: In the chat, ask for data. Example: *"List the top 5 customers by total order volume in 2023."*
2. **Review & Execute**: The AI will generate the SQL. Review the code for correctness.
3. **Apply Filters**: Use the "Run it" button or copy the SQL into the Query Editor to download the results as CSV.

## Automated ERD Generation
Visualize your schema relationships on demand.

1. **Request a Diagram**: Ask the AI to visualize a set of tables. Example: *"Generate an ERD for the order processing tables."*
2. **Specialized Agent**: The Root Agent will delegate this to the **ERD Agent**, which analyzes foreign keys and uses Mermaid to render a diagram.
3. **Refine**: You can ask to add or remove tables from the diagram: *"Add the 'PAYMENTS' table to this diagram."*

## Schema & Object Analysis
Get high-level summaries or deep-dives into database objects.

- **Schema Summary**: Ask *"Analyze the 'HR' schema"* to get a report on object counts, storage usage, and overall complexity.
- **Problem Detection**: Ask *"Identify any tables missing primary keys"* or *"Find invalid objects in my schema."*
- **Object Deep Dive**: Navigate to a specific object (e.g., a Package) and ask the AI to *"Summarize what this package does"* or *"Find potential performance issues in this code."*

## AI-Powered Code Comments
Document your legacy PL/SQL code in bulk.

1. **Request Documentation**: Ask the AI to *"Generate documentation for all tables in the 'FINANCE' schema missing comments."*
2. **Background Processing**: The Root Agent uses the **Comment Generator Agent** to query the data dictionary and prepare a set of `COMMENT ON` statements.
3. **Review & Download**: The results are presented as a downloadable CSV or a list of SQL commands you can execute in your preferred tool.

## Session Context
Visulate maintains conversational context. You can refer to previous answers:
- *"Now show me the DDL for the first table you mentioned."*
- *"Run that same query but filter for 'active' status only."*

> [!TIP]
> Always ensure your `GOOGLE_AI_KEY` is correctly configured in your [Quickstart](/pages/quickstart.html#enable-google-gemini-ai) setup to enable these features.
