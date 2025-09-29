import { validateRequest, handleApiError } from '../../../lib/api-proxy';

// Simple in-memory cache for demonstration (use Redis/external cache in production)
const cache = new Map();
const CACHE_PREFIX = 'users_';

function getCacheKey(pageNum, limitNum) {
  return `${CACHE_PREFIX}${pageNum}_${limitNum}`;
}

function isCacheValid(cacheEntry, cacheTime) {
  if (!cacheEntry) return false;
  const age = Date.now() - cacheEntry.timestamp;
  return age < cacheTime * 1000; // cacheTime is in seconds
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

export default async function handler(req, res) {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    // Validate request
    validateRequest(req);

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
      // Ensure cache time is within allowed bounds
      cacheTime = Math.min(
        cacheConfig.maxCacheTime,
        Math.max(cacheConfig.minCacheTime, requestedCacheTime)
      );
    }

    const cacheKey = getCacheKey(pageNum, limitNum);
    const bypassCache = nocache === 'true' || !cacheConfig.enabled;

    console.log('=== CACHE CONFIGURATION ===');
    console.log('Cache Enabled:', cacheConfig.enabled);
    console.log('Default Cache Time:', cacheConfig.defaultCacheTime);
    console.log('Current Cache Time:', cacheTime);
    console.log('Cache Key:', cacheKey);
    console.log('Bypass Cache:', bypassCache);

    // Check cache first (unless bypassed or disabled)
    let cacheEntry = null;
    let cacheHit = false;

    if (!bypassCache) {
      cacheEntry = cache.get(cacheKey);
      cacheHit = isCacheValid(cacheEntry, cacheTime);

      console.log('Cache Entry Exists:', !!cacheEntry);
      console.log('Cache Entry Valid:', cacheHit);

      if (cacheEntry) {
        const age = Math.round((Date.now() - cacheEntry.timestamp) / 1000);
        console.log('Cache Age (seconds):', age);
        console.log('Cache Max Age (seconds):', cacheTime);
      }
    }

    let data, transformedData;

    if (cacheHit) {
      // CACHE HIT - Return cached data
      console.log('🟢 CACHE HIT - Returning cached data, NO API call made');
      data = cacheEntry.data;
      transformedData = cacheEntry.transformedData;

      // Set cache hit headers
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader(
        'X-Cache-Age',
        Math.round((Date.now() - cacheEntry.timestamp) / 1000).toString()
      );
    } else {
      // CACHE MISS - Fetch from API
      console.log('🔴 CACHE MISS - Making API call to DummyAPI');

      const queryParams = new URLSearchParams({
        page: (pageNum - 1).toString(),
        limit: limitNum.toString(),
      });

      const targetUrl = `${process.env.EXTERNAL_USER_APP_URL}?${queryParams.toString()}`;

      console.log('📡 MAKING API CALL TO:', targetUrl);
      const apiCallStart = Date.now();

      // Enhanced fetch with better error handling and logging
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'app-id': process.env.EXTERNAL_USER_APP_ID,
          'Content-Type': 'application/json',
          'User-Agent': 'Sitecore-XMCloud-Verticals/1.0',
        },
      });

      const apiCallDuration = Date.now() - apiCallStart;
      console.log(`⏱️ API call completed in ${apiCallDuration}ms`);

      if (!response.ok) {
        console.error('DummyAPI error:', response.status, response.statusText);
        throw new Error(`DummyAPI error: ${response.status} - ${response.statusText}`);
      }

      data = await response.json();
      console.log('DummyAPI response:', {
        totalItems: data.total,
        currentPage: pageNum,
        itemsInResponse: data.data?.length,
      });

      // Transform the data to match your interface
      transformedData = {
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

      // Store in cache (only if caching is enabled)
      if (cacheConfig.enabled) {
        cache.set(cacheKey, {
          data,
          transformedData,
          timestamp: Date.now(),
        });

        console.log('💾 Data cached with key:', cacheKey);
      } else {
        console.log('💾 Caching disabled - Data not cached');
      }

      // Set cache miss headers
      res.setHeader('X-Cache-Status', 'MISS');
      res.setHeader('X-API-Call-Duration', apiCallDuration.toString());
    }

    // Enhanced caching headers with environment-based configuration
    const staleWhileRevalidate = Math.round(cacheTime * cacheConfig.staleMultiplier);
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheTime}, stale-while-revalidate=${staleWhileRevalidate}`
    );
    res.setHeader('X-Cache-Tags', 'users,sitecore-content,external-api');
    res.setHeader('X-Cache-Revalidate', cacheTime.toString());
    res.setHeader('X-Cache-Key', cacheKey);
    res.setHeader(
      'X-Cache-Config',
      JSON.stringify({
        enabled: cacheConfig.enabled,
        defaultTtl: cacheConfig.defaultCacheTime,
        currentTtl: cacheTime,
        staleMultiplier: cacheConfig.staleMultiplier,
      })
    );
    res.setHeader('Vary', 'Accept-Encoding');

    // Add ETag for better caching
    const etag = `"users-${pageNum}-${limitNum}-${cacheEntry?.timestamp || Date.now()}"`;
    res.setHeader('ETag', etag);

    console.log('=== RESPONSE SUMMARY ===');
    console.log('Cache Status:', cacheHit ? 'HIT' : 'MISS');
    console.log('Items Returned:', transformedData.data?.length);
    console.log('Cache TTL Used:', cacheTime);
    console.log('========================');

    return res.status(200).json({
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
        status: cacheHit ? 'HIT' : 'MISS',
        enabled: cacheConfig.enabled,
        revalidate: cacheTime,
        staleWhileRevalidate: staleWhileRevalidate,
        tags: ['users', 'sitecore-content', 'external-api'],
        etag: etag,
        key: cacheKey,
        age: cacheEntry ? Math.round((Date.now() - cacheEntry.timestamp) / 1000) : 0,
        config: {
          defaultTtl: cacheConfig.defaultCacheTime,
          maxTtl: cacheConfig.maxCacheTime,
          minTtl: cacheConfig.minCacheTime,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Users API Error:', error);

    // Get cache config for error handling
    const cacheConfig = getCacheConfig();

    // Set error caching with environment-based configuration
    const errorStaleTime = Math.round(cacheConfig.errorCacheTime * cacheConfig.staleMultiplier);
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheConfig.errorCacheTime}, stale-while-revalidate=${errorStaleTime}`
    );
    res.setHeader('X-Cache-Status', 'ERROR');

    return handleApiError
      ? handleApiError(error, res)
      : res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
  }
}
