export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { companyName, contactName, phone, email, wishes, turnstileToken } = await request.json();

    // 1. Validierung der Pflichtfelder
    if (!companyName || !contactName || !phone || !email || !turnstileToken) {
      return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Turnstile Token validieren
    const turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '0x4AAAAAADVEq5r1ZKxsxl7Fgj3saWNB2r8';
    const verifyResult = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${turnstileSecret}&response=${turnstileToken}`,
    });
    const verifyData = await verifyResult.json();

    if (!verifyData.success) {
      return new Response(JSON.stringify({ success: false, message: 'Spam-Schutz (Turnstile) fehlgeschlagen.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. E-Mail über Resend senden
    const resendApiKey = env.RESEND_API_KEY || 're_23WnEvZS_MiA7sHvE1HVkZC5TDV7TeqXi';
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Scholz & Friese Webdesign <noreply@scholz-friese-webdesign.de>',
        to: 'info@scholz-friese-webdesign.de',
        subject: `Neue Anfrage-Flow: ${companyName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background: #fff;">
            <h2 style="color: #00C9B7; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 0;">Neue Anfrage über den Webdesign Flow</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr>
                <td style="padding: 10px; font-weight: bold; width: 40%; border-bottom: 1px solid #eee;">Name des Unternehmens:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${companyName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Ansprechpartner:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${contactName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Telefonnummer:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${phone}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">E-Mail-Adresse:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><a href="mailto:${email}" style="color: #6D7FFB; text-decoration: none;">${email}</a></td>
              </tr>
            </table>
            <h3 style="color: #1a1a1a; margin-top: 30px;">Wünsche / Nachricht:</h3>
            <div style="padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; white-space: pre-wrap; font-size: 15px; line-height: 1.5; color: #334155;">
              ${wishes ? wishes : '<em>Keine zusätzlichen Wünsche angegeben.</em>'}
            </div>
            <footer style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #94a3b8; text-align: center;">
              Gesendet über Scholz & Friese Webdesign Flow & Resend
            </footer>
          </div>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const errData = await resendResponse.json();
      return new Response(JSON.stringify({ success: false, message: 'Fehler beim E-Mail-Versand über Resend.', error: errData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Anfrage erfolgreich übermittelt!' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: 'Serverfehler.', error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
