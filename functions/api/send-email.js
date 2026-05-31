export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const data = await request.json();
    const { turnstileToken, source } = data;

    // 1. Turnstile Token ist Pflicht für alle Anfragen
    if (!turnstileToken) {
      return new Response(JSON.stringify({ success: false, message: 'Spam-Schutz fehlt.' }), {
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

    // 3. E-Mail bauen – je nach Quelle (source)
    const resendApiKey = env.RESEND_API_KEY || 're_23WnEvZS_MiA7sHvE1HVkZC5TDV7TeqXi';
    let emailSubject, emailHtml, fromName;

    if (source === 'work4palace') {
      // ───── WORK4PALACE E-MAIL ─────
      const { name, email, phone, projectType, message, formType, scopeSize, location, timeframe } = data;

      if (!name || !email) {
        return new Response(JSON.stringify({ success: false, message: 'Name und E-Mail sind Pflichtfelder.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isPlanner = formType === 'planner';
      fromName = 'work4palace Manufaktur';
      emailSubject = isPlanner
        ? `🏛️ Neue Projektkonfiguration von ${name}`
        : `✉️ Neue Kontaktanfrage von ${name}`;

      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #12110f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #12110f; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #1c1a17; border: 1px solid rgba(184, 105, 69, 0.18); overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);">
                  <tr>
                    <td style="background-color: #b86945; padding: 35px 30px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 26px; letter-spacing: 0.12em; color: #faf6ee; text-transform: uppercase; font-weight: 400;">work4palace</h1>
                      <p style="margin: 6px 0 0 0; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(250, 246, 238, 0.75); font-weight: 500;">Manufaktur für exklusive Sanierungen</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 45px 35px;">
                      <p style="font-family: Georgia, serif; font-size: 21px; color: #faf6ee; margin: 0 0 15px 0; font-style: italic;">Hallo Tina,</p>
                      <p style="color: #9f9b93; font-size: 14.5px; line-height: 1.65; margin: 0 0 30px 0; font-weight: 300;">
                        über die Website wurde eine neue ${isPlanner ? 'Projektkonfiguration' : 'Kontaktanfrage'} übermittelt:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px; border-collapse: collapse; border: 1px solid rgba(255, 255, 255, 0.05);">
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Quelle</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;"><strong>${isPlanner ? 'Projekt-Konfigurator' : 'Kontaktformular'}</strong></td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Kunde</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">E-Mail</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;"><a href="mailto:${email}" style="color: #b86945; text-decoration: none;">${email}</a></td>
                        </tr>
                        ${phone ? `<tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Telefon</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${phone}</td>
                        </tr>` : ''}
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Gewerk</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${projectType || '-'}</td>
                        </tr>
                        ${isPlanner ? `
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Projektgröße</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${scopeSize || '-'}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Ort</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${location || '-'}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #b86945; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Zeitraum</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${timeframe || '-'}</td>
                        </tr>` : ''}
                      </table>
                      ${message ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(184, 105, 69, 0.02); border-left: 2px solid #b86945;">
                        <tr>
                          <td style="padding: 22px 25px;">
                            <p style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #b86945; margin: 0 0 12px 0; font-weight: 600;">Beschreibung</p>
                            <p style="font-style: italic; color: #faf6ee; font-size: 14px; line-height: 1.7; margin: 0; font-weight: 300;">"${message.replace(/\n/g, '<br>')}"</p>
                          </td>
                        </tr>
                      </table>` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #12110f; padding: 30px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.04); font-size: 11px; color: #5a5750; line-height: 1.6;">
                      Anfrage über <a href="https://work4palace.de" style="color: #b86945; text-decoration: none;">work4palace.de</a><br>
                      Technischer Partner: <strong>Scholz & Friese Webdesign</strong>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

    } else {
      // ───── STANDARD SF WEBDESIGN E-MAIL (Original) ─────
      const { companyName, contactName, phone, email, wishes } = data;

      if (!companyName || !contactName || !phone || !email) {
        return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Scholz & Friese Webdesign';
      emailSubject = `Neue Anfrage-Flow: ${companyName}`;
      emailHtml = `
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
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.02);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #3EC8C0 0%, #6D7FFB 100%); padding: 35px 40px; text-align: left;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Scholz & Friese</h1>
                      <p style="margin: 5px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">Webdesign & Digitale Exzellenz</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 40px 30px 40px;">
                      <h2 style="margin: 0 0 15px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Neue Anfrage über den Webdesign Flow</h2>
                      <p style="margin: 0 0 25px 0; color: #475569; font-size: 15px; line-height: 1.6;">Hallo Team, über den interaktiven Anfrage-Flow auf eurer Website ist eine neue Anfrage eingegangen. Hier sind die erfassten Details:</p>
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
                      <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Wünsche, Ergänzungen & Details:</h3>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-left: 4px solid #6D7FFB; border-radius: 4px;">
                        <tr>
                          <td style="padding: 20px; color: #334155; font-size: 14px; line-height: 1.6; font-style: ${wishes ? 'normal' : 'italic'}; white-space: pre-wrap;">${wishes ? wishes : 'Keine zusätzlichen Wünsche oder Details angegeben.'}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
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
      `;
    }

    // 4. E-Mail über Resend senden
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <noreply@scholz-friese-webdesign.de>`,
        to: 'info@scholz-friese-webdesign.de',
        reply_to: data.email,
        subject: emailSubject,
        html: emailHtml,
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
