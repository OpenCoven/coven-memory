# Shared privacy-pattern contract for local guards and CI PR-diff scanning.
PATTERNS='agent:[a-z0-9_-]+:(telegram|imessage|discord|whatsapp|signal|webchat):|telegram:direct:[0-9]|(/Users/|/home/)[A-Za-z0-9._-]+|~/\.(openclaw|coven)/(agents|workspaces|credentials|sessions)|\+1[0-9]{10}'
PLACEHOLDERS='(/Users/|/home/)(<[a-z-]+>|\$USER|USERNAME|example|placeholder|you)([^[:alnum:]_]|$)'
ALLOW_MARKERS='guard-scan-allow|gitleaks:allow'
GITLEAKS_RULE_IDS='coven-session-key coven-chat-id absolute-home-path openclaw-internal-path phone-number invite-or-handoff-url'
