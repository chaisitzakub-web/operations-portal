/**
 * Cloudflare Pages Functions - Tasks API
 * Handles CRUD operations for tasks and task history log in D1 database
 */

// GET /api/tasks
export async function onRequestGet(context) {
    const { env } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 database 'DB' binding is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // Fetch all tasks and history
        const { results: tasks } = await env.DB.prepare("SELECT * FROM tasks").all();
        const { results: history } = await env.DB.prepare("SELECT * FROM task_history ORDER BY time ASC").all();

        // Map and structure tasks with history
        const tasksWithHistory = tasks.map(task => {
            task.hasAttachment = !!task.hasAttachment; // Convert 1/0 to true/false
            task.history = history
                .filter(h => h.taskId === task.id)
                .map(h => ({
                    time: h.time,
                    action: h.action,
                    user: h.user
                }));
            return task;
        });

        return new Response(JSON.stringify(tasksWithHistory), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

// POST /api/tasks
export async function onRequestPost(context) {
    const { env, request } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 database 'DB' binding is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json();
        const {
            id, name, description, assigneeId, urgency, secrecy,
            startDate, deadline, status, hasAttachment, attachmentName, history
        } = body;

        if (!id || !name || !assigneeId || !status) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const hasAttrInt = hasAttachment ? 1 : 0;

        // Check if task exists (UPSERT style)
        const existing = await env.DB.prepare("SELECT id FROM tasks WHERE id = ?").bind(id).first();

        if (existing) {
            // Update task
            await env.DB.prepare(
                "UPDATE tasks SET name = ?, description = ?, assigneeId = ?, urgency = ?, secrecy = ?, startDate = ?, deadline = ?, status = ?, hasAttachment = ?, attachmentName = ? WHERE id = ?"
            ).bind(
                name, description || '', assigneeId, urgency || 'ด่วน', secrecy || 'ปกติ',
                startDate, deadline, status, hasAttrInt, attachmentName || null, id
            ).run();
        } else {
            // Insert task
            await env.DB.prepare(
                "INSERT INTO tasks (id, name, description, assigneeId, urgency, secrecy, startDate, deadline, status, hasAttachment, attachmentName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(
                id, name, description || '', assigneeId, urgency || 'ด่วน', secrecy || 'ปกติ',
                startDate, deadline, status, hasAttrInt, attachmentName || null
            ).run();
        }

        // Sync history logs (delete old and insert new list to keep simple state)
        await env.DB.prepare("DELETE FROM task_history WHERE taskId = ?").bind(id).run();
        if (history && history.length > 0) {
            for (const log of history) {
                await env.DB.prepare(
                    "INSERT INTO task_history (taskId, time, action, user) VALUES (?, ?, ?, ?)"
                ).bind(id, log.time, log.action, log.user).run();
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

// DELETE /api/tasks
export async function onRequestDelete(context) {
    const { env, request } = context;

    if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 database 'DB' binding is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(JSON.stringify({ error: "Missing ID parameter" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Delete task (cascades history logs)
        await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();

        // Try deleting PDF from KV namespace if binding is set
        if (env.ATTACHMENTS) {
            try {
                await env.ATTACHMENTS.delete(id);
            } catch (kvErr) {
                console.error("Failed to delete PDF from KV:", kvErr);
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
