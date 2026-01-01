
import contextvars

# Context variable to store session ID (request-scoped)
session_id_var = contextvars.ContextVar("session_id", default="default")

# Context variable to store progress updates (request-scoped)
progress_callback_var = contextvars.ContextVar("progress_callback", default=None)

# Context variable to store the authentication token (request-scoped)
auth_token_var = contextvars.ContextVar("auth_token", default=None)

# Context variable to signal task cancellation (request-scoped)
cancelled_var = contextvars.ContextVar("cancelled", default=False)

# Context variable to store raw DB credentials (JSON string or dict)
db_credentials_var = contextvars.ContextVar("db_credentials", default=None)

# Context variable to store UI context (database, schema, object)
ui_context_var = contextvars.ContextVar("ui_context", default={})

# Shared registry for cancelled session IDs (to signal across threads/tasks)
cancelled_sessions = set()
