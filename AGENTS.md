<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

- Use pnpm / pnpx as opposed to npm or yarn
- Whenever creating frontend components, layouts, or pages, always seek to leverage existing shadcn/ui components (`components/ui`) as opposed to creating UI from scratch
- If you need to use python for any reason, the command is `python3`
- Just because a reviewer subagent makes a recommendation does not mean you need to act upon it if it would result in scope creep, premature optimization, or over-engineering
- Never run prettier. Leave this task to the user.
