export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const authHeader = request.headers.get('Authorization') || '';
  const password = authHeader.replace(/^Bearer\s+/i, '').trim();
  const correctPassword = env.ADMIN_PASSWORD || 'sfwebdesign2026';
  const clientPassword = 'nienburg1025';

  if (password !== correctPassword && password !== clientPassword) {
    return new Response(JSON.stringify({ success: false, message: 'Nicht autorisiert.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = '8d2fe320c4134c368f28c18153d4f82d'; // KUNDEN_DB
  const key = 'nachtwaechter_config';

  const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

  try {
    const kvResponse = await fetch(kvUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`
      }
    });

    if (kvResponse.status === 200) {
      const configText = await kvResponse.text();
      return new Response(JSON.stringify({ success: true, config: JSON.parse(configText) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    // ignore
  }

  const defaults = {
    publicTourType: 'default',
    customDates: []
  };

  return new Response(JSON.stringify({ success: true, config: defaults }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const authHeader = request.headers.get('Authorization') || '';
  const password = authHeader.replace(/^Bearer\s+/i, '').trim();
  const correctPassword = env.ADMIN_PASSWORD || 'sfwebdesign2026';
  const clientPassword = 'nienburg1025';

  if (password !== correctPassword && password !== clientPassword) {
    return new Response(JSON.stringify({ success: false, message: 'Nicht autorisiert.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { config } = await request.json();
    if (!config) {
      return new Response(JSON.stringify({ success: false, message: 'Keine Konfiguration übermittelt.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiToken = env.CLOUDFLARE_API_TOKEN;
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = '8d2fe320c4134c368f28c18153d4f82d'; // KUNDEN_DB
    const key = 'nachtwaechter_config';

    const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

    const kvResponse = await fetch(kvUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(config)
    });

    if (kvResponse.ok) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const errText = await kvResponse.text();
      return new Response(JSON.stringify({ success: false, message: 'Fehler beim Speichern in der Cloudflare-Datenbank: ' + errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: 'Verbindungsfehler zur Cloudflare-Datenbank: ' + err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
