# Security policy

This private internal system contains employee, request, operational, and integration data. Report vulnerabilities directly to the Sankari Holding IT administrator; do not open a public issue or include personal data, passwords, OAuth secrets, SMTP credentials, Jira tokens, ClickUp tokens, or database dumps.

Production operators must use HTTPS, keep Google OAuth set to Workspace Internal, store secrets only in EasyPanel, limit Jira and ClickUp service accounts to the minimum required access, copy backups to protected off-server storage, test restores, monitor '/api/health', and apply dependency and base-image updates after validation.

Raw migration files, database dumps, environment files, local databases, and generated reports are ignored by Git. If any secret is committed or exposed, rotate it immediately and remove it from Git history.
