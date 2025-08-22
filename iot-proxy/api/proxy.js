export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Extract endpoint from URL path
    const urlPath = req.url || '/health';
    const endpoint = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
    
    // Your Render backend URL
    const renderBaseUrl = 'https://iot-monitoring-backend-sgba.onrender.com';
    const targetUrl = `${renderBaseUrl}/${endpoint}`;
    
    console.log(`Proxying ${req.method} to: ${targetUrl}`);
    
    const requestOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'IoT-Proxy/1.0'
      }
    };
    
    if (req.method === 'POST' || req.method === 'PUT') {
      if (req.body) {
        requestOptions.body = JSON.stringify(req.body);
      }
    }
    
    const response = await fetch(targetUrl, requestOptions);
    const data = await response.text();
    
    res.status(response.status).send(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy request failed',
      message: error.message 
    });
  }
}
