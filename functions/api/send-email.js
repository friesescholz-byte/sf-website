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
    let turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (source === 'work4palace') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_WORK4PALACE;
    } else if (source === 'Stephan-van-Hausen') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_STEPHAN_VAN_HAUSEN;
    } else if (source === 'weymann-gebaeudetechnik') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_WEYMANN_GEBAEUDETECHNIK;
    } else if (source === 'elementbau-nienburg') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_ELEMENTBAU_NIENBURG;
    } else if (source === 'bestattungen-eberhardt') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_BESTATTUNGEN_EBERHARDT;
    } else if (source === 'fm-freie-rednerin') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_FM_FREIE_REDNERIN;
    } else if (source === 'immom') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_IMMOM;
    } else if (source === 'Rodes-Hotel') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_RODES_HOTEL;
    } else if (source === 'Bickbeernhof-Brokeloh') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_BICKBEERNHOF;
    } else if (source === 'homan-madical' || source === 'homann-medical') {
      turnstileSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY_HOMAN_MADICAL || env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    }
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
    const resendApiKey = env.RESEND_API_KEY;
    let emailSubject, emailHtml, fromName;
    let recipientEmail = 'support@scholz-friese-chatbot.de';
    let isKvRecipient = false;

    // Fetch dynamic email config from Cloudflare KV
    try {
      const apiToken = env.CLOUDFLARE_API_TOKEN;
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const namespaceId = '8d2fe320c4134c368f28c18153d4f82d'; // KUNDEN_DB
      const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/email_config`;
      const kvResponse = await fetch(kvUrl, {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      });
      if (kvResponse.status === 200) {
        const emailConfig = await kvResponse.json();
        if (emailConfig && emailConfig[source] && emailConfig[source].email) {
          recipientEmail = emailConfig[source].email;
          isKvRecipient = true;
        }
      }
    } catch (e) {
      // ignore, fallback to hardcoded
    }

    if (source === 'Stephan-van-Hausen') {
      if (!isKvRecipient) recipientEmail = 'info@nienburger-nachtwaechter.de';
      // ───── STEPHAN VAN HAUSEN E-MAIL ─────
      const { name, email, phone, date, time, tourType, groupSize, gewandZuschlag, cost, message, isPublic } = data;

      if (!name || !email || !date) {
        return new Response(JSON.stringify({ success: false, message: 'Name, E-Mail und Wunschtermin sind Pflichtfelder.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Helper to generate a verification signature
      async function generateSignature(secret, dataStr) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const dataData = encoder.encode(dataStr);
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataData);
        return Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }

      const secretKey = resendApiKey || 'stephan-secret';
      const tokenDataAccept = `accept|${email}|${date}|${time || ''}|${cost}`;
      const tokenDataReject = `reject|${email}|${date}|${time || ''}|${cost}`;
      
      const sigAccept = await generateSignature(secretKey, tokenDataAccept);
      const sigReject = await generateSignature(secretKey, tokenDataReject);
      
      const baseActionUrl = 'https://friesescholzwebdesign.pages.dev/api/respond-booking';
      const acceptLink = `${baseActionUrl}?action=accept&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time || '')}&tourType=${encodeURIComponent(tourType)}&cost=${cost}&sig=${sigAccept}`;
      const rejectLink = `${baseActionUrl}?action=reject&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time || '')}&tourType=${encodeURIComponent(tourType)}&cost=${cost}&sig=${sigReject}`;

      if (isPublic) {
        // --- 1. Admin Email HTML ---
        const adminEmailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #07090d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #07090d; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #131722; border: 1px solid rgba(217, 162, 74, 0.15); overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);">
                    <tr>
                      <td style="background-color: #0d111a; padding: 35px 30px; text-align: center; border-bottom: 2px solid #d9a24a;">
                        <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; letter-spacing: 0.08em; color: #faf6ee; text-transform: uppercase; font-weight: 400;">Stephan van Hausen</h1>
                        <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #d9a24a; font-weight: 500;">Nachtwächter-Führungen Nienburg</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 45px 35px;">
                        <p style="font-family: Georgia, serif; font-size: 20px; color: #faf6ee; margin: 0 0 15px 0; font-style: italic;">Hallo Stephan,</p>
                        <p style="color: #94a3b8; font-size: 14.5px; line-height: 1.65; margin: 0 0 30px 0; font-weight: 300;">
                          eine neue Anmeldung zur **öffentlichen Führung** wurde übermittelt:
                        </p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px; border-collapse: collapse; border: 1px solid rgba(255, 255, 255, 0.05);">
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Kunde</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">E-Mail</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;"><a href="mailto:${email}" style="color: #d9a24a; text-decoration: none;">${email}</a></td>
                          </tr>
                          ${phone ? `<tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Telefon</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${phone}</td>
                          </tr>` : ''}
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Wunschtermin</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${date}</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Uhrzeit</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">18:00 Uhr</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Treffpunkt</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">Lange Straße, Höhe Cup&amp;Cino</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Führungstyp</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${tourType}</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Teilnehmer</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${groupSize} Personen</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Zahlungsart</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">Barzahlung vor Ort (10,- € p.P.)</td>
                          </tr>
                          <tr>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Preis gesamt vor Ort</td>
                            <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: bold; font-size: 16px;">${cost},00 €</td>
                          </tr>
                        </table>
                        ${message ? `
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(217, 162, 74, 0.02); border-left: 2px solid #d9a24a; margin-bottom: 30px;">
                          <tr>
                            <td style="padding: 22px 25px;">
                              <p style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #d9a24a; margin: 0 0 12px 0; font-weight: 600;">Nachricht / Sonderwünsche</p>
                              <p style="font-style: italic; color: #faf6ee; font-size: 14px; line-height: 1.7; margin: 0; font-weight: 300;">"${message.replace(/\n/g, '<br>')}"</p>
                            </td>
                          </tr>
                        </table>` : ''}

                        <!-- Action Buttons -->
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 30px;">
                          <tr>
                            <td align="center">
                              <p style="color: #94a3b8; font-size: 13px; margin: 0 0 16px 0; text-align: center; font-weight: 300;">Anmeldung direkt bearbeiten:</p>
                              <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                                <tr>
                                  <td style="border-radius: 4px; background-color: #10b981;" align="center">
                                    <a href="${acceptLink}" target="_blank" style="padding: 12px 24px; border: 1px solid #10b981; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #ffffff; text-decoration: none; font-weight: bold; display: inline-block;">🏛️ ANNEHMEN (Zusagen)</a>
                                  </td>
                                  <td width="20"></td>
                                  <td style="border-radius: 4px; background-color: #ef4444;" align="center">
                                    <a href="${rejectLink}" target="_blank" style="padding: 12px 24px; border: 1px solid #ef4444; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #ffffff; text-decoration: none; font-weight: bold; display: inline-block;">❌ ABLEHNEN (Absagen)</a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #0d111a; padding: 30px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.04); font-size: 11px; color: #94a3b8; line-height: 1.6;">
                        Anfrage über <a href="https://nienburger-nachtwaechter.de" style="color: #d9a24a; text-decoration: none;">nienburger-nachtwaechter.de</a><br>
                        Technischer Partner: <strong>Scholz &amp; Friese Webdesign</strong>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        // --- 2. Customer Email HTML ---
        const customerPendingEmailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #07090d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #faf6ee;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #07090d; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #131722; border: 1px solid rgba(217, 162, 74, 0.15); border-radius: 8px; overflow: hidden; box-shadow: 0 25px 60px rgba(0,0,0,0.5);">
                    <tr>
                      <td style="background-color: #0d111a; padding: 35px 30px; text-align: center; border-bottom: 2px solid #d9a24a;">
                        <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; color: #faf6ee; font-weight: 400; text-transform: uppercase; letter-spacing: 0.05em;">Stephan van Hausen</h1>
                        <p style="margin: 6px 0 0 0; font-size: 11px; color: #d9a24a; text-transform: uppercase; font-weight: 500; letter-spacing: 0.15em;">Nachtwächter-Führungen Nienburg</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="font-family: Georgia, serif; font-size: 18px; color: #faf6ee; margin-bottom: 20px; font-style: italic;">Hallo ${name},</p>
                        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
                          vielen Dank für Ihre Anmeldung zur öffentlichen Nachtwächter-Führung am ${date}!
                        </p>
                        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
                          Da die Teilnehmerzahl für unsere öffentlichen Führungen begrenzt ist, wird Ihre Anmeldung derzeit von mir geprüft. Sie erhalten in Kürze eine weitere E-Mail mit der verbindlichen Bestätigung oder Rückmeldung.
                        </p>
                        
                        <h3 style="color: #d9a24a; font-size: 13px; text-transform: uppercase; margin-bottom: 15px; font-weight: 600; letter-spacing: 0.05em;">Details Ihrer Anfrage:</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse; border: 1px solid rgba(255, 255, 255, 0.05);">
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; width: 40%; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Termin</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${date}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Uhrzeit</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">18:00 Uhr</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Treffpunkt</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">Lange Straße (Höhe Cup&amp;Cino)</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Teilnehmer</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${groupSize} Personen</td>
                          </tr>
                        </table>
                        
                        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Herzliche Grüße,<br>Stephan van Hausen</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #0d111a; padding: 25px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.04); font-size: 11px; color: #94a3b8; line-height: 1.5;">
                        Kontakt: Stephan Hilker (Stephan van Hausen als Nienburger Nachtwächter) <br>
                        Im Osterfeld 44, 31632 Husum | Mobil: 0160 / 94813232 | Mail: Info@nienburger-nachtwaechter.de
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;

        // Send Admin Email
        const res1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `Stephan van Hausen Anfragen <noreply@scholz-friese-webdesign.de>`,
            to: recipientEmail,
            reply_to: email,
            subject: `[Stephan-van-Hausen] 🎫 Neue Anmeldung öffentliche Führung: ${name}`,
            html: adminEmailHtml
          }),
        });

        // Send Customer Pending Email
        const res2 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `Stephan van Hausen <noreply@scholz-friese-webdesign.de>`,
            to: email,
            reply_to: 'Info@nienburger-nachtwaechter.de',
            subject: `Eingangsbestätigung: Anmeldung zur öffentlichen Nachtwächter-Führung am ${date}`,
            html: customerPendingEmailHtml
          }),
        });

        if (!res1.ok || !res2.ok) {
          return new Response(JSON.stringify({ success: false, message: 'Fehler beim E-Mail-Versand.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!name || !email || !date) {
        return new Response(JSON.stringify({ success: false, message: 'Name, E-Mail und Wunschtermin sind Pflichtfelder.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Stephan van Hausen Anfragen';
      emailSubject = `[Stephan-van-Hausen] 🏛️ Neue Buchungsanfrage von ${name}`;

      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #07090d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #07090d; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #131722; border: 1px solid rgba(217, 162, 74, 0.15); overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);">
                  <tr>
                    <td style="background-color: #0d111a; padding: 35px 30px; text-align: center; border-bottom: 2px solid #d9a24a;">
                      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; letter-spacing: 0.08em; color: #faf6ee; text-transform: uppercase; font-weight: 400;">Stephan van Hausen</h1>
                      <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #d9a24a; font-weight: 500;">Nachtwächter-Führungen Nienburg</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 45px 35px;">
                      <p style="font-family: Georgia, serif; font-size: 20px; color: #faf6ee; margin: 0 0 15px 0; font-style: italic;">Hallo Team,</p>
                      <p style="color: #94a3b8; font-size: 14.5px; line-height: 1.65; margin: 0 0 30px 0; font-weight: 300;">
                        über die Website wurde eine neue Buchungsanfrage übermittelt:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px; border-collapse: collapse; border: 1px solid rgba(255, 255, 255, 0.05);">
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Kunde</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">E-Mail</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;"><a href="mailto:${email}" style="color: #d9a24a; text-decoration: none;">${email}</a></td>
                        </tr>
                        ${phone ? `<tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Telefon</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${phone}</td>
                        </tr>` : ''}
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Wunschtermin</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${date}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Treffpunkt</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">Lange Straße, Höhe Cup&amp;Cino</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Uhrzeit</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${time || 'Nicht angegeben'} Uhr</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Führungstyp</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${tourType}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Gruppengröße</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${groupSize} Personen</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Gewand-Zuschlag</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: 300;">${gewandZuschlag ? 'Ja (+10,00 €)' : 'Nein'}</td>
                        </tr>
                        <tr>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-weight: 600; color: #d9a24a; width: 38%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em;">Kalkulierter Preis</td>
                          <td style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: bold; font-size: 16px;">${cost},00 €</td>
                        </tr>
                      </table>
                      ${message ? `
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: rgba(217, 162, 74, 0.02); border-left: 2px solid #d9a24a; margin-bottom: 30px;">
                        <tr>
                          <td style="padding: 22px 25px;">
                            <p style="font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: #d9a24a; margin: 0 0 12px 0; font-weight: 600;">Nachricht / Sonderwünsche</p>
                            <p style="font-style: italic; color: #faf6ee; font-size: 14px; line-height: 1.7; margin: 0; font-weight: 300;">"${message.replace(/\n/g, '<br>')}"</p>
                          </td>
                        </tr>
                      </table>` : ''}

                      <!-- Action Buttons -->
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 30px;">
                        <tr>
                          <td align="center">
                            <p style="color: #94a3b8; font-size: 13px; margin: 0 0 16px 0; text-align: center; font-weight: 300;">Anfrage direkt bearbeiten:</p>
                            <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                              <tr>
                                <td style="border-radius: 4px; background-color: #10b981;" align="center">
                                  <a href="${acceptLink}" target="_blank" style="padding: 12px 24px; border: 1px solid #10b981; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #ffffff; text-decoration: none; font-weight: bold; display: inline-block;">🏛️ ANNEHMEN (Zusagen)</a>
                                </td>
                                <td width="20"></td>
                                <td style="border-radius: 4px; background-color: #ef4444;" align="center">
                                  <a href="${rejectLink}" target="_blank" style="padding: 12px 24px; border: 1px solid #ef4444; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #ffffff; text-decoration: none; font-weight: bold; display: inline-block;">❌ ABLEHNEN (Absagen)</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #0d111a; padding: 30px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.04); font-size: 11px; color: #94a3b8; line-height: 1.6;">
                      Anfrage über <a href="https://nienburger-nachtwaechter.de" style="color: #d9a24a; text-decoration: none;">nienburger-nachtwaechter.de</a><br>
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
    } else if (source === 'work4palace') {
      // ───── WORK4PALACE E-MAIL ─────
      const { name, email, phone, projectType, message, formType, scopeSize, location, timeframe } = data;

      if (!name || !email) {
        return new Response(JSON.stringify({ success: false, message: 'Name und E-Mail sind Pflichtfelder.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isPlanner = formType === 'planner';
      fromName = 'Scholz & Friese Webdesign';
      emailSubject = isPlanner
        ? `[work4palace] 🏛️ Neue Projektkonfiguration von ${name}`
        : `[work4palace] ✉️ Neue Kontaktanfrage von ${name}`;

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

    } else if (source === 'weymann-gebaeudetechnik') {
      // ───── WEYMANN GEBÄUDETECHNIK E-MAILS ─────
      const { formType } = data;
      fromName = 'Karl Weymann GmbH';

      // Route dynamically depending on form type: career vs project/general requests
      if (formType === 'karriere') {
        recipientEmail = 't.weymann@karl-weymann-gmbh.de';
      } else {
        recipientEmail = 'Anfragen@karl-weymann-gmbh.de';
      }

      if (formType === 'waermepumpe') {
        const { name, ort, email, phone, currentHeizung, baujahr, wohnflaeche, message } = data;

        if (!name || !email || !phone || !ort) {
          return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        emailSubject = `[weymann-gebaeudetechnik] ❄️ Neuer Wärmepumpen-Check von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(13, 43, 94, 0.05);">
                    <tr>
                      <td style="background-color: #0d2b5e; padding: 30px; text-align: center; border-bottom: 4px solid #d21e26;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Karl Weymann GmbH</h1>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aab2; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Wärmepumpen-Anfrage</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; font-weight: 600; color: #0d2b5e; margin: 0 0 15px 0;">Hallo Team,</p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
                          über die Website wurde eine neue Wärmepumpen-Anfrage gesendet. Hier sind die erfassten Details:
                        </p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 40%; font-size: 12px; text-transform: uppercase;">Kunde</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Ort / PLZ</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${ort}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;"><a href="mailto:${email}" style="color: #d21e26; text-decoration: none; font-weight: 500;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Telefon</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${phone}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Aktuelle Heizung</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${currentHeizung || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Baujahr (ca.)</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${baujahr || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Wohnfläche</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${wohnflaeche || '-'}</td>
                          </tr>
                        </table>
                        ${message ? `
                        <div style="background-color: #f8fafc; border-left: 4px solid #d21e26; padding: 15px 20px; border-radius: 4px;">
                          <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0d2b5e;">Anmerkungen / Wünsche</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; font-style: italic;">"${message.replace(/\n/g, '<br>')}"</p>
                        </div>` : ''}
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                        Karl Weymann GmbH | Burgdorfer Straße 110 | 31275 Lehrte<br>
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
      } else if (formType === 'heizung') {
        const { eigentuemer, objekt, currentHeizung, alterHeizung, fussbodenheizung, wohnflaeche, wunsch, zeitraum, name, phone, email, adresse } = data;

        if (!name || !email || !phone || !adresse) {
          return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        emailSubject = `[weymann-gebaeudetechnik] 🔥 Neuer Heizungs-Check von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(13, 43, 94, 0.05);">
                    <tr>
                      <td style="background-color: #0d2b5e; padding: 30px; text-align: center; border-bottom: 4px solid #d21e26;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Karl Weymann GmbH</h1>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aab2; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Heizungs-Anfrage</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; font-weight: 600; color: #0d2b5e; margin: 0 0 15px 0;">Hallo Team,</p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
                          über die Website wurde eine neue Heizungs-Anfrage gesendet. Hier sind die Details:
                        </p>
                        
                        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #d21e26; margin: 0 0 10px 0;">Angaben zum Projekt</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Eigentümer?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${eigentuemer || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Objekttyp</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${objekt || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Aktuelle Heizung</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${currentHeizung || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Alter der Anlage (ca.)</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${alterHeizung || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Fußbodenheizung?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${fussbodenheizung || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Wohnfläche</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${wohnflaeche || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Gewünschte Maßnahme</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${wunsch || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Zeitraum</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${zeitraum || '-'}</td>
                          </tr>
                        </table>

                        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #d21e26; margin: 20px 0 10px 0;">Kontaktdaten</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 10px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Name</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Telefon</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${phone}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;"><a href="mailto:${email}" style="color: #d21e26; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Adresse</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${adresse}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                        Karl Weymann GmbH | Burgdorfer Straße 110 | 31275 Lehrte<br>
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
      } else if (formType === 'bad') {
        const { eigentuemer, objekt, vorhaben, alterBad, groesse, wanne, dusche, barrierefrei, stil, zeitraum, name, phone, email, adresse } = data;

        if (!name || !email || !phone || !adresse) {
          return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        emailSubject = `[weymann-gebaeudetechnik] 🛁 Neuer Bad-Check von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(13, 43, 94, 0.05);">
                    <tr>
                      <td style="background-color: #0d2b5e; padding: 30px; text-align: center; border-bottom: 4px solid #d21e26;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Karl Weymann GmbH</h1>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aab2; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Bad-Anfrage</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; font-weight: 600; color: #0d2b5e; margin: 0 0 15px 0;">Hallo Team,</p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
                          über die Website wurde eine neue Badsanierungs-Anfrage gesendet. Hier sind die Details:
                        </p>
                        
                        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #d21e26; margin: 0 0 10px 0;">Angaben zum Bad</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Eigentümer?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${eigentuemer || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Objekttyp</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${objekt || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Vorhaben</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${vorhaben || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Alter des Bades</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${alterBad || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Größe (ca.)</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${groesse || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Badewanne vorhanden?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${wanne || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Bodengleiche Dusche?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${dusche || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Barrierefrei wichtig?</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${barrierefrei || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Gewünschter Stil</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${stil || '-'}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Zeitraum</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${zeitraum || '-'}</td>
                          </tr>
                        </table>

                        <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #d21e26; margin: 20px 0 10px 0;">Kontaktdaten</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 10px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Name</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Telefon</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${phone}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;"><a href="mailto:${email}" style="color: #d21e26; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Adresse</td>
                            <td style="padding: 10px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14px;">${adresse}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                        Karl Weymann GmbH | Burgdorfer Straße 110 | 31275 Lehrte<br>
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
      } else if (formType === 'karriere') {
        const { name, phone, email, position, erfahrung, message } = data;

        if (!name || !email || !phone || !position) {
          return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        emailSubject = `[weymann-gebaeudetechnik] 💼 Neue 60-Sekunden-Bewerbung von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(13, 43, 94, 0.05);">
                    <tr>
                      <td style="background-color: #0d2b5e; padding: 30px; text-align: center; border-bottom: 4px solid #d21e26;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Karl Weymann GmbH</h1>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aab2; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Online-Bewerbung</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; font-weight: 600; color: #0d2b5e; margin: 0 0 15px 0;">Hallo Team,</p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
                          über das Online-Bewerbungsformular ist eine neue Kurzbewerbung eingegangen:
                        </p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Name</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Telefon</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${phone}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;"><a href="mailto:${email}" style="color: #d21e26; text-decoration: none; font-weight: 500;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Gewünschte Position</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px; font-weight: 600; color: #d21e26;">${position}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Berufserfahrung</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${erfahrung || '-'}</td>
                          </tr>
                        </table>
                        ${message ? `
                        <div style="background-color: #f8fafc; border-left: 4px solid #d21e26; padding: 15px 20px; border-radius: 4px;">
                          <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0d2b5e;">Nachricht / Ergänzung</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; font-style: italic;">"${message.replace(/\n/g, '<br>')}"</p>
                        </div>` : ''}
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                        Karl Weymann GmbH | Burgdorfer Straße 110 | 31275 Lehrte<br>
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
        const { name, email, phone, message } = data;

        if (!name || !email || !phone || !message) {
          return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        emailSubject = `[weymann-gebaeudetechnik] ✉️ Neue Kontaktanfrage von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(13, 43, 94, 0.05);">
                    <tr>
                      <td style="background-color: #0d2b5e; padding: 30px; text-align: center; border-bottom: 4px solid #d21e26;">
                        <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700; letter-spacing: 0.5px;">Karl Weymann GmbH</h1>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: #a0aab2; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Kontaktanfrage</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; font-weight: 600; color: #0d2b5e; margin: 0 0 15px 0;">Hallo Team,</p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
                          über das Kontaktformular wurde eine neue Nachricht gesendet:
                        </p>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; width: 45%; font-size: 12px; text-transform: uppercase;">Name</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;"><a href="mailto:${email}" style="color: #d21e26; text-decoration: none; font-weight: 500;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0d2b5e; font-size: 12px; text-transform: uppercase;">Telefon</td>
                            <td style="padding: 12px 14px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 14.5px;">${phone}</td>
                          </tr>
                        </table>
                        <div style="background-color: #f8fafc; border-left: 4px solid #d21e26; padding: 15px 20px; border-radius: 4px;">
                          <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0d2b5e;">Nachricht / Anliegen</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; font-style: italic;">"${message.replace(/\n/g, '<br>')}"</p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #f8fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                        Karl Weymann GmbH | Burgdorfer Straße 110 | 31275 Lehrte<br>
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
      }

    } else if (source === 'elementbau-nienburg') {
      // ───── ELEMENTBAU NIENBURG E-MAILS ─────
      const { name, email, phone, projectType, experience, message, formType } = data;

      if (!name || !email || !phone) {
        return new Response(JSON.stringify({ success: false, message: 'Bitte Name, E-Mail und Telefonnummer ausfüllen.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Scholz & Friese Webdesign';
      if (!isKvRecipient) recipientEmail = 'info@elementbau-ni.de';

      if (formType === 'bewerbung') {
        emailSubject = `[elementbau-nienburg] 💼 Neue Bewerbung: Kellerabdichter - ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #080A0F; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #FFFFFF;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #080A0F; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #151923; border: 1px solid #ff8c00; border-top: 4px solid #ff8c00; border-radius: 6px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #1f2937;">
                        <h2 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; text-transform: uppercase;">Neue Online-Bewerbung</h2>
                        <p style="margin: 5px 0 0 0; font-size: 14px; color: #ff8c00;">Stelle: Kellerabdichter / Helfer Handwerk</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 30px;">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600; width: 35%;">Bewerber:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">E-Mail:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;"><a href="mailto:${email}" style="color: #ff8c00; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">Telefon:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;"><a href="tel:${phone}" style="color: #ff8c00; text-decoration: none;">${phone}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">Erfahrung:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #ff8c00; font-size: 14px; font-weight: bold;">${experience}</td>
                          </tr>
                        </table>
                        
                        <div style="background-color: #1f2937; border-left: 3px solid #ff8c00; padding: 15px; border-radius: 0 4px 4px 0;">
                          <h4 style="margin: 0 0 10px 0; color: #FFFFFF; font-size: 12px; text-transform: uppercase;">Nachricht / Motivation:</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #D1D5DB; white-space: pre-wrap;">${message || 'Keine Nachricht hinterlassen.'}</p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #0b0d13; padding: 20px; text-align: center; border-top: 1px solid #1f2937; font-size: 11px; color: #A1A1AA;">
                        Bewerbung über <a href="https://elementbau-ni.de" style="color: #ff8c00; text-decoration: none;">elementbau-ni.de</a><br>
                        Design by <strong>Scholz & Friese Webdesign</strong>
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
        emailSubject = `[elementbau-nienburg] ✉️ Neue Projektanfrage: ${projectType} - ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #080A0F; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #FFFFFF;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #080A0F; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #151923; border: 1px solid #ff8c00; border-top: 4px solid #ff8c00; border-radius: 6px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #1f2937;">
                        <h2 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; text-transform: uppercase;">Neue Projektanfrage</h2>
                        <p style="margin: 5px 0 0 0; font-size: 14px; color: #ff8c00;">Elementbau Nienburg</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 30px;">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600; width: 35%;">Name:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;">${name}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">E-Mail:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;"><a href="mailto:${email}" style="color: #ff8c00; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">Telefon:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #FFFFFF; font-size: 14px;"><a href="tel:${phone}" style="color: #ff8c00; text-decoration: none;">${phone}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #A1A1AA; font-size: 13px; font-weight: 600;">Projektart:</td>
                            <td style="padding: 10px 0; border-bottom: 1px solid #1f2937; color: #ff8c00; font-size: 14px; font-weight: bold;">${projectType}</td>
                          </tr>
                        </table>
                        
                        <div style="background-color: #1f2937; border-left: 3px solid #ff8c00; padding: 15px; border-radius: 0 4px 4px 0;">
                          <h4 style="margin: 0 0 10px 0; color: #FFFFFF; font-size: 12px; text-transform: uppercase;">Projektbeschreibung:</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #D1D5DB; white-space: pre-wrap;">${message}</p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #0b0d13; padding: 20px; text-align: center; border-top: 1px solid #1f2937; font-size: 11px; color: #A1A1AA;">
                        Anfrage über <a href="https://elementbau-ni.de" style="color: #ff8c00; text-decoration: none;">elementbau-ni.de</a><br>
                        Design by <strong>Scholz & Friese Webdesign</strong>
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

    } else if (source === 'bestattungen-eberhardt') {
      // ───── BESTATTUNGEN EBERHARDT E-MAIL ─────
      const { name, email, phone, subject, message } = data;

      if (!name || !email || !message) {
        return new Response(JSON.stringify({ success: false, message: 'Bitte Name, E-Mail und Ihre Nachricht eingeben.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Bestattungen Eberhardt';
      if (!isKvRecipient) recipientEmail = 'info@bestattungen-eberhardt.de';
      emailSubject = `[bestattungen-eberhardt] ✉️ Neue Nachricht von ${name}`;

      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #161816; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #FFFFFF;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #161816; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #1c1f1c; border: 1px solid rgba(255, 255, 255, 0.05); border-top: 4px solid #85a31f; border-radius: 6px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                  <tr>
                    <td style="padding: 30px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                      <h2 style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Bestattungen Eberhardt</h2>
                      <p style="margin: 5px 0 0 0; font-size: 14px; color: #85a31f;">Neue Kontaktanfrage über die Website</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 30px;">
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #A1A1AA; font-size: 13px; font-weight: 600; width: 35%;">Name:</td>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #FFFFFF; font-size: 14px;">${name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #A1A1AA; font-size: 13px; font-weight: 600;">E-Mail:</td>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #FFFFFF; font-size: 14px;"><a href="mailto:${email}" style="color: #85a31f; text-decoration: none;">${email}</a></td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #A1A1AA; font-size: 13px; font-weight: 600;">Telefon:</td>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #FFFFFF; font-size: 14px;">${phone ? `<a href="tel:${phone}" style="color: #85a31f; text-decoration: none;">${phone}</a>` : '-'}</td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #A1A1AA; font-size: 13px; font-weight: 600;">Betreff:</td>
                          <td style="padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #85a31f; font-size: 14px; font-weight: bold;">${subject || 'Allgemeine Anfrage'}</td>
                        </tr>
                      </table>
                      
                      <div style="background-color: rgba(255, 255, 255, 0.02); border-left: 3px solid #85a31f; padding: 15px; border-radius: 0 4px 4px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #FFFFFF; font-size: 12px; text-transform: uppercase;">Nachricht:</h4>
                        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #D1D5DB; white-space: pre-wrap;">${message}</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #0d0f0c; padding: 20px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; color: #A1A1AA;">
                      Gesendet über die Website <a href="https://bestattungen-eberhardt.de" style="color: #85a31f; text-decoration: none;">bestattungen-eberhardt.de</a><br>
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

    } else if (source === 'fm-freie-rednerin') {
      // ───── FINNJA MARIE (FM-FREIE-REDNERIN) E-MAIL ─────
      const { formType, name, email, phone, date, location, deceased_name, termin_fest, wishes, message } = data;

      if (!name || !email || !message) {
        return new Response(JSON.stringify({ success: false, message: 'Name, E-Mail und Nachricht sind Pflichtfelder.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Scholz & Friese Webdesign';
      if (!isKvRecipient) recipientEmail = 'finnjamariesch@t-online.de';
      
      const isTrauer = formType === 'trauerfeier';
      const typeLabel = isTrauer ? 'Trauerfeier' : 'Freie Trauung';
      emailSubject = `[fm-freie-rednerin] ✉️ Neue Anfrage (${typeLabel}) von ${name}`;

      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #faf6ee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e1e1a;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #faf6ee; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e8d8bd; border-top: 4px solid ${isTrauer ? '#64748b' : '#D4A373'}; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                  <tr>
                    <td style="padding: 30px; border-bottom: 1px solid #e8d8bd; background-color: #faf6ee; text-align: center;">
                      <h2 style="margin: 0; color: #1e1e1a; font-family: Georgia, serif; font-size: 22px; font-weight: 400;">Finnja Marie</h2>
                      <p style="margin: 5px 0 0 0; font-size: 13px; color: ${isTrauer ? '#64748b' : '#D4A373'}; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Neue Anfrage: ${typeLabel}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 35px;">
                      <p style="font-size: 15px; line-height: 1.6; color: #1e1e1a; margin: 0 0 25px 0;">
                        Hallo Finnja,
                      </p>
                      <p style="font-size: 14px; line-height: 1.6; color: #5c5950; margin: 0 0 25px 0;">
                        über das Kontaktformular deiner Website wurde eine neue Anfrage gesendet. Hier sind die erfassten Daten:
                      </p>
                      
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                        <tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; width: 45%; font-size: 12px; text-transform: uppercase;">Name</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">E-Mail</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;"><a href="mailto:${email}" style="color: ${isTrauer ? '#64748b' : '#D4A373'}; text-decoration: none; font-weight: 600;">${email}</a></td>
                        </tr>
                        ${phone ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Telefonnummer</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${phone}</td>
                        </tr>` : ''}
                        ${date ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Datum der Feier</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px; font-weight: bold;">${date}</td>
                        </tr>` : ''}
                        ${location ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Ort der Feier</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${location}</td>
                        </tr>` : ''}
                        ${isTrauer && deceased_name ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Name d. Verstorbenen</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${deceased_name}</td>
                        </tr>` : ''}
                        ${!isTrauer && termin_fest ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Termin fest gebucht?</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${termin_fest === 'ja' ? 'Ja, steht fest' : 'Nein, noch flexibel'}</td>
                        </tr>` : ''}
                        ${!isTrauer && wishes ? `<tr>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; font-weight: 600; color: #1e1e1a; font-size: 12px; text-transform: uppercase;">Erste Wünsche</td>
                          <td style="padding: 12px 14px; border-bottom: 1px solid #faf6ee; color: #1e1e1a; font-size: 14px;">${wishes}</td>
                        </tr>` : ''}
                      </table>

                      <div style="background-color: #faf6ee; border-left: 4px solid ${isTrauer ? '#64748b' : '#D4A373'}; padding: 15px 20px; border-radius: 4px; margin-top: 25px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #1e1e1a;">Nachricht / Details:</h4>
                        <p style="margin: 0; font-size: 14.5px; line-height: 1.6; color: #5c5950; font-style: italic;">"${message.replace(/\n/g, '<br>')}"</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #faf6ee; padding: 25px; text-align: center; border-top: 1px solid #e8d8bd; font-size: 11px; color: #5c5950; line-height: 1.6;">
                      Anfrage über <a href="https://fm-freierednerin.de" style="color: ${isTrauer ? '#64748b' : '#D4A373'}; text-decoration: none;">fm-freierednerin.de</a><br>
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

    } else if (source === 'immom') {
      // ───── IMMOM E-MAIL ─────
      const { type, email } = data;

      if (!email) {
        return new Response(JSON.stringify({ success: false, message: 'E-Mail ist ein Pflichtfeld.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Scholz & Friese Webdesign';
      if (!isKvRecipient) recipientEmail = 'mail@immom.eu';

      if (type === 'checklist') {
        emailSubject = `[ImmoM] 📚 Ihre angeforderten Checklisten für den Immobilienverkauf`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #F7F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #071B33;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F1E8; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8E8E8; border-top: 4px solid #D9A24A; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #E8E8E8; background-color: #071B33; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-family: Georgia, serif; font-size: 22px; font-weight: 400; letter-spacing: 1px;">ImmoM</h2>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #D9A24A; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Ihre angeforderten Checklisten</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; line-height: 1.6; color: #071B33; margin: 0 0 20px 0; font-weight: 600;">
                          Guten Tag,
                        </p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #102A4C; margin: 0 0 25px 0;">
                          vielen Dank für Ihr Interesse an unseren Eigentümer-Ratgebern. Wie gewünscht senden wir Ihnen hiermit die Download-Links zu Ihren beiden kostenlosen Checklisten direkt in Ihr Postfach:
                        </p>
                        
                        <!-- Checkliste 1 -->
                        <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; border-radius: 4px; padding: 20px; margin-bottom: 20px; text-align: left;">
                          <h4 style="margin: 0 0 8px 0; font-size: 15px; color: #071B33; font-weight: 700;">1. Checkliste: Optimale Immobilien-Aufbereitung</h4>
                          <p style="margin: 0 0 15px 0; font-size: 13.5px; line-height: 1.5; color: #102A4C;">
                            Wertsteigerung mit System: Erfahren Sie, wie Sie Ihre Immobilie für Besichtigungen perfekt vorbereiten, um den besten ersten Eindruck zu hinterlassen.
                          </p>
                          <a href="https://pub-b33108412309406a9a941ddc51e9a5b9.r2.dev/ImmoM/Checkliste-Aufbereitung.pdf" style="display: inline-block; background-color: #071B33; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 700;">Checkliste Aufbereitung herunterladen (PDF)</a>
                        </div>
                        
                        <!-- Checkliste 2 -->
                        <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; border-radius: 4px; padding: 20px; margin-bottom: 25px; text-align: left;">
                          <h4 style="margin: 0 0 8px 0; font-size: 15px; color: #071B33; font-weight: 700;">2. Checkliste: Fahrplan für den Haus-Verkauf</h4>
                          <p style="margin: 0 0 15px 0; font-size: 13.5px; line-height: 1.5; color: #102A4C;">
                            Schritt für Schritt zum Bestpreis: Vermeiden Sie die 10 typischen Fehler beim Immobilienverkauf und führen Sie den Verkauf rechtssicher durch.
                          </p>
                          <a href="https://pub-b33108412309406a9a941ddc51e9a5b9.r2.dev/ImmoM/Checkliste-Haus-Verkauf.pdf" style="display: inline-block; background-color: #071B33; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 700;">Checkliste Haus-Verkauf herunterladen (PDF)</a>
                        </div>

                        <p style="font-size: 14px; line-height: 1.6; color: #102A4C; margin: 25px 0 0 0;">
                          Haben Sie Fragen zur Bewertung oder Vermarktung Ihrer Immobilie? Wir stehen Ihnen gerne für ein persönliches, kostenloses Beratungsgespräch zur Verfügung.
                        </p>
                        <p style="font-size: 14px; line-height: 1.6; color: #102A4C; margin: 20px 0 0 0; font-weight: 600;">
                          Herzliche Grüße,<br>
                          Carsten Meyer
                        </p>
                        <p style="font-size: 12.5px; line-height: 1.5; color: #7a92a3; margin: 5px 0 0 0;">
                          ImmoM / CM-Immobilien<br>
                          Büro: An den Teichen 30, 31608 Marklohe<br>
                          Telefon: 05021 8601001 | E-Mail: mail@immom.eu
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #071B33; padding: 25px; text-align: center; font-size: 11px; color: #E8E8E8; line-height: 1.6;">
                        Anfrage über <a href="https://immom.de" style="color: #D9A24A; text-decoration: none;">immom.de</a><br>
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
      } else if (type === 'expose') {
        const { name, phone, street, zipCity, address, msg, propertyTitle, propertyLocation, propertyPrice, exposeUrl } = data;
        const fullAddress = address || (street && zipCity ? `${street}, ${zipCity}` : street || zipCity || '');
        emailSubject = `[ImmoM] 🏡 Exposé- & Besichtigungsanfrage von ${name}`;
        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #F7F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #071B33;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F1E8; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8E8E8; border-top: 4px solid #D9A24A; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #E8E8E8; background-color: #071B33; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-family: Georgia, serif; font-size: 22px; font-weight: 400; letter-spacing: 1px;">ImmoM</h2>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #D9A24A; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Exposé- & Besichtigungsanfrage</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 15px; line-height: 1.6; color: #071B33; margin: 0 0 20px 0; font-weight: 600;">
                          Hallo Carsten,
                        </p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #102A4C; margin: 0 0 25px 0;">
                          über das Exposé-Modal wurde eine neue Anfrage übermittelt:
                        </p>
                        
                        <h3 style="margin: 25px 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #071B33; border-bottom: 1px solid #E8E8E8; padding-bottom: 5px;">Interessent</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; width: 40%; font-size: 12px;">Name</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${name}</td>
                          </tr>
                          ${fullAddress ? `<tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Anschrift</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: 600;">${fullAddress}</td>
                          </tr>` : ''}
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">E-Mail</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;"><a href="mailto:${email}" style="color: #D9A24A; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Telefon</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;"><a href="tel:${phone}" style="color: #102A4C; text-decoration: none;">${phone}</a></td>
                          </tr>
                        </table>

                        <h3 style="margin: 25px 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #071B33; border-bottom: 1px solid #E8E8E8; padding-bottom: 5px;">Interessantes Objekt</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; width: 40%; font-size: 12px;">Titel</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: 600;">${propertyTitle}</td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Ort</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${propertyLocation}</td>
                          </tr>
                          ${propertyPrice ? `<tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Kaufpreis</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #D9A24A; font-size: 14px; font-weight: bold;">${propertyPrice}</td>
                          </tr>` : ''}
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Auto-PDF Versendet?</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: ${exposeUrl ? '#2e7d32' : '#d97706'}; font-size: 14px; font-weight: bold;">${exposeUrl ? 'Ja (PDF-Link per E-Mail)' : 'Nein (kein PDF hinterlegt)'}</td>
                          </tr>
                        </table>

                        <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; padding: 15px 20px; border-radius: 4px; margin-top: 25px;">
                          <h4 style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #071B33;">Nachricht / Wünsche:</h4>
                          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #102A4C; font-style: italic;">"${(msg || '').replace(/\n/g, '<br>')}"</p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #071B33; padding: 25px; text-align: center; font-size: 11px; color: #E8E8E8; line-height: 1.6;">
                        Anfrage über <a href="https://immom.de" style="color: #D9A24A; text-decoration: none;">immom.de</a><br>
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
      } else if (type === 'valuation') {
        const { flow, anrede, vorname, nachname, street, zipCity, address, phone, terminwunsch } = data;
        const nameLabel = `${anrede === 'frau' ? 'Frau' : 'Herr'} ${vorname} ${nachname}`;
        const fullAddress = address || (street && zipCity ? `${street}, ${zipCity}` : street || zipCity || '');
        
        emailSubject = flow === 'beratung'
          ? `[ImmoM] 📞 Rückruf- & Beratungstermin angefordert von ${vorname} ${nachname}`
          : `[ImmoM] 🏛️ Neue Online-Wertermittlung (${flow}) von ${vorname} ${nachname}`;
        
        // Build properties list based on the chosen flow
        let detailsHtml = '';
        if (flow === 'haus') {
          const { hausart, subHausart, wohnungenAnzahl, gewerbeAnteil, zimmeranz, etagen, wohnflaeche, grundstueckflaeche, baujahr, besonderheitenHaus, vermietetHaus } = data;
          detailsHtml = `
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33; width: 45%;">Kategorie</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">Haus</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Hausart</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${hausart === 'einfamilienhaus' ? 'Einfamilienhaus' : 'Mehrfamilienhaus'}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Typ</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${subHausart}</td></tr>
            ${wohnungenAnzahl ? `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Anzahl Wohnungen</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${wohnungenAnzahl}</td></tr>` : ''}
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Gewerbeanteil</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${gewerbeAnteil}</td></tr>
            ${zimmeranz ? `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Zimmer</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${zimmeranz}</td></tr>` : ''}
            ${etagen ? `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Etagen</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${etagen}</td></tr>` : ''}
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Wohnfläche</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: bold;">${wohnflaeche} m²</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Grundstücksfläche</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${grundstueckflaeche} m²</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Baujahr</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${baujahr}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Vermietet</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${vermietetHaus}</td></tr>
            ${besonderheitenHaus && besonderheitenHaus.length > 0 ? `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Besonderheiten</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${besonderheitenHaus.join(', ')}</td></tr>` : ''}
          `;
        } else if (flow === 'wohnung') {
          const { wohnungsflaeche, wohnungszimmer, wohnungsbaujahr, wohnungsEtage, besonderheitenWohnung, vermietetWohnung } = data;
          detailsHtml = `
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33; width: 45%;">Kategorie</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">Wohnung</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Wohnfläche</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: bold;">${wohnungsflaeche} m²</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Zimmer</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${wohnungszimmer}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Baujahr</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${wohnungsbaujahr}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Etage</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${wohnungsEtage}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Vermietet</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${vermietetWohnung}</td></tr>
            ${besonderheitenWohnung && besonderheitenWohnung.length > 0 ? `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Besonderheiten</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${besonderheitenWohnung.join(', ')}</td></tr>` : ''}
          `;
        } else if (flow === 'gewerbe') {
          const { gewerbeart, gewerbeflaeche, gewerbebaujahr } = data;
          detailsHtml = `
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33; width: 45%;">Kategorie</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">Gewerbe</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Gewerbeart</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${gewerbeart}</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Fläche</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: bold;">${gewerbeflaeche} m²</td></tr>
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33;">Baujahr</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${gewerbebaujahr}</td></tr>
          `;
        } else if (flow === 'beratung') {
          detailsHtml = `
            <tr><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; font-size: 12px; color: #071B33; width: 45%;">Kategorie</td><td style="padding: 8px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">Direkte Beratung / Rückruf</td></tr>
          `;
        }

        emailHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #F7F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #071B33;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F1E8; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8E8E8; border-top: 4px solid #D9A24A; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #E8E8E8; background-color: #071B33; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-family: Georgia, serif; font-size: 22px; font-weight: 400; letter-spacing: 1px;">ImmoM</h2>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #D9A24A; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">${flow === 'beratung' ? 'Beratungsanfrage' : 'Online-Wertermittlung'}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 15px; line-height: 1.6; color: #071B33; margin: 0 0 20px 0; font-weight: 600;">
                          Hallo Carsten,
                        </p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #102A4C; margin: 0 0 25px 0;">
                          über das Formular der Online-Wertermittlung wurde eine neue Anfrage übermittelt:
                        </p>
                        
                        <h3 style="margin: 25px 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #071B33; border-bottom: 1px solid #E8E8E8; padding-bottom: 5px;">Kontaktdaten</h3>
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; width: 40%; font-size: 12px;">Name</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${nameLabel}</td>
                          </tr>
                          ${fullAddress ? `<tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Anschrift</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px; font-weight: 600;">${fullAddress}</td>
                          </tr>` : ''}
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">E-Mail</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;"><a href="mailto:${email}" style="color: #D9A24A; text-decoration: none;">${email}</a></td>
                          </tr>
                          <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Telefon</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;"><a href="tel:${phone}" style="color: #102A4C; text-decoration: none;">${phone}</a></td>
                          </tr>
                          ${terminwunsch ? `<tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; font-weight: 600; color: #071B33; font-size: 12px;">Rückruf/Termin Wunsch</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #F7F1E8; color: #102A4C; font-size: 14px;">${terminwunsch}</td>
                          </tr>` : ''}
                        </table>

                        ${flow !== 'beratung' ? `
                          <h3 style="margin: 25px 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #071B33; border-bottom: 1px solid #E8E8E8; padding-bottom: 5px;">Immobiliendetails</h3>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse;">
                            ${detailsHtml}
                          </table>
                        ` : ''}
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #071B33; padding: 25px; text-align: center; font-size: 11px; color: #E8E8E8; line-height: 1.6;">
                        Anfrage über <a href="https://immom.de" style="color: #D9A24A; text-decoration: none;">immom.de</a><br>
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
      }
    } else if (source === 'Rodes-Hotel') {
      const { name, email, phone, type, message } = data;

      if (!name || !email || !phone || !message) {
        return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'Rodes Hotel';
      if (!isKvRecipient) recipientEmail = 'info@rodes-hotel.de';
      emailSubject = `[Rodes Hotel] ✉️ Neue Online-Anfrage von ${name}`;
      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #F7F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: #102A4C;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F1E8; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8E8E8; border-top: 4px solid #D9A24A; border-radius: 8px; overflow: hidden; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.05);">
                  <tr>
                    <td style="background-color: #071B33; padding: 35px 30px; text-align: center; border-bottom: 2px solid #D9A24A;">
                      <h1 style="margin: 0; font-family: Georgia, serif; font-size: 24px; letter-spacing: 0.08em; color: #ffffff; text-transform: uppercase; font-weight: 400;">Rodes Hotel</h1>
                      <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #D9A24A; font-weight: 500;">Online-Anfrage & Buchung</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 35px;">
                      <p style="font-family: Georgia, serif; font-size: 18px; color: #071B33; margin: 0 0 15px 0; font-style: italic;">Hallo Team,</p>
                      <p style="color: #102A4C; font-size: 14.5px; line-height: 1.6; margin: 0 0 30px 0; font-weight: 300;">
                        über die Website wurde eine neue Anfrage eingereicht:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse; border: 1px solid #E8E8E8;">
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; font-weight: 600; color: #071B33; width: 35%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em; background-color: #fcfbfa;">Name</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; color: #102A4C; font-size: 14px;">${name}</td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; font-weight: 600; color: #071B33; width: 35%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em; background-color: #fcfbfa;">E-Mail</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; color: #102A4C; font-size: 14px;"><a href="mailto:${email}" style="color: #D9A24A; text-decoration: none;">${email}</a></td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; font-weight: 600; color: #071B33; width: 35%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em; background-color: #fcfbfa;">Telefon</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; color: #102A4C; font-size: 14px;"><a href="tel:${phone}" style="color: #102A4C; text-decoration: none;">${phone}</a></td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; font-weight: 600; color: #071B33; width: 35%; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.08em; background-color: #fcfbfa;">Anfragetyp</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8E8E8; color: #102A4C; font-size: 14px; font-weight: bold; text-transform: capitalize;">${type}</td>
                        </tr>
                      </table>
                      
                      <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; padding: 20px; border-radius: 4px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #071B33; font-weight: 600;">Nachricht / Anfrage:</h4>
                        <p style="font-style: italic; color: #102A4C; font-size: 14.5px; line-height: 1.6; margin: 0; white-space: pre-wrap;">"${message.replace(/\n/g, '<br>')}"</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #071B33; padding: 25px; text-align: center; border-top: 1px solid #E8E8E8; font-size: 11px; color: #ffffff; line-height: 1.6;">
                      Anfrage über <a href="https://rodes-hotel.de" style="color: #D9A24A; text-decoration: none;">rodes-hotel.de</a><br>
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
    } else if (source === 'homan-madical' || source === 'homann-medical') {
      const { name, company, email, phone, product, message } = data;

      if (!name || !email || !message) {
        return new Response(JSON.stringify({ success: false, message: 'Bitte alle Pflichtfelder ausfüllen.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      fromName = 'HOMANN-MEDICAL Website';
      recipientEmail = 'contact@homann-medical.de';
      emailSubject = `[HOMANN-MEDICAL] ✉️ Neue Anfrage von ${name}${company ? ' (' + company + ')' : ''}`;
      emailHtml = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; color: #2C251E;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #FAF6F0; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8DCC4; border-top: 4px solid #C81D25; border-radius: 12px; overflow: hidden; box-shadow: 0 15px 40px rgba(31, 27, 22, 0.08);">
                  <tr>
                    <td style="background-color: #1F1B16; padding: 35px 30px; text-align: center; border-bottom: 2px solid #D9A24A;">
                      <h1 style="margin: 0; font-family: sans-serif; font-size: 22px; letter-spacing: 0.05em; color: #ffffff; text-transform: uppercase; font-weight: 700;">HOMANN-MEDICAL</h1>
                      <p style="margin: 6px 0 0 0; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: #D9A24A; font-weight: 600;">Medizinische Verbandstoffe • Neue Anfrage</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 35px;">
                      <p style="font-size: 16px; color: #1F1B16; margin: 0 0 15px 0; font-weight: 600;">Sehr geehrtes HOMANN-MEDICAL Team,</p>
                      <p style="color: #7A6F65; font-size: 14.5px; line-height: 1.6; margin: 0 0 30px 0;">
                        über das Kontaktformular Ihrer Website ist eine neue Kundenanfrage eingegangen:
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse; border: 1px solid #E8DCC4; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; font-weight: 600; color: #1F1B16; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background-color: #FAF6F0;">Name</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; color: #2C251E; font-size: 14px; font-weight: 600;">${name}</td>
                        </tr>
                        ${company ? `
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; font-weight: 600; color: #1F1B16; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background-color: #FAF6F0;">Firma / Organisation</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; color: #2C251E; font-size: 14px;">${company}</td>
                        </tr>
                        ` : ''}
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; font-weight: 600; color: #1F1B16; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background-color: #FAF6F0;">E-Mail</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; color: #2C251E; font-size: 14px;"><a href="mailto:${email}" style="color: #C81D25; text-decoration: none; font-weight: 600;">${email}</a></td>
                        </tr>
                        ${phone ? `
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; font-weight: 600; color: #1F1B16; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background-color: #FAF6F0;">Telefon</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; color: #2C251E; font-size: 14px;"><a href="tel:${phone}" style="color: #2C251E; text-decoration: none;">${phone}</a></td>
                        </tr>
                        ` : ''}
                        ${product ? `
                        <tr>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; font-weight: 600; color: #1F1B16; width: 35%; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background-color: #FAF6F0;">Produktbereich</td>
                          <td style="padding: 12px 15px; border-bottom: 1px solid #E8DCC4; color: #2C251E; font-size: 14px; font-weight: bold;">${product}</td>
                        </tr>
                        ` : ''}
                      </table>
                      
                      <div style="background-color: #FAF6F0; border-left: 4px solid #C81D25; padding: 20px; border-radius: 6px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #1F1B16; font-weight: 700;">Nachricht des Kunden:</h4>
                        <p style="color: #2C251E; font-size: 14.5px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #1F1B16; padding: 25px; text-align: center; border-top: 1px solid #E8DCC4; font-size: 11px; color: #FAF6F0; line-height: 1.6;">
                      Anfrage über <a href="https://homan-madical.de" style="color: #D9A24A; text-decoration: none;">homan-madical.de</a><br>
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
      if (!isKvRecipient) recipientEmail = 'friese.scholz@gmail.com';
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
    let emailTo = recipientEmail;
    let emailBcc = undefined;
    let replyToEmail = data.email;

    if (source === 'immom' && data.type === 'checklist') {
      emailTo = data.email;
      emailBcc = recipientEmail;
      replyToEmail = 'mail@immom.eu';
    }

    if (source === 'homan-madical' || source === 'homann-medical') {
      emailTo = 'contact@homann-medical.de';
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <noreply@scholz-friese-webdesign.de>`,
        to: emailTo,
        bcc: emailBcc,
        reply_to: replyToEmail,
        subject: emailSubject,
        html: emailHtml,
        attachments: data.attachments || [],
      }),
    });

    if (!resendResponse.ok) {
      const errData = await resendResponse.json();
      return new Response(JSON.stringify({ success: false, message: 'Fehler beim E-Mail-Versand über Resend.', error: errData }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Secondary autoresponder email for exposé requests to user
    if (source === 'immom' && data.type === 'expose' && data.email) {
      try {
        const userSubject = `[ImmoM] Ihr angefordertes Exposé: ${data.propertyTitle || 'Immobilie'}`;
        
        let attachments = [];
        let hasPdf = false;
        let isLink = false;
        let pdfUrl = '';

        if (data.exposeUrl) {
          hasPdf = true;
          if (data.exposeUrl.startsWith('data:application/pdf;base64,')) {
            const base64Content = data.exposeUrl.split(';base64,')[1];
            const cleanTitle = (data.propertyTitle || 'Expose_Immobilie').replace(/[^a-zA-Z0-9]/g, '_');
            attachments.push({
              content: base64Content,
              filename: `${cleanTitle}.pdf`
            });
          } else if (data.exposeUrl.startsWith('http')) {
            isLink = true;
            pdfUrl = data.exposeUrl;
          }
        }

        const userHtml = `
          <!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #F7F1E8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #071B33;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F7F1E8; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #E8E8E8; border-top: 4px solid #D9A24A; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
                    <tr>
                      <td style="padding: 30px; border-bottom: 1px solid #E8E8E8; background-color: #071B33; text-align: center;">
                        <h2 style="margin: 0; color: #ffffff; font-family: Georgia, serif; font-size: 22px; font-weight: 400; letter-spacing: 1px;">ImmoM</h2>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #D9A24A; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Exposé & Informationen</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 35px;">
                        <p style="font-size: 16px; line-height: 1.6; color: #071B33; margin: 0 0 20px 0; font-weight: 600;">
                          Guten Tag ${data.name || ''},
                        </p>
                        <p style="font-size: 14.5px; line-height: 1.6; color: #102A4C; margin: 0 0 25px 0;">
                          vielen Dank für Ihr Interesse an der Immobilie <strong>"${data.propertyTitle || ''}"</strong> in ${data.propertyLocation || ''}.
                        </p>
                        
                        ${isLink ? `
                          <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; border-radius: 4px; padding: 20px; margin-bottom: 25px; text-align: left;">
                            <h4 style="margin: 0 0 8px 0; font-size: 15px; color: #071B33; font-weight: 700;">Exposé jetzt als PDF herunterladen</h4>
                            <p style="margin: 0 0 15px 0; font-size: 13.5px; line-height: 1.5; color: #102A4C;">
                              Klicken Sie auf den folgenden Button, um das vollständige Exposé inklusive allen Details als PDF herunterzuladen:
                            </p>
                            <a href="${pdfUrl}" target="_blank" style="display: inline-block; background-color: #071B33; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-size: 14px; font-weight: 700;">PDF-Exposé herunterladen</a>
                          </div>
                        ` : (attachments.length > 0 ? `
                          <div style="background-color: #F7F1E8; border-left: 4px solid #D9A24A; border-radius: 4px; padding: 20px; margin-bottom: 25px; text-align: left;">
                            <h4 style="margin: 0 0 8px 0; font-size: 15px; color: #071B33; font-weight: 700;">Exposé im Anhang</h4>
                            <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #102A4C;">
                              Das vollständige Exposé als PDF-Datei wurde dieser E-Mail direkt als <strong>Anlage beigefügt</strong>. Sie finden die Datei im Anhang.
                            </p>
                          </div>
                        ` : `
                          <p style="font-size: 14px; line-height: 1.6; color: #102A4C; margin: 0 0 25px 0; background-color: #F7F1E8; padding: 15px; border-radius: 6px;">
                            Wir bereiten das Exposé für Sie vor und senden es Ihnen in Kürze zu.
                          </p>
                        `)}

                        <p style="font-size: 14.5px; line-height: 1.65; color: #102A4C; margin: 25px 0 0 0;">
                          Wir werden uns in Kürze persönlich bei Ihnen melden, um eventuelle Fragen zu besprechen und auf Wunsch einen gemeinsamen Besichtigungstermin vor Ort zu vereinbaren.
                        </p>

                        <p style="font-size: 14.5px; line-height: 1.65; color: #102A4C; margin: 20px 0 0 0;">
                          Sollten Sie vorab bereits Fragen haben, erreichen Sie mich jederzeit direkt unter Telefon <strong>05021 - 860 10 01</strong> oder per E-Mail unter <a href="mailto:mail@immom.eu" style="color: #D9A24A; text-decoration: none; font-weight: 600;">mail@immom.eu</a>.
                        </p>

                        <p style="font-size: 14px; line-height: 1.6; color: #102A4C; margin: 30px 0 0 0; font-weight: 600;">
                          Herzliche Grüße,<br>
                          Carsten Meyer
                        </p>
                        <p style="font-size: 12.5px; line-height: 1.5; color: #7a92a3; margin: 5px 0 0 0;">
                          ImmoM / CM-Immobilien<br>
                          Büro: An den Teichen 30, 31608 Marklohe<br>
                          Telefon: 05021 8601001 | E-Mail: mail@immom.eu
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background-color: #071B33; padding: 25px; text-align: center; font-size: 11px; color: #E8E8E8; line-height: 1.6;">
                        Anfrage über <a href="https://immom.de" style="color: #D9A24A; text-decoration: none;">immom.de</a><br>
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

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${fromName} <noreply@scholz-friese-webdesign.de>`,
            to: data.email,
            reply_to: 'mail@immom.eu',
            subject: userSubject,
            html: userHtml,
            attachments: attachments
          }),
        });
      } catch (err) {
        console.error("Error sending user expose email:", err);
      }
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
