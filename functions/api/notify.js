export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    
    // ยิงคำสั่ง Broadcast (ส่งตรงเข้าแชทส่วนตัวของทุกคนที่เป็นเพื่อนกับบอท)
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.token}`
      },
      body: JSON.stringify(body.payload)
    });
    
    const result = await lineResponse.json();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
