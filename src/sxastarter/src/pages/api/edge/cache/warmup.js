/**
 * Vercel Edge Cache Warmup API
 * Automatically called by Vercel Cron Jobs to pre-populate edge cache
 */

export default async function handler(req, res) {
  const startTime = Date.now();

  try {
    // Verify authorization for cache warmup
    const isAuthorized =
      req.headers['user-agent'] === 'Vercel-Cron/1.0' ||
      req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}` ||
      req.headers['x-vercel-cron'] === '1';

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Cache warmup restricted to cron jobs',
        timestamp: new Date().toISOString(),
      });
    }

    // Get warmup configuration
    const warmupConfig = {
      enabled: process.env.CACHE_WARMUP_ENABLED !== 'false',
      pages: parseInt(process.env.CACHE_WARMUP_PAGES) || 5,
      limit: parseInt(process.env.CACHE_WARMUP_LIMIT) || 12,
      concurrent: parseInt(process.env.CACHE_WARMUP_CONCURRENT) || 3,
      timeout: parseInt(process.env.CACHE_WARMUP_TIMEOUT) || 30000,
    };

    if (!warmupConfig.enabled) {
      return res.status(200).json({
        success: true,
        message: 'Cache warmup is disabled',
        config: warmupConfig,
        timestamp: new Date().toISOString(),
      });
    }

    console.log('🔥 Starting Edge Cache Warmup');
    console.log('Configuration:', warmupConfig);

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    // Create warmup requests for multiple pages
    const warmupTasks = [];

    for (let page = 1; page <= warmupConfig.pages; page++) {
      const warmupUrl = `${baseUrl}/api/edge/users?page=${page}&limit=${warmupConfig.limit}&warmup=true`;

      const task = {
        page,
        url: warmupUrl,
        promise: fetch(warmupUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Vercel-Edge-Cache-Warmup/1.0',
            'X-Cache-Warmup': 'true',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(warmupConfig.timeout),
        })
          .then(async (response) => {
            const result = {
              page,
              url: warmupUrl,
              status: response.status,
              success: response.ok,
              headers: {
                cacheStatus: response.headers.get('X-Edge-Cache'),
                dataSource: response.headers.get('X-Data-Source'),
                duration: response.headers.get('X-Total-Duration'),
              },
            };

            if (response.ok) {
              try {
                const data = await response.json();
                result.itemsCount = data.data?.data?.length || 0;
                result.total = data.data?.total || 0;
                result.dataSource = data.meta?.dataSource;
              } catch (parseError) {
                result.parseError = parseError.message;
              }
            } else {
              try {
                const errorData = await response.text();
                result.error = errorData;
              } catch (e) {
                result.error = `HTTP ${response.status}`;
              }
            }

            return result;
          })
          .catch((error) => {
            return {
              page,
              url: warmupUrl,
              status: 0,
              success: false,
              error: error.message,
              timeout: error.name === 'TimeoutError',
            };
          }),
      };

      warmupTasks.push(task);
    }

    // Execute warmup requests with concurrency control
    const results = [];

    for (let i = 0; i < warmupTasks.length; i += warmupConfig.concurrent) {
      const batch = warmupTasks.slice(i, i + warmupConfig.concurrent);
      console.log(
        `🔥 Processing batch ${Math.floor(i / warmupConfig.concurrent) + 1}, pages ${
          batch[0].page
        }-${batch[batch.length - 1].page}`
      );

      const batchResults = await Promise.all(batch.map((task) => task.promise));
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming the system
      if (i + warmupConfig.concurrent < warmupTasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Calculate statistics
    const totalDuration = Date.now() - startTime;
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalItemsWarmed = results.reduce((sum, r) => sum + (r.itemsCount || 0), 0);
    const timeouts = results.filter((r) => r.timeout).length;

    // Log summary
    console.log('🔥 Edge Cache Warmup Completed');
    console.log(`✅ Successful: ${successful}, ❌ Failed: ${failed}, ⏰ Timeouts: ${timeouts}`);
    console.log(`📊 Total items warmed: ${totalItemsWarmed}`);
    console.log(`⏱️ Total duration: ${totalDuration}ms`);

    // Set response headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Warmup-Success', successful.toString());
    res.setHeader('X-Warmup-Failed', failed.toString());
    res.setHeader('X-Warmup-Duration', totalDuration.toString());

    return res.status(200).json({
      success: true,
      message: 'Edge cache warmup completed',
      statistics: {
        totalPages: warmupConfig.pages,
        successful,
        failed,
        timeouts,
        totalItemsWarmed,
        duration: totalDuration,
        successRate: Math.round((successful / results.length) * 100),
      },
      config: warmupConfig,
      results: results.map((r) => ({
        page: r.page,
        success: r.success,
        status: r.status,
        itemsCount: r.itemsCount,
        dataSource: r.dataSource,
        duration: r.headers?.duration,
        error: r.error,
      })),
      meta: {
        timestamp: new Date().toISOString(),
        baseUrl,
        version: '2.0-edge',
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('🚨 Cache Warmup Error:', error);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Warmup-Error', 'true');

    return res.status(500).json({
      success: false,
      message: 'Cache warmup failed',
      error: {
        message: error.message,
        type: error.name || 'UnknownError',
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration: totalDuration,
        version: '2.0-edge',
      },
    });
  }
}
