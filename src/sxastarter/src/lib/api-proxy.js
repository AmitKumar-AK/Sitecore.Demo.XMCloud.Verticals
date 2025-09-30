/**
 * API Proxy utilities for request validation and error handling
 */

/**
 * Validates incoming API requests
 * @param {import('next').NextApiRequest} req - The request object
 * @throws {Error} If validation fails
 */
export function validateRequest(req) {
  // Rate limiting check (basic)
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers.referer || req.headers.origin || '';

  // Block obvious bot traffic
  const botPatterns = /bot|crawler|spider|scraper/i;
  if (
    botPatterns.test(userAgent) &&
    !referer.includes('localhost') &&
    !referer.includes('vercel.app')
  ) {
    throw new Error('Blocked: Bot traffic detected');
  }

  // Basic request validation
  if (req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    throw new Error(`Method ${req.method} not allowed`);
  }

  // Validate query parameters
  const { page, limit } = req.query;

  if (page && (isNaN(parseInt(page)) || parseInt(page) < 1)) {
    throw new Error('Invalid page parameter');
  }

  if (limit && (isNaN(parseInt(limit)) || parseInt(limit) < 1 || parseInt(limit) > 50)) {
    throw new Error('Invalid limit parameter (must be between 1-50)');
  }

  console.log('✅ Request validation passed:', {
    method: req.method,
    userAgent: userAgent.substring(0, 50) + '...',
    hasReferer: !!referer,
  });
}

/**
 * Handles API errors consistently
 * @param {Error} error - The error object
 * @param {import('next').NextApiResponse} res - The response object
 * @returns {void}
 */
export function handleApiError(error, res) {
  console.error('🚨 API Error:', {
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'),
  });

  // Determine error type and status code
  let statusCode = 500;
  let errorType = 'InternalServerError';

  if (error.message.includes('Bot traffic')) {
    statusCode = 403;
    errorType = 'Forbidden';
  } else if (error.message.includes('not allowed')) {
    statusCode = 405;
    errorType = 'MethodNotAllowed';
  } else if (error.message.includes('Invalid')) {
    statusCode = 400;
    errorType = 'BadRequest';
  } else if (error.message.includes('DummyAPI error')) {
    statusCode = 502;
    errorType = 'BadGateway';
  }

  // Set error response headers
  res.setHeader('X-Error-Type', errorType);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  return res.status(statusCode).json({
    success: false,
    error: {
      type: errorType,
      message: error.message,
      statusCode: statusCode,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `error-${Date.now()}`,
    },
  });
}

/**
 * Logs API requests for debugging
 * @param {import('next').NextApiRequest} req - The request object
 * @param {string} endpoint - The endpoint name
 */
export function logRequest(req, endpoint = 'unknown') {
  console.log(`📝 API Request - ${endpoint}:`, {
    method: req.method,
    url: req.url,
    query: req.query,
    userAgent: req.headers['user-agent']?.substring(0, 50) + '...',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Creates common headers for Sitecore requests
 * @returns {Object} Headers object
 */
export function createSitecoreHeaders() {
  return {
    'Content-Type': 'application/json',
    'app-id': process.env.EXTERNAL_USER_APP_ID,
    'User-Agent': 'Sitecore-NextJS-Proxy/1.0',
  };
}
