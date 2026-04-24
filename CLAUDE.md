# Git workflow (AUTO)

After every file modification:
1. Check if there are changes:
   git diff --quiet && exit 0

2. Add all:
   git add -A

3. Commit:
   git commit -m "Claude: auto changes"

4. Push:
   git push origin HEAD

Rules:
- Do NOT push if nothing changed
- Do NOT ask for confirmation