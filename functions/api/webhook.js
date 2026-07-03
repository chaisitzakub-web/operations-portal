export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    // กุญแจ Token ของคุณ
    const token = "FImi+2fAsu7TjhlYnK7ohFA7MNQAWFcH+v0WI2xPS/ZykdBVeFio6t88aWKtXzus/f+KBxvY8qjOjx9aCYYiQLdcKROB0zjoiBTr5SUSQyHsxPevurZXYi7uzXVaH5db7EBKrLPEiWU1uuI7eJh5GwdB04t89/1O/w1cDnyilFU=";

    if (body.events && body.events.length > 0) {
      const event = body.events[0];
      
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;
        
        // ใช้ includes เพื่อดักจับคำว่า "ขอไอดีกลุ่ม" แม้จะพิมพ์ @แท็กชื่อบอท มาด้วยก็ตาม
        if (text.includes('ขอไอดีกลุ่ม')) {
          let replyText = "กรุณาพิมพ์คำสั่งนี้ใน 'กลุ่มไลน์' เท่านั้นครับ";
          
          if (event.source.type === 'group') {
            replyText = `✅ รหัส Group ID คือ:\n${event.source.groupId}\n\nก๊อปปี้รหัสยาวๆ นี้ไปให้ DEV ได้เลยครับ!`;
          } else if (event.source.type === 'room') {
            replyText = `✅ รหัส Room ID คือ:\n${event.source.roomId}\n\nก๊อปปี้รหัสยาวๆ นี้ไปให้ DEV ได้เลยครับ!`;
          }
          
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              replyToken: event.replyToken,
              messages: [{ type: 'text', text: replyText }]
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
