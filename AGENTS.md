# Git workflow (AUTO)

After every file modification:
1. Check if there are changes:
   git diff --quiet && exit 0

2. Add all:
   git add -A

3. Commit:
   git commit -m "Codex: auto changes" (añade breve descripción del commit)

4. Push:
   git push origin HEAD

Rules:
- Do NOT push if nothing changed
- Do NOT ask for confirmation

<claude-mem-context>
# Memory Context

# [smart-area] recent context, 2026-05-06 9:40pm GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 20 obs (8647t read) | 1.241.669t work | 99% savings

### May 2, 2026
1 10:25p 🔵 smart-area-card: Project Structure and Toolchain
2 " 🔵 smart-area-card: Source File Map and Responsibilities
3 " 🔵 smart-area-card: Main Card Execution Flow
4 " 🔵 smart-area-card: Device Model and State Computation
5 " 🔵 smart-area-card: SmartRoomCardConfig — Full Type System
6 " 🔵 smart-area-card: Visual Editor Architecture
7 " 🔵 smart-area-card: Fragile Zones and Technical Debt
8 " 🟣 Sensors Section UI: Show Toggle + Open Details Checkbox
9 11:24p 🟣 New `header_sensors_enabled` Config Flag with Sensors Panel in Editor
10 " 🔄 Sensor Click Target Merged Into Sensor Strip Element
11 " 🔵 Pre-existing Failing Test: evaluateClimateAlert Room Name
12 11:40p 🔄 Sensor "Primary" tip moved inside sensor card header row
13 11:41p 🟣 Primary sensor tip relocated inside sensor card header — deployed to main
14 11:43p 🔵 Persistent patch-not-sticking issue: same primaryTip change attempted 3+ times
15 11:44p ✅ CTA animations slowed from ~1.5s to 3.2s in editor preview
17 11:45p 🔴 evaluateClimateAlert reason now includes sensor value and unit via formatSensorAlertReason helper
18 11:47p ⚖️ CSS gradient shadow constraint: extend only to 50% of sensors section
16 11:48p 🔵 evaluateClimateAlert signature accepts roomName but doesn't use it in reason string
### May 3, 2026
19 12:12a 🔵 Header shadow gradient architecture: two-layer system in config-helpers.ts and styles.ts
20 " 🔴 Shorten header shadow gradient to stop at ~118px instead of 240px

Access 1242k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>