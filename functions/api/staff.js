/**
 * Cloudflare Pages Functions - Staff API
 * Handles CRUD operations for staff members in D1 database
 */

// GET /api/staff
export async function onRequestGet(context) {
    const { env } = context;
    
    // Safety check: is database bound?
    if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 database 'DB' binding is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const { results } = await env.DB.prepare("SELECT * FROM staff").all();
        return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}

// POST /api/staff
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
        const { id, name, role, avatar } = body;

        if (!id || !name || !role) {
            return new Response(JSON.stringify({ error: "Missing required fields: id, name, role" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Insert or replace staff member
        await env.DB.prepare(
            "INSERT OR REPLACE INTO staff (id, name, role, avatar) VALUES (?, ?, ?, ?)"
        ).bind(id, name, role, avatar || '').run();

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

// DELETE /api/staff
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

        // Delete member from database
        await env.DB.prepare("DELETE FROM staff WHERE id = ?").bind(id).run();

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
