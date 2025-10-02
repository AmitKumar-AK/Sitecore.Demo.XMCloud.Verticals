import { validateRequest, handleApiError, createSitecoreHeaders } from '../../../lib/api-proxy';

// Simple in-memory cache for development (will be empty in each serverless function in production)
const devCache = new Map();

function getCacheKey(pageNum, limitNum) {
  return `users_${pageNum}_${limitNum}`;
}

// Get cache configuration from environment variables
function getCacheConfig() {
  return {
    // Default cache time (5 minutes)
    defaultCacheTime: parseInt(process.env.CACHE_DEFAULT_TTL) || 300,
    // Maximum allowed cache time (1 hour)
    maxCacheTime: parseInt(process.env.CACHE_MAX_TTL) || 3600,
    // Minimum allowed cache time (30 seconds)
    minCacheTime: parseInt(process.env.CACHE_MIN_TTL) || 30,
    // Error cache time (1 minute)
    errorCacheTime: parseInt(process.env.CACHE_ERROR_TTL) || 60,
    // Stale-while-revalidate multiplier
    staleMultiplier: parseFloat(process.env.CACHE_STALE_MULTIPLIER) || 2,
    // Enable/disable caching
    enabled: process.env.CACHE_ENABLED !== 'false',
  };
}

// Check development cache (only works locally)
function checkDevCache(cacheKey, cacheTime) {
  if (process.env.NODE_ENV !== 'development') {
    return null; // Don't use in-memory cache in production
  }

  const cached = devCache.get(cacheKey);
  if (cached) {
    const ageInSeconds = (Date.now() - cached.timestamp) / 1000;
    const isValid = ageInSeconds < cacheTime;

    console.log('📊 Dev Cache Check:', {
      key: cacheKey,
      exists: true,
      ageSeconds: Math.round(ageInSeconds),
      maxAgeSeconds: cacheTime,
      isValid: isValid,
    });

    return isValid ? cached : null;
  }

  console.log('📊 Dev Cache Check:', {
    key: cacheKey,
    exists: false,
  });

  return null;
}

// Store in development cache
function setDevCache(cacheKey, data, cacheTime) {
  if (process.env.NODE_ENV !== 'development') {
    return; // Don't use in-memory cache in production
  }

  devCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl: cacheTime,
  });

  console.log('💾 Dev Cache Stored:', {
    key: cacheKey,
    ttl: cacheTime,
    size: devCache.size,
  });
}

