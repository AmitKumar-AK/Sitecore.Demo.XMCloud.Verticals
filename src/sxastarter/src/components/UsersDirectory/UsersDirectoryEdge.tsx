import React, { useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  picture?: string;
  department?: string;
  location?: string;
  phone?: string;
}

interface CacheHeaders {
  vercelCache: string | null;
  edgeCache: string | null;
  cacheControl: string | null;
  dataSource: string | null;
  apiDuration: string | null;
  totalDuration: string | null;
  requestId: string | null;
  etag: string | null;
  cacheAge: string | null;
  edgeTtl: string | null;
}

interface PerformanceMetric {
  timestamp: string;
  page: number;
  requestDuration: number;
  serverDuration: number;
  apiDuration: number | null;
  cacheStatus: string;
  dataSource: string;
  isCacheHit: boolean;
  itemsReturned: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    data: User[];
    total: number;
    page: number;
    limit: number;
  };
  pagination: {
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    staleTtl: number;
    tags: string[];
    bypass: boolean;
    etag: string;
  };
  meta: {
    dataSource: string;
    isWarmupRequest: boolean;
    timestamp: string;
    duration: number;
    api: {
      duration?: number;
      attempts?: number;
      success?: boolean;
      error?: string;
    };
    version: string;
  };
}

