export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

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
      return new Response(configText, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    // ignore
  }

  // Fallback default
  const defaults = {
    publicTourType: 'default',
    customDates: []
  };

  return new Response(JSON.stringify(defaults), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
