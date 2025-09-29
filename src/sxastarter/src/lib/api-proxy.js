// Security utility to validate and sanitize requests
export const validateRequest = (req) => {
  // Validate request method
  const allowedMethods = ['GET', 'POST'];
  if (!allowedMethods.includes(req.method)) {
    throw new Error('Method not allowed');
  }

  // Validate headers
  const requiredHeaders = ['user-agent'];
  for (const header of requiredHeaders) {
    if (!req.headers[header]) {
      throw new Error(`Missing required header: ${header}`);
    }
  }

  return true;
};

export const createSitecoreHeaders = () => ({
  'Content-Type': 'application/json',
  'app-id': process.env.EXTERNAL_USER_APP_ID,
  'User-Agent': 'Sitecore-NextJS-Proxy/1.0',
});

export const handleApiError = (error, res) => {
  console.error('API Proxy Error:', error);

  if (error.message === 'Method not allowed') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (error.message.includes('Missing required header')) {
    return res.status(400).json({ error: 'Bad request' });
  }

  return res.status(500).json({ error: 'Internal server error' });
};
