/**
 * Vercel Edge Cache Management API
 * Provides cache inspection, purging, and revalidation capabilities
 */

export default async function handler(req, res) {
  const startTime = Date.now();

  try {
    // Verify authorization
    const authHeader = req.headers.authorization;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid admin credentials',
        timestamp: new Date().toISOString(),
      });
    }

    const { action = 'status', pages, tags, force = false } = req.body || req.query;
    const method = req.method;

    console.log('🛠️ Cache Management Request:', { method, action, pages, tags, force });

    // Fix the baseUrl detection
    const getBaseUrl = () => {
      // Priority order for base URL detection
      if (process.env.VERCEL_URL && process.env.VERCEL_ENV === 'production') {
        return `https://${process.env.VERCEL_URL}`;
      }

      // Use your actual domain for production
      if (process.env.VERCEL_ENV === 'production') {
        return 'https://ak-xmc-live-services.vercel.app';
      }

      // For preview and development
      if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
      }

      return 'http://localhost:3000';
    };

    const baseUrl = getBaseUrl();

    switch (action) {
      case 'status': {
        // Get cache status for multiple endpoints
        const checkUrls = [
          `${baseUrl}/api/edge/users?page=1&limit=10`,
          `${baseUrl}/api/edge/users?page=2&limit=10`,
          `${baseUrl}/api/edge/users?page=3&limit=10`,
        ];

        const statusChecks = await Promise.all(
          checkUrls.map(async (url) => {
            try {
              const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                  'User-Agent': 'Cache-Management/1.0',
                },
              });

              return {
                url,
                status: response.status,
                headers: {
                  cacheControl: response.headers.get('Cache-Control'),
                  etag: response.headers.get('ETag'),
                  edgeCache: response.headers.get('X-Edge-Cache'),
                  dataSource: response.headers.get('X-Data-Source'),
                  cacheTags: response.headers.get('X-Cache-Tags'),
                },
              };
            } catch (error) {
              return {
                url,
                error: error.message,
                status: 0,
              };
            }
          })
        );

        return res.status(200).json({
          success: true,
          action: 'status',
          cacheStatus: statusChecks,
          meta: {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
          },
        });
      }

      case 'purge': {
        if (method !== 'POST') {
          res.setHeader('Allow', ['POST']);
          return res.status(405).json({
            success: false,
            message: 'Method Not Allowed - Use POST for purge operations',
          });
        }

        // Purge specific pages or all pages
        const pagesToPurge = pages || [1, 2, 3, 4, 5];
        const purgeResults = [];

        // Replace the problematic JSON parsing section (around lines 120-140)
        for (const page of pagesToPurge) {
          const purgeUrl = `${baseUrl}/api/edge/users?page=${page}&limit=12&nocache=true&revalidate=${Date.now()}`;
          
          console.log(`🔄 Attempting to purge page ${page}: ${purgeUrl}`);

          try {
            const response = await fetch(purgeUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Vercel-Cache-Management/1.0',
                'Accept': 'application/json',
                'X-Cache-Purge': 'true',
                'X-Internal-Request': 'true',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
              },
              signal: AbortSignal.timeout(15000),
            });

            console.log(`📊 Response for page ${page}:`, {
              status: response.status,
              statusText: response.statusText,
              contentType: response.headers.get('content-type'),
              url: purgeUrl
            });

            // Fix: Only parse JSON once and handle errors properly
            let responseData = null;
            let parseError = null;

            try {
              // Clone the response since it can only be read once
              const responseClone = response.clone();
              const responseText = await responseClone.text();
              
              console.log(`📋 Raw response for page ${page} (first 200 chars):`, 
                responseText.substring(0, 200)
              );

              // Check if it's actually JSON
              if (responseText.trim().startsWith('{') || responseText.trim().startsWith('[')) {
                responseData = JSON.parse(responseText);
                console.log(`✅ JSON parsed successfully for page ${page}:`, {
                  success: responseData.success,
                  dataCount: responseData.data?.data?.length,
                  cacheBypass: responseData.cache?.bypass
                });
              } else {
                parseError = `Response is not JSON. Content: ${responseText.substring(0, 100)}...`;
                console.log(`⚠️ Non-JSON response for page ${page}:`, parseError);
              }
              
            } catch (jsonError) {
              parseError = `JSON parse error: ${jsonError.message}`;
              console.error(`❌ JSON parse error for page ${page}:`, parseError);
            }

            const newEtag = response.headers.get('ETag');

            purgeResults.push({
              page,
              url: purgeUrl,
              status: response.status,
              success: response.ok,
              newEtag,
              dataCount: responseData?.data?.data?.length || 0,
              cacheBypass: responseData?.cache?.bypass || false,
              parseError
            });

            console.log(`${response.ok ? '✅' : '❌'} Page ${page} result: ${response.status} ${response.ok ? 'SUCCESS' : 'FAILED'}`);
            
          } catch (error) {
            console.error(`❌ Network error for page ${page}:`, error.message);
            purgeResults.push({
              page,
              url: purgeUrl,
              status: 0,
              success: false,
              error: error.message,
              newEtag: null,
              dataCount: 0,
              cacheBypass: false
            });
          }
        }

        return res.status(200).json({
          success: true,
          action: 'purge',
          purged: {
            pages: pagesToPurge,
            tags: tags || [],
            force,
          },
          results: purgeResults,
          meta: {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
          },
        });
      }

      case 'revalidate': {
        // Trigger revalidation for specific pages
        const pagesToRevalidate = pages || [1, 2, 3];
        const revalidationResults = [];

        for (const page of pagesToRevalidate) {
          const revalidateUrl = `${baseUrl}/api/edge/users?page=${page}&limit=12&revalidate=1`;

          try {
            const response = await fetch(revalidateUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Cache-Revalidate/1.0',
                'X-Cache-Revalidate': 'true',
              },
            });

            const result = {
              page,
              url: revalidateUrl,
              status: response.status,
              success: response.ok,
              headers: {
                cacheStatus: response.headers.get('X-Edge-Cache'),
                dataSource: response.headers.get('X-Data-Source'),
                duration: response.headers.get('X-Total-Duration'),
              },
            };

            if (response.ok) {
              const data = await response.json();
              result.itemsCount = data.data?.data?.length || 0;
              result.dataSource = data.meta?.dataSource;
            }

            revalidationResults.push(result);
          } catch (error) {
            revalidationResults.push({
              page,
              success: false,
              error: error.message,
            });
          }
        }

        return res.status(200).json({
          success: true,
          action: 'revalidate',
          revalidated: {
            pages: pagesToRevalidate,
            force,
          },
          results: revalidationResults,
          meta: {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
          },
        });
      }

      case 'warmup': {
        // Trigger manual cache warmup
        const warmupUrl = `${baseUrl}/api/edge/cache/warmup`;

        try {
          const response = await fetch(warmupUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${process.env.CRON_SECRET || 'manual-warmup'}`,
              'User-Agent': 'Manual-Warmup/1.0',
            },
          });

          const warmupData = await response.json();

          return res.status(200).json({
            success: true,
            action: 'warmup',
            warmup: warmupData,
            meta: {
              timestamp: new Date().toISOString(),
              duration: Date.now() - startTime,
            },
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            action: 'warmup',
            error: error.message,
            meta: {
              timestamp: new Date().toISOString(),
              duration: Date.now() - startTime,
            },
          });
        }
      }

      default: {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Supported actions: status, purge, revalidate, warmup',
          availableActions: ['status', 'purge', 'revalidate', 'warmup'],
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error('🚨 Cache Management Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Cache management operation failed',
      error: {
        message: error.message,
        type: error.name || 'UnknownError',
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      },
    });
  }
}