// Add this to your API route if not already present
export default async function handler(req, res) {
  const requestStart = Date.now();
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.log('🚀 SERVER: Request received:', {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
      cacheControl: req.headers['cache-control'],
      pragma: req.headers['pragma'],
    },
    timestamp: new Date().toISOString(),
  });

  try {
    // Validate request using your existing validation
    try {
      validateRequest(req);
    } catch (validationError) {
      console.error('❌ Request validation failed:', validationError.message);
      return handleApiError(validationError, res);
    }

    // Get cache configuration
    const cacheConfig = getCacheConfig();

    // Pagination parameters
    const { page = 1, limit = 10, revalidate, nocache = false } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    // Determine cache time from query params or environment config
    let cacheTime = cacheConfig.defaultCacheTime;
    if (revalidate) {
      const requestedCacheTime = parseInt(revalidate, 10);
      cacheTime = Math.min(
        cacheConfig.maxCacheTime,
        Math.max(cacheConfig.minCacheTime, requestedCacheTime)
      );
    }

    const cacheKey = getCacheKey(pageNum, limitNum);
    const bypassCache = nocache === 'true' || !cacheConfig.enabled;

    console.log('=== SERVER: CACHE CONFIGURATION ===');
    console.log('Environment:', isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION');
    console.log('Cache Enabled:', cacheConfig.enabled);
    console.log('Cache Key:', cacheKey);
    console.log('Bypass Cache:', bypassCache);
    console.log('Force Refresh Requested:', !!revalidate);
    console.log('No Cache Parameter:', nocache);
    console.log('Dev Cache Size:', isDevelopment ? devCache.size : 'N/A');

    // Set proper HTTP caching headers FIRST (for production)
    if (!bypassCache && cacheConfig.enabled) {
      const staleWhileRevalidate = Math.round(cacheTime * cacheConfig.staleMultiplier);

      res.setHeader(
        'Cache-Control',
        `public, s-maxage=${cacheTime}, stale-while-revalidate=${staleWhileRevalidate}, max-age=60`
      );
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Tags', 'users,sitecore-content,external-api');

      console.log('✅ HTTP Cache headers set:', {
        cacheControl: `public, s-maxage=${cacheTime}, stale-while-revalidate=${staleWhileRevalidate}`,
        tags: 'users,sitecore-content,external-api',
        note: isDevelopment
          ? 'Headers set but ignored in development'
          : 'Will be used by Vercel Edge',
      });
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      console.log('🚫 Cache disabled - no-cache headers set');
    }

    // ETag-based caching
    const etag = `"users-${pageNum}-${limitNum}"`;
    const clientEtag = req.headers['if-none-match'];

    if (clientEtag === etag && !bypassCache) {
      console.log('🟢 ETAG MATCH - Returning 304 Not Modified');
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache-Status', 'HIT-ETAG');
      return res.status(304).end();
    }

    // Check development cache first (only in dev environment)
    let cachedData = null;
    if (!bypassCache && isDevelopment) {
      cachedData = checkDevCache(cacheKey, cacheTime);
    }

    if (cachedData) {
      console.log('🟢 SERVER: CACHE HIT - Returning cached data');
      console.log('📊 SERVER: Cache details:', {
        key: cacheKey,
        age: Math.round((Date.now() - cachedData.timestamp) / 1000) + 's',
        size: JSON.stringify(cachedData.data).length + ' bytes',
      });

      // Set response headers for cache hit
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache-Status', 'HIT-DEV-CACHE');
      res.setHeader('X-Cache-Key', cacheKey);
      res.setHeader('X-Data-Source', 'dev-cache');

      const totalDuration = Date.now() - requestStart;
      res.setHeader('X-Total-Duration', totalDuration.toString());

      // Update the cache status in the response to reflect the HIT
      const cachedResponse = { ...cachedData.data };
      cachedResponse.cache = {
        ...cachedResponse.cache,
        status: 'HIT-DEV', // Update status to reflect cache hit
        lastFetched: new Date(cachedData.timestamp).toISOString(),
        cacheAge: Math.round((Date.now() - cachedData.timestamp) / 1000),
      };

      console.log('=== RESPONSE SUMMARY ===');
      console.log('Cache Status: HIT (Dev Cache)');
      console.log('Items Returned:', cachedResponse.data?.data?.length || 0);
      console.log('Cache Age:', Math.round((Date.now() - cachedData.timestamp) / 1000), 'seconds');
      console.log('Total Duration:', totalDuration + 'ms');
      console.log('========================');

      return res.status(200).json(cachedResponse);
    } else {
      console.log('🔴 SERVER: CACHE MISS - Making external API call');
      console.log('📡 SERVER: Calling external API...');
    }

    // Make API call
    console.log('🔴 CACHE MISS - Making API call');
    console.log(
      'Reason:',
      isDevelopment ? 'No valid dev cache entry' : 'Production - relying on Vercel Edge Cache'
    );

    const queryParams = new URLSearchParams({
      page: (pageNum - 1).toString(),
      limit: limitNum.toString(),
    });

    // Validate environment variables
    const apiUrl = process.env.EXTERNAL_USER_APP_URL;
    const appId = process.env.EXTERNAL_USER_APP_ID;

    if (!apiUrl || !appId) {
      throw new Error(
        'Missing environment variables: EXTERNAL_USER_APP_URL or EXTERNAL_USER_APP_ID'
      );
    }

    const targetUrl = `${apiUrl}?${queryParams.toString()}`;
    console.log('📡 MAKING API CALL TO:', targetUrl);

    const apiCallStart = Date.now();

    // Use your existing createSitecoreHeaders function
    const headers = createSitecoreHeaders();

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: headers,
    });

    const apiCallDuration = Date.now() - apiCallStart;
    console.log(`⏱️ API call completed in ${apiCallDuration}ms`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error('DummyAPI error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 200),
      });
      throw new Error(`DummyAPI error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    console.log('DummyAPI response:', {
      totalItems: data.total,
      currentPage: pageNum,
      itemsInResponse: data.data?.length,
    });

    // Transform the data to match your interface
    const transformedData = {
      ...data,
      data:
        data.data?.map((user) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          jobTitle: user.title || 'N/A',
          picture: user.picture || 'https://via.placeholder.com/150',
        })) || [],
    };

    const responseData = {
      success: true,
      data: transformedData,
      pagination: {
        currentPage: pageNum,
        limit: limitNum,
        total: data.total || 0,
        totalPages: Math.ceil((data.total || 0) / limitNum),
        hasNext: pageNum < Math.ceil((data.total || 0) / limitNum),
        hasPrev: pageNum > 1,
      },
      cache: {
        status: isDevelopment ? 'MISS-DEV' : 'MISS-PROD',
        enabled: cacheConfig.enabled,
        ttl: cacheTime,
        staleWhileRevalidate: Math.round(cacheTime * cacheConfig.staleMultiplier),
        tags: ['users', 'sitecore-content', 'external-api'],
        etag: etag,
        key: cacheKey,
        strategy: isDevelopment ? 'dev-memory + http-headers' : 'http-headers-only',
        config: {
          defaultTtl: cacheConfig.defaultCacheTime,
          maxTtl: cacheConfig.maxCacheTime,
          minTtl: cacheConfig.minCacheTime,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration: Date.now() - requestStart,
        apiDuration: apiCallDuration,
        dataSource: 'external-api',
        environment: isDevelopment ? 'development' : 'production',
        version: '2.1-hybrid-cache',
      },
    };

    // Store in development cache
    if (!bypassCache && isDevelopment) {
      setDevCache(cacheKey, responseData, cacheTime);
    }

    // Set response headers
    res.setHeader('ETag', etag);
    res.setHeader('X-Cache-Status', isDevelopment ? 'MISS-DEV-CACHED' : 'MISS-PROD');
    res.setHeader('X-API-Call-Duration', apiCallDuration.toString());
    res.setHeader('X-Cache-Key', cacheKey);
    res.setHeader('X-Data-Source', 'external-api');

    const totalDuration = Date.now() - requestStart;
    res.setHeader('X-Total-Duration', totalDuration.toString());

    console.log('=== RESPONSE SUMMARY ===');
    console.log(
      'Cache Status:',
      isDevelopment ? 'MISS (Cached for next request)' : 'MISS (Vercel Edge will cache)'
    );
    console.log('Items Returned:', transformedData.data?.length);
    console.log('Cache TTL Used:', cacheTime);
    console.log('Total Duration:', totalDuration + 'ms');
    console.log('Environment:', isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION');
    console.log('========================');

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('🚨 SERVER: Request failed:', error);
    const totalDuration = Date.now() - requestStart;

    const cacheConfig = getCacheConfig();
    const errorStaleTime = Math.round(cacheConfig.errorCacheTime * cacheConfig.staleMultiplier);

    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheConfig.errorCacheTime}, stale-while-revalidate=${errorStaleTime}`
    );
    res.setHeader('X-Cache-Status', 'ERROR');
    res.setHeader('X-Total-Duration', totalDuration.toString());

    // Use your existing error handler
    return handleApiError(error, res);
  }
}
