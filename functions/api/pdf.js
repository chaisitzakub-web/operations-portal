/**
 * Cloudflare Pages Functions - PDF Attachment API
 * Handles PDF storage using Cloudflare KV Namespace
 */

// GET /api/pdf?taskId=task-123
export async function onRequestGet(context) {
    const { env, request } = context;

    if (!env.ATTACHMENTS) {
        return new Response(JSON.stringify({ error: "KV Namespace binding 'ATTACHMENTS' is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const url = new URL(request.url);
        const taskId = url.searchParams.get("taskId");

        if (!taskId) {
            return new Response("Missing taskId parameter", { status: 400 });
        }

        // Retrieve file metadata and Base64 string from KV
        const fileRecordStr = await env.ATTACHMENTS.get(taskId);
        if (!fileRecordStr) {
            return new Response("File not found", { status: 404 });
        }

        const record = JSON.parse(fileRecordStr);
        const { fileName, fileType, fileData } = record;

        if (!fileData) {
            return new Response("Corrupted file data", { status: 500 });
        }

        // Convert base64 data to bytes
        const binaryString = atob(fileData);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes, {
            headers: {
                "Content-Type": fileType || "application/pdf",
                "Content-Disposition": `inline; filename="${fileName || 'document.pdf'}"`
            }
        });
    } catch (err) {
        return new Response(`Error: ${err.message}`, { status: 500 });
    }
}

// POST /api/pdf
export async function onRequestPost(context) {
    const { env, request } = context;

    if (!env.ATTACHMENTS) {
        return new Response(JSON.stringify({ error: "KV Namespace binding 'ATTACHMENTS' is missing." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json();
        const { taskId, fileName, fileType, fileData } = body;

        if (!taskId || !fileData) {
            return new Response(JSON.stringify({ error: "Missing required fields: taskId, fileData" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Save PDF record (filename, type, and base64 string) inside Cloudflare KV Namespace
        const record = {
            fileName: fileName || 'document.pdf',
            fileType: fileType || 'application/pdf',
            fileData: fileData // Base64 string
        };

        // Cloudflare KV allows up to 25MB values, perfect for reports
        await env.ATTACHMENTS.put(taskId, JSON.stringify(record));

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
