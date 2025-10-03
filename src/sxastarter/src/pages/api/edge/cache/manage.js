// Cache Management API - Purges Vercel Edge Cache
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Bearer token required in Authorization header',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, pages = [], tags = [], force = false, reason } = body;

    console.log('🛠️ Cache Management Request:', {
      method: req.method,
      action,
      pages,
      tags,
      force,
      reason,
    });

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Action is required (purge, revalidate, etc.)' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Get base URL from request
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const results = [];

    // Process page-based purging
    if (pages && pages.length > 0) {
      for (const page of pages) {
        console.log(`🔄 Attempting to purge page ${page}`);

        const timestamp = Date.now();
        const pageUrl = `${baseUrl}/api/edge/users?page=${page}&limit=12&nocache=true&revalidate=${timestamp}`;

        try {
          const response = await fetch(pageUrl, {
            method: 'GET',
            headers: {
              Authorization: authHeader, // Forward the Bearer token
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
          });

          console.log(`📊 Response for page ${page}:`, {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type'),
            url: pageUrl,
          });

          const contentType = response.headers.get('content-type') || '';
          let data = null;
          let parseError = null;

          // Try to parse JSON response
          if (contentType.includes('application/json')) {
            try {
              data = await response.json();
              console.log(`✅ Successfully parsed JSON for page ${page}`);
            } catch (e) {
              parseError = `Failed to parse JSON: ${e.message}`;
              console.log(`⚠️ JSON parse error for page ${page}:`, parseError);
            }
          } else {
            const text = await response.text();
            parseError = `Response is not JSON. Content: ${text.substring(0, 100)}...`;
            console.log(`⚠️ Non-JSON response for page ${page}:`, parseError);
          }

          const result = {
            page,
            url: pageUrl,
            status: response.status,
            success: response.ok,
            newEtag: response.headers.get('etag'),
            dataCount: data?.data?.length || 0,
            cacheBypass: response.headers.get('x-vercel-cache') === 'MISS',
            parseError,
            authHeaderSent: authHeader.substring(0, 10) + '***', // Log partial token for debugging
            contentType,
          };

          results.push(result);
          console.log(
            `${response.ok ? '✅' : '❌'} Page ${page} result: ${response.status} ${
              response.ok ? 'SUCCESS' : 'FAILED'
            }`
          );
        } catch (error) {
          console.error(`❌ Error purging page ${page}:`, error);
          results.push({
            page,
            url: pageUrl,
            status: 500,
            success: false,
            error: error.message,
          });
        }
      }
    }

    // Process tag-based purging (if needed)
    if (tags && tags.length > 0) {
      console.log('🏷️ Tag-based purging not yet implemented');
      // Implement tag-based cache purging here if needed
    }

    const response = {
      success: true,
      action,
      purged: {
        pages,
        tags,
        force,
      },
      results,
      authUsed: authHeader.substring(0, 10) + '***', // Show partial token for debugging
      baseUrl,
      meta: {
        timestamp: new Date().toISOString(),
        duration: Date.now() - Date.now(),
      },
    };

    console.log('✅ Cache management completed:', {
      totalPages: pages.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Cache management error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
