/**
 * Vercel Edge-Optimized Users API with Enhanced Console Logging
 */
export const config = {
  runtime: 'nodejs',
  regions: ['iad1', 'sfo1', 'lhr1'], // Multiple regions for global performance
};

// Get Vercel Edge Cache configuration from environment variables
function getEdgeCacheConfig() {
  return {
    // Vercel Edge Cache Configuration
    enabled: process.env.VERCEL_EDGE_CACHE_ENABLED !== 'false',
    ttl: Number.parseInt(process.env.VERCEL_EDGE_CACHE_TTL) || 300, // 5 minutes
    staleTtl: Number.parseInt(process.env.VERCEL_EDGE_CACHE_STALE_TTL) || 600, // 10 minutes
    tags: process.env.VERCEL_EDGE_CACHE_TAGS?.split(',') || ['users', 'api', 'sitecore'],
    // Error handling
    errorTtl: Number.parseInt(process.env.CACHE_ERROR_TTL) || 60,
    // API Configuration
    maxRetries: Number.parseInt(process.env.API_MAX_RETRIES) || 3,
    timeout: Number.parseInt(process.env.API_TIMEOUT) || 10000,
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
    total: 250,
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
        dataReceived: data?.data?.length || 0,
      });

      return data;
    } catch (error) {
      lastError = error;
      logWithTimestamp('error', `API attempt ${attempt} failed`, {
        error: error.message,
        willRetry: attempt < maxRetries,
      });

      if (attempt < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logWithTimestamp('info', `Waiting ${backoffDelay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}

export default async function handler(req, res) {
  const requestStart = Date.now();
  const config = getEdgeCacheConfig();

  logWithTimestamp('config', 'Edge Cache Configuration', config);

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logWithTimestamp('error', 'Missing or invalid Authorization header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Bearer token required',
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const expectedToken = process.env.ADMIN_SECRET || 'your-secret-token-here';

    if (token !== expectedToken) {
      logWithTimestamp('error', 'Invalid Bearer token provided');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid Bearer token',
      });
    }

    logWithTimestamp('success', 'Bearer token validated');

    // Parse query parameters
    const { page = '1', limit = '12', nocache = 'false' } = req.query;
    const pageNum = Number.parseInt(page, 10);
    const limitNum = Number.parseInt(limit, 10);
    const bypassCache = nocache === 'true';

    logWithTimestamp('info', 'Request Parameters', {
      page: pageNum,
      limit: limitNum,
      bypassCache,
      method: req.method,
      url: req.url,
    });

    let responseData;
    let usedMockData = false;
    let apiCallDuration = null;
    const apiAttempts = 0;
    let apiSuccess = false;
    let apiError = null;

    if (process.env.EXTERNAL_USER_APP_URL && process.env.EXTERNAL_USER_APP_ID) {
      try {
        const apiStart = Date.now();
        responseData = await fetchFromExternalAPI(pageNum, limitNum, config);
        apiCallDuration = Date.now() - apiStart;
        apiSuccess = true;
        logWithTimestamp('success', 'Using external API data');
      } catch (error) {
        apiError = error.message;
        logWithTimestamp('warning', 'External API failed, using mock data', {
          error: error.message,
        });
        responseData = generateEdgeMockData(pageNum, limitNum);
        usedMockData = true;
      }
    } else {
      logWithTimestamp('info', 'External API not configured, using mock data');
      responseData = generateEdgeMockData(pageNum, limitNum);
      usedMockData = true;
    }

    const totalDuration = Date.now() - requestStart;

    const totalPages = Math.ceil(responseData.total / limitNum);
    const response = {
      success: true,
      data: {
        data: responseData.data,
        total: responseData.total,
        page: pageNum,
        limit: limitNum,
      },
      pagination: {
        currentPage: pageNum,
        limit: limitNum,
        total: responseData.total,
        totalPages: totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      cache: {
        enabled: config.enabled && !bypassCache,
        ttl: config.ttl,
        staleTtl: config.staleTtl,
        tags: config.tags,
        bypass: bypassCache,
        etag: `W/"${pageNum}-${Date.now()}"`,
      },
      meta: {
        dataSource: usedMockData ? 'mock-data' : 'external-api',
        isWarmupRequest: false,
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        api: {
          duration: apiCallDuration,
          attempts: apiAttempts || 1,
          success: apiSuccess,
          error: apiError,
        },
        version: '1.0.0',
      },
    };

    // Set cache headers
    if (config.enabled && !bypassCache) {
      res.setHeader(
        'Cache-Control',
        `public, s-maxage=${config.ttl}, stale-while-revalidate=${config.staleTtl}`
      );
      res.setHeader('Cache-Tag', config.tags.join(','));
      res.setHeader('X-Vercel-Cache', 'MISS');
      res.setHeader('X-Data-Source', response.meta.dataSource);
      res.setHeader('X-Total-Duration', totalDuration.toString());
      if (apiCallDuration) {
        res.setHeader('X-API-Duration', apiCallDuration.toString());
      }
      logWithTimestamp('cache', 'Cache headers set', {
        'Cache-Control': `s-maxage=${config.ttl}`,
        'Cache-Tag': config.tags.join(','),
      });
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      logWithTimestamp('cache', 'Cache bypassed');
    }

    logWithTimestamp('success', `Request completed in ${totalDuration}ms`, {
      page: pageNum,
      itemsReturned: responseData.data?.length || 0,
      cached: config.enabled && !bypassCache,
      source: response.meta.dataSource,
    });

    return res.status(200).json(response);
  } catch (error) {
    const errorDuration = Date.now() - requestStart;
    logWithTimestamp('error', `Request failed after ${errorDuration}ms`, {
      error: error.message,
      stack: error.stack,
    });

    res.setHeader('Cache-Control', `public, s-maxage=${config.errorTtl}`);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString(),
      cache: {
        enabled: false,
        errorTtl: config.errorTtl,
      },
    });
  }
}
