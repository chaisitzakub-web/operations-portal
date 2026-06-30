export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB; // เชื่อมต่อฐานข้อมูล D1 ของคุณ

    // คำสั่งสร้างตารางแชทอัตโนมัติ (ถ้ายังไม่มี)
    await db.prepare(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            senderId TEXT,
            senderName TEXT,
            text TEXT,
            time TEXT
        )
    `).run();

    // ดึงข้อความแชท (GET)
    if (request.method === 'GET') {
        const { results } = await db.prepare(`SELECT * FROM chat_messages ORDER BY time ASC LIMIT 100`).all();
        return new Response(JSON.stringify(results || []), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // ส่งข้อความแชทใหม่ (POST)
    if (request.method === 'POST') {
        const msg = await request.json();
        await db.prepare(`
            INSERT INTO chat_messages (id, senderId, senderName, text, time)
            VALUES (?, ?, ?, ?, ?)
        `).bind(msg.id, msg.senderId, msg.senderName, msg.text, msg.time).run();
        return new Response(JSON.stringify({ success: true }));
    }

    return new Response('Method not allowed', { status: 405 });
}
