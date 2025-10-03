/**
 * Vercel Edge-Optimized Users API with Enhanced Console Logging
 */

// Edge Runtime configuration for better performance
export const config = {
  runtime: 'nodejs',
  regions: ['iad1', 'sfo1', 'lhr1'], // Multiple regions for global performance
};

// Get Vercel Edge Cache configuration from environment variables
function getEdgeCacheConfig() {
  return {
    // Vercel Edge Cache Configuration
    enabled: process.env.VERCEL_EDGE_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.VERCEL_EDGE_CACHE_TTL) || 300, // 5 minutes
    staleTtl: parseInt(process.env.VERCEL_EDGE_CACHE_STALE_TTL) || 600, // 10 minutes
    tags: process.env.VERCEL_EDGE_CACHE_TAGS?.split(',') || ['users', 'api', 'sitecore'],

    // Error handling
    errorTtl: parseInt(process.env.CACHE_ERROR_TTL) || 60,

    // API Configuration
    maxRetries: parseInt(process.env.API_MAX_RETRIES) || 3,
    timeout: parseInt(process.env.API_TIMEOUT) || 10000,
  };
}

// Enhanced logging function
function logWithTimestamp(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const emoji = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    cache: '🗄️',
    api: '📡',
    config: '⚙️',
  };

  console.log(`${emoji[level] || '📝'} [${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Generate mock data with better variety
function generateEdgeMockData(pageNum, limitNum) {
  logWithTimestamp('info', `Generating mock data for page ${pageNum}, limit ${limitNum}`);

  const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
  const positions = ['Manager', 'Senior', 'Lead', 'Director', 'Specialist', 'Coordinator'];

  const mockUsers = Array.from({ length: limitNum }, (_, i) => {
    const userId = `edge-${pageNum}-${String(i + 1).padStart(3, '0')}`;
    const names = [
      { first: 'Alexander', last: 'Johnson', title: 'mr', gender: 'male' },
      { first: 'Emma', last: 'Williams', title: 'ms', gender: 'female' },
      { first: 'Michael', last: 'Brown', title: 'mr', gender: 'male' },
      { first: 'Olivia', last: 'Davis', title: 'ms', gender: 'female' },
      { first: 'William', last: 'Miller', title: 'mr', gender: 'male' },
      { first: 'Sophia', last: 'Wilson', title: 'ms', gender: 'female' },
      { first: 'James', last: 'Moore', title: 'mr', gender: 'male' },
      { first: 'Isabella', last: 'Taylor', title: 'ms', gender: 'female' },
      { first: 'Benjamin', last: 'Anderson', title: 'mr', gender: 'male' },
      { first: 'Charlotte', last: 'Thomas', title: 'ms', gender: 'female' },
    ];

    const nameIndex = ((pageNum - 1) * limitNum + i) % names.length;
    const selectedName = names[nameIndex];
    const department = departments[i % departments.length];
    const position = positions[i % positions.length];

    return {
      id: userId,
      title: selectedName.title,
      firstName: selectedName.first,
      lastName: selectedName.last,
      email: `${selectedName.first.toLowerCase()}.${selectedName.last.toLowerCase()}@sitecore.com`,
      picture: `https://randomuser.me/api/portraits/med/${selectedName.gender}/${(i % 99) + 1}.jpg`,
      jobTitle: `${position} ${department}`,
      department: department,
      location: 'Remote',
      phone: `+1-555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    };
  });

  const result = {
    data: mockUsers,
    total: 250, // Larger dataset for better testing
    page: pageNum - 1,
    limit: limitNum,
    generated: true,
    timestamp: new Date().toISOString(),
  };

  logWithTimestamp('success', `Generated ${mockUsers.length} mock users`, {
    total: result.total,
    page: result.page,
    firstUser: mockUsers[0]?.firstName,
    lastUser: mockUsers[mockUsers.length - 1]?.firstName,
  });

  return result;
}

// Enhanced API call with retry logic and detailed logging
async function fetchFromExternalAPI(pageNum, limitNum, config) {
  const { maxRetries, timeout } = config;
  let lastError;

  logWithTimestamp('api', `Starting API fetch for page ${pageNum}`, {
    limit: limitNum,
    maxRetries,
    timeout: `${timeout}ms`,
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWithTimestamp('api', `API attempt ${attempt}/${maxRetries} for page ${pageNum}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const queryParams = new URLSearchParams({
        page: (pageNum - 1).toString(),
        limit: limitNum.toString(),
      });

      const targetUrl = `${process.env.EXTERNAL_USER_APP_URL}?${queryParams.toString()}`;
      const apiCallStart = Date.now();

      logWithTimestamp('api', `Making request to: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'app-id': process.env.EXTERNAL_USER_APP_ID,
          'Content-Type': 'application/json',
          'User-Agent': 'Sitecore-XMCloud-Edge/1.0',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const apiCallDuration = Date.now() - apiCallStart;

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      logWithTimestamp('success', `API success on attempt ${attempt}`, {
        duration: `${apiCallDuration}ms`,
        status: response.status,
        dataCount: data.data?.length || 0,
        total: data.total,
      });

      return {
        data,
        apiCallDuration,
        attempt,
        success: true,
      };
    } catch (error) {
      lastError = error;
      logWithTimestamp('error', `API attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logWithTimestamp('warning', `Retrying in ${backoffDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  logWithTimestamp('error', `All API attempts failed. Final error: ${lastError.message}`);
  throw lastError;
}

// Add this to your authorization check
const isAuthorized = (req) => {
  // Existing validation checks...

  // Allow internal requests from cache management
  if (req.headers['x-internal-request'] === 'true') {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token === process.env.CRON_SECRET || token === process.env.ADMIN_SECRET;
    }
  }

  // Your existing authorization logic...
  return true; // or your existing validation
};

export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Start request logging
  logWithTimestamp('info', `🚀 NEW REQUEST STARTED`, {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
  });

  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      logWithTimestamp('error', 'Method not allowed', { method: req.method });
      return res.status(405).json({
        success: false,
        message: 'Method Not Allowed - Only GET requests are supported',
      });
    }

    // Get edge cache configuration
    const edgeConfig = getEdgeCacheConfig();
    logWithTimestamp('config', 'Edge cache configuration loaded', edgeConfig);

    // Parse and validate query parameters
    const {
      page = 1,
      limit = 10,
      nocache = false,
      usemock = false,
      warmup = false,
      revalidate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const bypassCache = nocache === 'true' || !edgeConfig.enabled;
    const forceMockData = usemock === 'true';
    const isWarmupRequest = warmup === 'true' || req.headers['x-cache-warmup'] === 'true';

    // Determine cache TTL
    let cacheTtl = edgeConfig.ttl;
    if (revalidate && !isNaN(parseInt(revalidate))) {
      cacheTtl = Math.max(30, Math.min(3600, parseInt(revalidate)));
    }

    const requestConfig = {
      requestId,
      page: pageNum,
      limit: limitNum,
      bypassCache,
      forceMockData,
      isWarmupRequest,
      cacheTtl,
      edgeCacheEnabled: edgeConfig.enabled,
    };

    logWithTimestamp('config', 'Request configuration', requestConfig);

    // Set Vercel Edge Cache headers
    if (edgeConfig.enabled && !bypassCache) {
      const cacheControl = `public, s-maxage=${cacheTtl}, stale-while-revalidate=${edgeConfig.staleTtl}`;
      res.setHeader('Cache-Control', cacheControl);
      res.setHeader('X-Vercel-Cache-Tags', edgeConfig.tags.join(','));
      res.setHeader('X-Edge-Cache', 'enabled');
      res.setHeader('X-Edge-TTL', cacheTtl.toString());

      logWithTimestamp('cache', 'Cache headers set', {
        cacheControl,
        tags: edgeConfig.tags.join(','),
        ttl: cacheTtl,
      });
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('X-Edge-Cache', 'disabled');
      logWithTimestamp('cache', 'Cache disabled or bypassed');
    }

    let data, transformedData;
    let dataSource = 'unknown';
    let apiMetrics = {};

    if (forceMockData) {
      // Force mock data
      logWithTimestamp('info', 'Using mock data (forced by parameter)');
      data = generateEdgeMockData(pageNum, limitNum);
      dataSource = 'mock-forced';
    } else {
      try {
        // Validate environment variables
        if (!process.env.EXTERNAL_USER_APP_URL || !process.env.EXTERNAL_USER_APP_ID) {
          throw new Error(
            'Missing API configuration - EXTERNAL_USER_APP_URL or EXTERNAL_USER_APP_ID not set'
          );
        }

        logWithTimestamp('config', 'Environment variables validated', {
          hasUrl: !!process.env.EXTERNAL_USER_APP_URL,
          hasAppId: !!process.env.EXTERNAL_USER_APP_ID,
          appIdPreview: process.env.EXTERNAL_USER_APP_ID?.substring(0, 8) + '...',
        });

        // Attempt to fetch from external API
        logWithTimestamp('api', 'Starting external API fetch');
        const apiResult = await fetchFromExternalAPI(pageNum, limitNum, edgeConfig);

        data = apiResult.data;
        dataSource = 'external-api';
        apiMetrics = {
          duration: apiResult.apiCallDuration,
          attempts: apiResult.attempt,
          success: true,
        };

        // Set success headers
        res.setHeader('X-API-Success', 'true');
        res.setHeader('X-API-Duration', apiResult.apiCallDuration.toString());
        res.setHeader('X-API-Attempts', apiResult.attempt.toString());

        logWithTimestamp('success', 'External API fetch completed', apiMetrics);
      } catch (apiError) {
        logWithTimestamp('warning', 'External API failed, falling back to mock data', {
          error: apiError.message,
          errorType: apiError.name,
        });

        data = generateEdgeMockData(pageNum, limitNum);
        dataSource = 'mock-fallback';
        apiMetrics = {
          error: apiError.message,
          success: false,
        };

        // Set fallback headers
        res.setHeader('X-API-Success', 'false');
        res.setHeader('X-API-Error', apiError.message);
        res.setHeader('X-Fallback-Used', 'true');
      }
    }

    // Transform data to match interface
    logWithTimestamp('info', 'Transforming data for client');
    transformedData = {
      ...data,
      data:
        data.data?.map((user) => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          jobTitle: user.jobTitle || user.title || 'Team Member',
          picture: user.picture,
          department: user.department,
          location: user.location,
          phone: user.phone,
        })) || [],
    };

    // Calculate metrics
    const totalDuration = Date.now() - startTime;
    const currentTime = new Date().toISOString();

    // Set comprehensive response headers
    res.setHeader('X-Data-Source', dataSource);
    res.setHeader('X-Total-Duration', totalDuration.toString());
    res.setHeader('X-Cache-Tags', edgeConfig.tags.join(','));
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Vary', 'Accept-Encoding');

    // ETag for cache validation
    const etag = `"edge-users-${pageNum}-${limitNum}-${Date.now()}"`;
    res.setHeader('ETag', etag);

    // Special headers for warmup requests
    if (isWarmupRequest) {
      res.setHeader('X-Cache-Warmup', 'processed');
      logWithTimestamp('info', 'Cache warmup request processed');
    }

    // CORS headers for cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const responseMetrics = {
      requestId,
      dataSource,
      itemCount: transformedData.data?.length,
      totalDuration,
      cacheTtl,
      success: true,
    };

    logWithTimestamp('success', '✅ REQUEST COMPLETED SUCCESSFULLY', responseMetrics);

    // Return successful response
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
        enabled: edgeConfig.enabled,
        ttl: cacheTtl,
        staleTtl: edgeConfig.staleTtl,
        tags: edgeConfig.tags,
        bypass: bypassCache,
        etag: etag,
      },
      meta: {
        requestId,
        dataSource,
        isWarmupRequest,
        timestamp: currentTime,
        duration: totalDuration,
        api: apiMetrics,
        version: '2.0-edge-logging',
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logWithTimestamp('error', '🚨 REQUEST FAILED', {
      requestId,
      error: error.message,
      errorType: error.name,
      duration: totalDuration,
      stack: error.stack,
    });

    // Set error caching headers
    const edgeConfig = getEdgeCacheConfig();
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${edgeConfig.errorTtl}, stale-while-revalidate=120`
    );
    res.setHeader('X-Edge-Cache', 'error');
    res.setHeader('X-Error', 'true');
    res.setHeader('X-Total-Duration', totalDuration.toString());
    res.setHeader('X-Request-ID', requestId);

    return res.status(500).json({
      success: false,
      message: 'Edge API Error',
      error: {
        message: error.message,
        type: error.name || 'UnknownError',
        requestId,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        version: '2.0-edge-logging',
      },
    });
  }
}
