export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    // กุญแจ Token ของคุณ
    const token = "FImi+2fAsu7TjhlYnK7ohFA7MNQAWFcH+v0WI2xPS/ZykdBVeFio6t88aWKtXzus/f+KBxvY8qjOjx9aCYYiQLdcKROB0zjoiBTr5SUSQyHsxPevurZXYi7uzXVaH5db7EBKrLPEiWU1uuI7eJh5GwdB04t89/1O/w1cDnyilFU=";

    if (body.events && body.events.length > 0) {
      const event = body.events[0];
      
      // เมื่อมีคนพิมพ์ในกลุ่มว่า "ขอไอดีกลุ่ม"
      if (event.type === 'message' && event.source.type === 'group') {
        if (event.message.text === 'ขอไอดีกลุ่ม') {
          const groupId = event.source.groupId; // ดึงรหัสกลุ่มออกมา
          
          // สั่งให้บอทตอบรหัสกลุ่มกลับไปในแชท
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: `✅ รหัส Group ID คือ:\n${groupId}\n\nก๊อปปี้รหัสนี้ไปให้ DEV ได้เลยครับ!` }]
            })
          });
        }
      }
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}
