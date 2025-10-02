export default function handler(req, res) {
  console.log('Test API called:', req.method, req.url);

  res.status(200).json({
    success: true,
    message: 'API routing is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });
}
