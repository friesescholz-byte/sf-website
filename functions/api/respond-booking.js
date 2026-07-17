
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const action = url.searchParams.get('action');
  const email = url.searchParams.get('email');
  const name = url.searchParams.get('name');
  const date = url.searchParams.get('date');
  const time = url.searchParams.get('time');
  const tourType = url.searchParams.get('tourType');
  const cost = url.searchParams.get('cost');
  const sig = url.searchParams.get('sig');

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. Inputs validieren
  if (!action || !email || !name || !date || !sig) {
    return new Response("Fehlende Pflichtparameter.", { status: 400, headers: corsHeaders });
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

  // 2. Signatur validieren
  const resendApiKey = env.RESEND_API_KEY;
  const secretKey = resendApiKey || 'stephan-secret';
  const tokenData = `${action}|${email}|${date}|${time || ''}|${cost}`;
  
  const expectedSig = await generateSignature(secretKey, tokenData);
  if (sig !== expectedSig) {
    return new Response("Ungültige Signatur. Der Link ist ungültig, manipuliert oder abgelaufen.", { status: 400, headers: corsHeaders });
  }

  // 3. E-Mail bauen
  let subject, emailHtml;
  const isPublicTour = tourType && (tourType.includes('Öffentliche') || tourType.includes('öffentliche'));
  
  if (action === 'accept') {
    subject = isPublicTour 
      ? `Teilnahmebestätigung: Öffentliche Nachtwächter-Führung am ${date}`
      : `Bestätigung Ihrer Nachtwächter-Führung am ${date}`;

    const introText = isPublicTour
      ? `vielen Dank für Ihre Anmeldung! Ich freue mich sehr über Ihre Teilnahme und bestätige Ihnen hiermit Ihre Plätze für die öffentliche Nachtwächter-Führung.`
      : `vielen Dank für Ihre Buchungsanfrage! Ich freue mich sehr über Ihr Interesse und bestätige Ihnen hiermit Ihren Wunschtermin für die Nachtwächter-Führung.`;

    const detailsTitle = isPublicTour ? `Details Ihrer Anmeldung:` : `Details Ihrer Buchung:`;

    emailHtml = `
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
                      ${introText}
                    </p>
                    
                    <h3 style="color: #d9a24a; font-size: 13px; text-transform: uppercase; margin-bottom: 15px; font-weight: 600; letter-spacing: 0.05em;">${detailsTitle}</h3>
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px; border-collapse: collapse; border: 1px solid rgba(255, 255, 255, 0.05);">
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; width: 40%; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Termin</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${date}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Uhrzeit</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">${time} Uhr</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Treffpunkt</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee; font-weight: bold;">Lange Straße (Höhe Cup&amp;Cino)</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Führungstyp</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #faf6ee;">${tourType}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Historisches Gewand</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #10b981; font-weight: bold;">Inklusive</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">Preis</td>
                        <td style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); color: #d9a24a; font-weight: bold; font-size: 16px;">${cost},00 €</td>
                      </tr>
                    </table>
                    
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
                      Wir treffen uns am vereinbarten Treffpunkt (Lange Straße, Höhe Cup&amp;Cino). Bitte seien Sie ca. 5–10 Minuten vor Beginn der Führung vor Ort. Falls Sie Fragen haben oder sich die Personenzahl ändert, schreiben Sie mir einfach eine E-Mail an <a href="mailto:Info@nienburger-nachtwaechter.de" style="color: #d9a24a; text-decoration: none;">Info@nienburger-nachtwaechter.de</a>.
                    </p>
                    
                    <p style="color: #faf6ee; font-size: 15px; font-weight: bold; margin-bottom: 5px;">Ich freue mich auf eine spannende Zeitreise mit Ihnen!</p>
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
  } else {
    subject = isPublicTour
      ? `Rückmeldung zu Ihrer Anmeldung: Öffentliche Nachtwächter-Führung`
      : `Rückmeldung zu Ihrer Buchungsanfrage – Nienburger Nachtwächter`;

    const rejectIntro = isPublicTour
      ? `vielen Dank für Ihre Anmeldung zur öffentlichen Nachtwächter-Führung am ${date} um ${time} Uhr.`
      : `vielen Dank für Ihre Anfrage zu einer Nachtwächter-Führung am ${date} um ${time} Uhr.`;

    const rejectReason = isPublicTour
      ? `Leider muss ich Ihnen mitteilen, dass für diesen Termin keine Plätze mehr verfügbar sind oder die Führung aus organisatorischen Gründen abgesagt werden muss.`
      : `Leider muss ich Ihnen mitteilen, dass dieser Wunschtermin aus organisatorischen Gründen oder wegen einer Terminüberschneidung bereits belegt ist.`;

    const rejectAlternative = isPublicTour
      ? `Gerne können Sie über meine Website <a href="https://nienburger-nachtwaechter.de" style="color: #d9a24a; text-decoration: none; font-weight: bold;">nienburger-nachtwaechter.de</a> einen alternativen Termin buchen oder mich direkt kontaktieren.`
      : `Gerne können Sie über meine Website <a href="https://nienburger-nachtwaechter.de" style="color: #d9a24a; text-decoration: none; font-weight: bold;">nienburger-nachtwaechter.de</a> einen alternativen Wunschtermin anfragen oder mich direkt per Telefon oder E-Mail kontaktieren, um einen passenden Ausweichtermin zu vereinbaren.`;

    emailHtml = `
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
                      ${rejectIntro}
                    </p>
                    
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
                      ${rejectReason}
                    </p>
                    
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 25px;">
                      ${rejectAlternative}
                    </p>
                    
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
  }

  // 4. Über Resend senden
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `Stephan van Hausen <noreply@scholz-friese-webdesign.de>`,
      to: email,
      reply_to: 'Info@nienburger-nachtwaechter.de',
      subject: subject,
      html: emailHtml,
    }),
  });

  if (!resendResponse.ok) {
    const errData = await resendResponse.json();
    return new Response(`Fehler beim Senden über Resend: ${JSON.stringify(errData)}`, { status: 500, headers: corsHeaders });
  }

  // 5. Bestätigungseite für Admin ausgeben
  return new Response(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Anfrage bearbeitet - Nienburger Nachtwächter</title>
      <style>
        body {
          background-color: #07090d;
          color: #faf6ee;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          text-align: center;
        }
        .container {
          background-color: #131722;
          border: 1px solid rgba(217, 162, 74, 0.2);
          border-radius: 8px;
          padding: 40px 30px;
          max-width: 480px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        h1 {
          font-family: Georgia, serif;
          color: #d9a24a;
          font-size: 24px;
          margin-top: 0;
        }
        p {
          color: #94a3b8;
          font-size: 16px;
          line-height: 1.6;
        }
        .icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        .btn {
          display: inline-block;
          margin-top: 25px;
          background-color: #d9a24a;
          color: #07090d;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 4px;
          font-weight: bold;
          transition: background-color 0.2s;
        }
        .btn:hover {
          background-color: #c48f3b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${action === 'accept' ? '🏛️' : '❌'}</div>
        <h1>Anfrage ${action === 'accept' ? 'bestätigt!' : 'abgelehnt.'}</h1>
        <p>
          Die Buchungsanfrage von <strong>${name}</strong> am ${date} um ${time} Uhr wurde erfolgreich ${action === 'accept' ? 'angenommen und bestätigt' : 'abgelehnt'}.
        </p>
        <p>
          Eine entsprechende E-Mail wurde an den Kunden (<strong>${email}</strong>) gesendet.
        </p>
        <a href="https://nienburger-nachtwaechter.de" class="btn">Zurück zur Website</a>
      </div>
    </body>
    </html>
  `, {
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders
    }
  });
}