const UsersDirectoryEdge = (): JSX.Element => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [cacheInfo, setCacheInfo] = useState<ApiResponse['cache'] | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [freshMode, setFreshMode] = useState(false); // Add fresh mode tracking

  // Updated logCacheAnalysis function
  const logCacheAnalysis = useCallback(
    (response: Response, data: ApiResponse, requestStart: number) => {
      const requestDuration = Date.now() - requestStart;

      // Extract cache-related headers
      const cacheHeaders: CacheHeaders = {
        vercelCache: response.headers.get('X-Vercel-Cache'),
        edgeCache: response.headers.get('X-Edge-Cache'),
        cacheControl: response.headers.get('Cache-Control'),
        dataSource: response.headers.get('X-Data-Source'),
        apiDuration: response.headers.get('X-API-Duration'),
        totalDuration: response.headers.get('X-Total-Duration'),
        requestId: response.headers.get('X-Request-ID'),
        etag: response.headers.get('ETag'),
        cacheAge: response.headers.get('Age'),
        edgeTtl: response.headers.get('X-Edge-TTL'),
      };

      // Determine cache status
      const isCacheHit = cacheHeaders.vercelCache === 'HIT';
      const isEdgeCached = cacheHeaders.edgeCache === 'enabled';
      const isDirectAPI = cacheHeaders.dataSource === 'external-api' && cacheHeaders.apiDuration;

      console.group('🚀 Vercel Edge Cache Analysis');
      console.log('📊 Request Metrics:', {
        requestDuration: `${requestDuration}ms`,
        serverDuration: `${data.meta.duration}ms`,
        apiDuration: cacheHeaders.apiDuration ? `${cacheHeaders.apiDuration}ms` : 'N/A (cached)',
        dataSource: data.meta.dataSource,
        requestId: cacheHeaders.requestId,
        freshMode: freshMode ? '🟢 ACTIVE' : '🔴 DISABLED',
      });

      console.log('🔄 Cache Status:', {
        vercelCacheStatus: cacheHeaders.vercelCache || 'NOT_SET',
        edgeCacheEnabled: isEdgeCached,
        isCacheHit: isCacheHit,
        isDirectAPICall: isDirectAPI,
        cacheAge: cacheHeaders.cacheAge ? `${cacheHeaders.cacheAge}s` : 'N/A',
        etag: cacheHeaders.etag,
      });

      console.log('⚙️ Cache Configuration:', {
        enabled: data.cache.enabled,
        ttl: `${data.cache.ttl}s`,
        staleTtl: `${data.cache.staleTtl}s`,
        tags: data.cache.tags.join(', '),
        bypass: data.cache.bypass,
      });

      if (isDirectAPI) {
        console.log('📡 API Call Details:', {
          attempts: data.meta.api.attempts || 1,
          success: data.meta.api.success,
          error: data.meta.api.error || 'None',
        });
      }

      console.log('📈 Performance Indicators:', {
        responseSpeed:
          requestDuration < 100 ? '🟢 Fast' : requestDuration < 500 ? '🟡 Medium' : '🔴 Slow',
        cacheEffectiveness: isCacheHit
          ? '🟢 Cache Hit'
          : isDirectAPI
          ? '🔴 API Call'
          : '🟡 Fallback',
        dataFreshness: data.meta.dataSource === 'external-api' ? '🟢 Fresh' : '🟡 Cached/Mock',
      });

      console.groupEnd();

      // Store metrics for display
      const metric: PerformanceMetric = {
        timestamp: new Date().toISOString(),
        page: data.pagination.currentPage,
        requestDuration,
        serverDuration: data.meta.duration,
        apiDuration: cacheHeaders.apiDuration ? parseInt(cacheHeaders.apiDuration) : null,
        cacheStatus: cacheHeaders.vercelCache || 'UNKNOWN',
        dataSource: data.meta.dataSource,
        isCacheHit,
        itemsReturned: data.data.data.length,
      };

      setPerformanceMetrics((prev) => [...prev.slice(-9), metric]);
    },
    [freshMode]
  ); // ← Add freshMode as dependency

  // Updated loadUsers function with proper state handling
  const loadUsers = useCallback(
    async (pageNum = 1, append = false, forceRefresh = false) => {
      setLoading(true);
      setError(null);

      const requestStart = Date.now();

      try {
        console.log(`🔄 Loading users from Vercel Edge API:`, {
          page: pageNum,
          append,
          forceRefresh,
          freshMode,
          timestamp: new Date().toISOString(),
        });

        // Build API URL with cache bypass parameters when needed
        let apiUrl = `/api/edge/users?page=${pageNum}&limit=12`;

        // Add cache bypass parameters when force refresh or fresh mode is active
        if (forceRefresh || freshMode) {
          apiUrl += `&nocache=true&revalidate=${Date.now()}`;
          console.log('🔄 EDGE: Force refresh enabled - cache bypass parameters added');
        }

        console.log('📡 EDGE: Making API call to:', apiUrl);

        const response = await fetch(apiUrl, {
          // Add no-cache headers when forcing refresh
          ...((forceRefresh || freshMode) && {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
          }),
        });

        const requestDuration = Date.now() - requestStart;

        // Log response headers for cache analysis
        console.log('📊 EDGE: Response received:', {
          status: response.status,
          statusText: response.statusText,
          duration: requestDuration + 'ms',
          headers: {
            vercelCache: response.headers.get('X-Vercel-Cache'),
            edgeCache: response.headers.get('X-Edge-Cache'),
            dataSource: response.headers.get('X-Data-Source'),
            totalDuration: response.headers.get('X-Total-Duration'),
            apiDuration: response.headers.get('X-API-Duration'),
            etag: response.headers.get('ETag'),
          },
        });

        if (!response.ok) {
          throw new Error(`Edge API failed: ${response.status}: ${response.statusText}`);
        }

        const result: ApiResponse = await response.json();

        // Perform cache analysis and logging
        logCacheAnalysis(response, result, requestStart);

        console.log('📋 EDGE: API Result received:', {
          success: result.success,
          dataLength: result.data?.data?.length,
          pagination: result.pagination,
          cacheInfo: result.cache,
          meta: result.meta,
        });

        if (result.success && result.data?.data) {
          const newUsers = result.data.data;

          // Update users state with proper handling
          setUsers((prevUsers) => {
            const updatedUsers = append ? [...prevUsers, ...newUsers] : newUsers;

            console.log('✅ EDGE: Users state updated:', {
              newUsersCount: newUsers.length,
              previousUsersCount: prevUsers.length,
              totalUsersNow: updatedUsers.length,
              hasMore: newUsers.length === 12,
              append,
            });

            return updatedUsers;
          });

          setHasMore(newUsers.length === 12);
          setCacheInfo(result.cache);
        } else {
          throw new Error('Invalid Edge API response structure');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('❌ EDGE: Failed to load users:', {
          error: errorMessage,
          page: pageNum,
          append,
          forceRefresh,
          freshMode,
          duration: Date.now() - requestStart + 'ms',
        });
        setError(errorMessage);
      } finally {
        setLoading(false);
        console.log('🏁 EDGE: Request completed:', {
          page: pageNum,
          totalDuration: Date.now() - requestStart + 'ms',
        });
      }
    },
    [freshMode]
  ); // ← Removed users.length from dependencies

  useEffect(() => {
    loadUsers(1, false);
    // No return value needed here
  }, [loadUsers]);

  // Updated handleLoadMore with fresh mode support
  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);

      console.log('📄 EDGE: Load More clicked:', {
        nextPage,
        freshMode,
        currentUsers: users.length,
      });

      // Use fresh mode if we recently refreshed
      loadUsers(nextPage, true, freshMode);
    }
  };

  // Updated handleRefresh function - unified refresh functionality
  const handleRefresh = async () => {
    console.log('🔄 EDGE: Refresh button clicked - ENABLING FRESH MODE!');
    console.log('📊 EDGE: Current state before refresh:', {
      currentUsers: users.length,
      currentPage: page,
      hasError: !!error,
      isLoading: loading,
    });

    setLoading(true);
    setPage(1);
    setError(null);
    setFreshMode(true); // Enable fresh mode
    setPerformanceMetrics([]); // Clear metrics on refresh

    try {
      // Clear cache for multiple pages (adjust range as needed)
      const pagesToClear = [1, 2, 3, 4, 5];
      const clearPromises = pagesToClear.map((pageNum) =>
        fetch(`/api/edge/users?page=${pageNum}&limit=12&nocache=true&revalidate=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        })
      );

      console.log(`🧹 EDGE: Clearing cache for pages: ${pagesToClear.join(', ')}`);

      // Wait for all cache clearing requests
      await Promise.all(clearPromises);

      console.log('✅ EDGE: All page caches cleared, loading fresh page 1');

      // Clear current users and load fresh page 1 data
      setUsers([]);
      await loadUsers(1, false, true);
    } catch (error) {
      console.error('❌ EDGE: Failed to clear all caches:', error);
      // Fallback: still try to refresh page 1
      setUsers([]);
      loadUsers(1, false, true);
    } finally {
      setLoading(false);
    }
  };

  // Auto-disable fresh mode after 5 minutes
  useEffect(() => {
    if (!freshMode) return; // Early return when freshMode is false

    const timer = setTimeout(() => {
      console.log('⏰ EDGE: Auto-disabling fresh mode after 5 minutes');
      setFreshMode(false);
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearTimeout(timer);
  }, [freshMode]);

  const getFullName = (user: User) => {
    return `${user.firstName} ${user.lastName}`;
  };

  const getInitials = (user: User) => {
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  // Group users into rows of 3
  const groupUsersIntoRows = (usersList: User[]) => {
    const rows = [];
    for (let i = 0; i < usersList.length; i += 3) {
      rows.push(usersList.slice(i, i + 3));
    }
    return rows;
  };

  const userRows = groupUsersIntoRows(users);

  return (
    <div className="users-directory-vercel-edge">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-center mb-4">Users Directory (Vercel Edge)</h1>
          <p className="text-gray-600 text-center text-lg">
            Connect with our team members - Powered by Vercel Edge Cache & Enhanced Logging
          </p>
        </div>

        {/* Vercel Edge Cache Status */}
        {cacheInfo && (
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
            <h3 className="font-medium text-green-800 mb-3">🚀 Vercel Edge Cache Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="bg-white p-2 rounded">
                <strong className="text-green-700">Status:</strong>
                <br />
                <span className={cacheInfo.enabled ? 'text-green-600' : 'text-red-600'}>
                  {cacheInfo.enabled ? '✅ Enabled' : '❌ Disabled'}
                </span>
              </div>
              <div className="bg-white p-2 rounded">
                <strong className="text-blue-700">TTL:</strong>
                <br />
                <span className="text-blue-600">{cacheInfo.ttl}s</span>
              </div>
              <div className="bg-white p-2 rounded">
                <strong className="text-purple-700">Stale TTL:</strong>
                <br />
                <span className="text-purple-600">{cacheInfo.staleTtl}s</span>
              </div>
              <div className="bg-white p-2 rounded">
                <strong className="text-orange-700">Tags:</strong>
                <br />
                <span className="text-orange-600 text-xs">{cacheInfo.tags?.join(', ')}</span>
              </div>
              <div className="bg-white p-2 rounded">
                <strong className="text-red-700">Bypass:</strong>
                <br />
                <span className={cacheInfo.bypass ? 'text-red-600' : 'text-green-600'}>
                  {cacheInfo.bypass ? '🔴 Active' : '✅ Normal'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Performance Metrics Dashboard */}
        {performanceMetrics.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-800 mb-3">
              📊 Performance Metrics (Last {performanceMetrics.length} Requests)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left">Time</th>
                    <th className="p-2 text-left">Page</th>
                    <th className="p-2 text-left">Cache Status</th>
                    <th className="p-2 text-left">Data Source</th>
                    <th className="p-2 text-left">Request Time</th>
                    <th className="p-2 text-left">API Time</th>
                    <th className="p-2 text-left">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceMetrics.map((metric, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2 text-xs">
                        {new Date(metric.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-2">{metric.page}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            metric.isCacheHit
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {metric.cacheStatus}
                        </span>
                      </td>
                      <td className="p-2 text-xs">{metric.dataSource}</td>
                      <td className="p-2">
                        <span
                          className={`${
                            metric.requestDuration < 100
                              ? 'text-green-600'
                              : metric.requestDuration < 500
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {metric.requestDuration}ms
                        </span>
                      </td>
                      <td className="p-2">
                        {metric.apiDuration ? `${metric.apiDuration}ms` : 'N/A'}
                      </td>
                      <td className="p-2">{metric.itemsReturned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debug Controls - Enhanced */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">🛠️ Debug Controls & Information</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-sm text-blue-700">
              <div>
                <strong>Users loaded:</strong> {users.length}
              </div>
              <div>
                <strong>Current page:</strong> {page}
              </div>
              <div>
                <strong>Has more:</strong> {hasMore ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Loading:</strong> {loading ? 'Yes' : 'No'}
              </div>
            </div>
            <div className="text-sm text-blue-700">
              <div>
                <strong>Error:</strong> {error || 'None'}
              </div>
              <div>
                <strong>Fresh Mode:</strong> {freshMode ? '🟢 Active' : '🔴 Disabled'}
              </div>
              <div>
                <strong>Last Action:</strong> {loading ? 'Loading...' : 'Idle'}
              </div>
              <div>
                <strong>Component State:</strong> {users.length > 0 ? 'Ready' : 'Empty'}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed buttonAction"
              type="button"
            >
              {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-yellow-800 font-medium">⚠️ Vercel Edge API Issue</h3>
            <p className="text-yellow-700 mt-1">{error}</p>
            <p className="text-sm text-yellow-600 mt-2">
              Check browser console for detailed cache analysis logs.
            </p>
          </div>
        )}

        {/* Users Directory Component - Three Column Layout */}
        {userRows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="component component-spaced three-column-cta col-12 mb-8"
          >
            <div className="container">
              <div className="row">
                {row.map((user, colIndex) => (
                  <div
                    key={user.id}
                    className={`col-sm-12 col-lg-4 fade-section is-visible ${
                      colIndex < row.length ? '' : 'hidden'
                    }`}
                  >
                    <div className="content-wrapper bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 overflow-hidden">
                      {/* Profile Image */}
                      <div className="relative">
                        {user.picture ? (
                          <img
                            alt={`${user.firstName} ${user.lastName}`}
                            loading="lazy"
                            width="400"
                            height="400"
                            className="w-full h-64 object-cover"
                            src={user.picture}
                            style={{ color: 'transparent' }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              const fallbackDiv = document.createElement('div');
                              fallbackDiv.className =
                                'w-full h-64 bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center';
                              fallbackDiv.innerHTML = `<span class="text-white text-6xl font-bold">${getInitials(
                                user
                              )}</span>`;
                              target.parentNode?.replaceChild(fallbackDiv, target);
                            }}
                          />
                        ) : (
                          <div className="w-full h-64 bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
                            <span className="text-white text-6xl font-bold">
                              {getInitials(user)}
                            </span>
                          </div>
                        )}

                        {/* User ID Overlay */}
                        <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white text-xs px-3 py-1 rounded-full font-mono">
                          {user.id}
                        </div>

                        {/* Edge Cache Indicator */}
                        <div
                          className={`absolute top-4 right-4 text-white text-xs px-2 py-1 rounded-full ${
                            freshMode ? 'bg-red-500 bg-opacity-90' : 'bg-green-500 bg-opacity-90'
                          }`}
                        >
                          {freshMode ? '🔥 Fresh' : '⚡ Edge'}
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-3 hover:text-green-600 transition-colors">
                          {getFullName(user)}
                        </h2>

                        <p className="text-gray-600 mb-2 text-sm leading-relaxed">
                          {user.jobTitle || 'Team Member'}
                        </p>

                        {user.department && (
                          <p className="text-gray-500 text-sm mb-2">🏢 {user.department}</p>
                        )}

                        {user.location && (
                          <p className="text-gray-500 text-sm mb-2">📍 {user.location}</p>
                        )}

                        {user.email && (
                          <p className="text-gray-500 text-sm mb-2">📧 {user.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Fill remaining columns if row has less than 3 users */}
                {row.length < 3 &&
                  Array.from({ length: 3 - row.length }).map((_, emptyIndex) => (
                    <div
                      key={`empty-${rowIndex}-${emptyIndex}`}
                      className="col-sm-12 col-lg-4"
                    ></div>
                  ))}
              </div>
            </div>
          </div>
        ))}

        {/* No Users Message */}
        {users.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No users available at the moment.</p>
          </div>
        )}

        {/* Loading and Load More Section */}
        <div className="text-center mt-12">
          {loading && (
            <div className="inline-flex items-center bg-white rounded-lg shadow-md px-6 py-4">
              <svg
                className="animate-spin -ml-1 mr-3 h-6 w-6 text-green-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-green-600 font-medium">
                Loading from Vercel Edge{freshMode ? ' (Fresh Mode)' : ''}...
              </span>
            </div>
          )}

          {!loading && hasMore && users.length > 0 && (
            <button
              onClick={handleLoadMore}
              className="button button-main bg-gradient-to-r from-green-600 to-blue-600 text-white text-lg font-medium rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 px-8 py-4"
            >
              Load More Team Members {freshMode ? '🔥' : '⚡'}
            </button>
          )}

          {!loading && !hasMore && users.length > 0 && (
            <div className="bg-gray-50 rounded-lg px-6 py-4 inline-block">
              <p className="text-gray-600">
                All team members loaded from Vercel Edge Cache {freshMode ? '🔥' : '⚡'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for Sitecore styling */}
      <style jsx>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 15px;
        }

        .row {
          display: flex;
          flex-wrap: wrap;
          margin: 0 -15px;
        }

        .col-sm-12 {
          width: 100%;
          padding: 0 15px;
        }

        @media (min-width: 992px) {
          .col-lg-4 {
            width: 33.333333%;
          }
        }

        @media (min-width: 768px) and (max-width: 991px) {
          .col-lg-4 {
            width: 50%;
          }
        }

        .component-spaced {
          margin-bottom: 2rem;
        }

        .fade-section {
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.6s ease;
        }

        .fade-section.is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .content-wrapper {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .button {
          display: inline-block;
          text-decoration: none;
          border: none;
          cursor: pointer;
          text-align: center;
          transition: all 0.3s ease;
        }

        .button-main {
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
          color: white;
          font-weight: 500;
        }

        .button-main:hover {
          background: linear-gradient(135deg, #059669 0%, #2563eb 100%);
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        }

        .buttonAction {
          background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%) !important;
        }
      `}</style>
    </div>
  );
};

export default UsersDirectoryEdge;
