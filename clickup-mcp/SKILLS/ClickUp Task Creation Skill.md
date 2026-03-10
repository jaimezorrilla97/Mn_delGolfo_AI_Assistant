# ClickUp Task Creation Skill

Purpose:
Create ClickUp tasks correctly with mandatory assignee and due date handling.

Rules:
1. Never create a ClickUp task unless both an assignee and a due date are available.
2. If the user does not provide an assignee, ask:
   "Who should this task be assigned to?"
3. If the user does not provide a due date, ask:
   "What is the due date for this task?"
4. If the user provides a due time, convert it and send `due_date_time: true`.
5. Never treat a person's name as a valid assignee value by itself.
6. Before creating the task, resolve the assignee name to a real ClickUp user ID using available ClickUp member endpoints.
7. Send the task using the ClickUp Create Task endpoint with:
   - `name`
   - `description`
   - `assignees: [user_id]`
   - `due_date` as Unix milliseconds
   - `due_date_time: true` when time is included
8. If assignee resolution fails, do not create the task. Ask the user to clarify which ClickUp member to use.
9. After creation, confirm:
   - task title
   - assignee name
   - exact due date and time
   - destination list
10. If the API response comes back without the expected assignee or time, report that the creation partially failed and explain which field was not saved.
When creating ClickUp tasks:
11. Always include an assignee.
12. If the user says "assign to me", use the authorized user ID.
13. If the user names someone (ex: Jaime), resolve their ClickUp member ID before creating the task.
14. Always send due_date_time = true if the user mentions a time.
15. Send due_date as a Unix timestamp in milliseconds.
16. Never place the assignee name in the description instead of using the assignees field.

Expected behavior example:
User: "Create a new task for the ecommerce team to review the Google Analytics of the website for all of February. Due tomorrow at 12pm and assign it to Jaime."

Assistant workflow:
- Resolve "Jaime" to ClickUp member ID
- Convert "tomorrow at 12pm" to Unix ms
- Send task with `assignees` and `due_date_time: true`
- Confirm the created task including assignment and exact due time

When creating ClickUp tasks:
- Assignee and due date are required.
- Do not create the task if either one is missing.
- Resolve assignee names to ClickUp user IDs before calling the API.
- Use `assignees` for user assignment.
- Use `due_date` in Unix milliseconds.
- Set `due_date_time=true` whenever the user mentions a specific time.
- Do not claim ClickUp cannot assign users unless the API actually rejects a valid assignee ID payload.
- If assignment fails, surface the raw reason and ask for a corrected user.

When the user mentions a specific time, always send dueDateTime: true.
When the user mentions an assignee, always send assigneeName.
Never place the assignee only in the description.

When the user gives a due time such as "tomorrow at 3pm", interpret it in the user's local timezone, not UTC.

Do not assume UTC unless the user explicitly says UTC.

Always convert the user's local due date/time into Unix milliseconds before calling create_clickup_task.
