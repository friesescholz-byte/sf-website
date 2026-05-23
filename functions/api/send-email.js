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
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Neue Anfrage - Scholz & Friese Webdesign</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <!-- MAIN CARD -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.02);">
                    
                    <!-- HEADER GRADIENT -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #3EC8C0 0%, #6D7FFB 100%); padding: 35px 40px; text-align: left;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Scholz & Friese</h1>
                        <p style="margin: 5px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">Webdesign & Digitale Exzellenz</p>
                      </td>
                    </tr>

                    <!-- CONTENT BLOCK -->
                    <tr>
                      <td style="padding: 40px 40px 30px 40px;">
                        <h2 style="margin: 0 0 15px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Neue Anfrage über den Webdesign Flow</h2>
                        <p style="margin: 0 0 25px 0; color: #475569; font-size: 15px; line-height: 1.6;">Hallo Team, über den interaktiven Anfrage-Flow auf eurer Website ist eine neue Anfrage eingegangen. Hier sind die erfassten Details:</p>
                        
                        <!-- DETAILS TABLE -->
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; font-weight: 600; width: 40%;">Unternehmen:</td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 15px; font-weight: 600;">${companyName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; font-weight: 600;">Ansprechpartner:</td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 15px;">${contactName}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; font-weight: 600;">Telefonnummer:</td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 15px;">
                              <a href="tel:${phone}" style="color: #6D7FFB; text-decoration: none; font-weight: 500;">${phone}</a>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 14px; font-weight: 600;">E-Mail-Adresse:</td>
                            <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-size: 15px;">
                              <a href="mailto:${email}" style="color: #6D7FFB; text-decoration: none; font-weight: 500;">${email}</a>
                            </td>
                          </tr>
                        </table>

                        <!-- WISHES SECTION -->
                        <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Wünsche, Ergänzungen & Details:</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-left: 4px solid #6D7FFB; border-radius: 4px;">
                          <tr>
                            <td style="padding: 20px; color: #334155; font-size: 14px; line-height: 1.6; font-style: ${wishes ? 'normal' : 'italic'}; white-space: pre-wrap;">${wishes ? wishes : 'Keine zusätzlichen Wünsche oder Details angegeben.'}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- FOOTER INSIDE CARD -->
                    <tr>
                      <td style="padding: 0 40px 40px 40px;">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e2e8f0; padding-top: 25px;">
                          <tr>
                            <td style="color: #94a3b8; font-size: 12px; line-height: 1.5; text-align: center;">
                              Diese Anfrage wurde automatisch über den Webdesign Anfrage-Flow der Website <a href="https://scholz-friese-webdesign.de" style="color: #6D7FFB; text-decoration: none;">scholz-friese-webdesign.de</a> gesendet.<br>
                              Empfänger: info@scholz-friese-webdesign.de | Absender: noreply@scholz-friese-webdesign.de
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
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
