export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Auth check
  const authHeader = request.headers.get('Authorization') || '';
  const password = authHeader.replace(/^Bearer\s+/i, '').trim();
  const correctPassword = env.ADMIN_PASSWORD || 'sfwebdesign2026';

  if (password !== correctPassword) {
    return new Response(JSON.stringify({ success: false, message: 'Nicht autorisiert.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch config from KV
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = '8d2fe320c4134c368f28c18153d4f82d'; // KUNDEN_DB
  const key = 'email_config';

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
    // Log error, fall back to default
  }

  // Fallback defaults
  const defaults = {
    "Stephan-van-Hausen": {
      "name": "Stephan van Hausen (Nachtwächter Nienburg)",
      "email": "info@nienburger-nachtwaechter.de"
    },
    "elementbau-nienburg": {
      "name": "Elementbau Nienburg",
      "email": "info@elementbau-ni.de"
    },
    "bestattungen-eberhardt": {
      "name": "Bestattungen Eberhardt",
      "email": "info@bestattungen-eberhardt.de"
    },
    "fm-freie-rednerin": {
      "name": "Finnja Marie (Freie Rednerin)",
      "email": "finnjamariesch@t-online.de"
    },
    "immom": {
      "name": "ImmoM (Immobilien)",
      "email": "friese.scholz@gmail.com"
    },
    "Rodes-Hotel": {
      "name": "Rodes Hotel",
      "email": "info@rodes-hotel.de"
    },
    "Bickbeernhof-Brokeloh": {
      "name": "Bickbeernhof Brokeloh",
      "email": "friese.scholz@gmail.com"
    }
  };

  return new Response(JSON.stringify({ success: true, config: defaults }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const action = url.pathname.split('/').pop();

  if (action === 'login') {
    const { password } = await request.json();
    const correctPassword = env.ADMIN_PASSWORD || 'sfwebdesign2026';

    if (password === correctPassword) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, message: 'Falsches Passwort.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Update Config action
  const authHeader = request.headers.get('Authorization') || '';
  const password = authHeader.replace(/^Bearer\s+/i, '').trim();
  const correctPassword = env.ADMIN_PASSWORD || 'sfwebdesign2026';

  if (password !== correctPassword) {
    return new Response(JSON.stringify({ success: false, message: 'Nicht autorisiert.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
  const key = 'email_config';

  const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

  try {
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
