import React, { useState, useEffect } from 'react';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  picture?: string;
}

const UsersDirectoryComponent = (): JSX.Element => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadUsers = async (pageNum = 1, append = false) => {
    setLoading(true);
    setError(null);

    try {
      console.log(`Loading users - Page: ${pageNum}, Append: ${append}`);

      const response = await fetch(`/api/proxy/users?page=${pageNum}&limit=12`);

      if (!response.ok) {
        console.log('Users API failed, testing with test-api...');
        const testResponse = await fetch('/api/test-api');
        const testResult = await testResponse.json();
        console.log('Test API works:', testResult);

        throw new Error(`Users API failed: ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Users API Result:', result);

      if (result.success && result.data?.data) {
        const newUsers = result.data.data;
        setUsers((prev) => (append ? [...prev, ...newUsers] : newUsers));
        setHasMore(newUsers.length === 12);
      } else {
        throw new Error('Invalid API response structure');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load users:', errorMessage);
      setError(errorMessage);

      // For testing purposes, show mock data when API fails
      if (!append) {
        const mockUsers: User[] = Array.from({ length: 9 }, (_, i) => ({
          id: `mock-${pageNum}-${i}`,
          firstName: `TestFirst${i}`,
          lastName: `TestLast${i}`,
          email: `test${i}@example.com`,
          jobTitle: `Mock Job ${i}`,
          picture: `https://randomuser.me/api/portraits/med/men/${i + 10}.jpg`,
        }));
        setUsers(mockUsers);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1, false);
  }, []);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadUsers(nextPage, true);
    }
  };

  const handleRefresh = () => {
    setPage(1);
    setError(null);
    loadUsers(1, false);
  };

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
    <div className="users-directory">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-center mb-4">Users Directory</h1>
          <p className="text-gray-600 text-center text-lg">Connect with our team members</p>
        </div>

        {/* Debug Information - Keep for testing */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Debug Information:</h3>
          <ul className="text-sm text-blue-700 mb-3">
            <li>Users loaded: {users.length}</li>
            <li>Current page: {page}</li>
            <li>Has more: {hasMore ? 'Yes' : 'No'}</li>
            <li>Loading: {loading ? 'Yes' : 'No'}</li>
            <li>Error: {error || 'None'}</li>
          </ul>
          <div className="space-x-2">
            <a
              href="/api/test-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
            >
              Test API
            </a>
            <a
              href="/api/proxy/users"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Users API
            </a>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-yellow-800 font-medium">API Issue Detected</h3>
            <p className="text-yellow-700 mt-1">{error}</p>
            <p className="text-sm text-yellow-600 mt-2">
              Showing mock data for testing. Check the debug links above to test APIs directly.
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
                              // Fallback to initials if image fails to load
                              const target = e.target as HTMLImageElement;
                              const fallbackDiv = document.createElement('div');
                              fallbackDiv.className =
                                'w-full h-64 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center';
                              fallbackDiv.innerHTML = `<span class="text-white text-6xl font-bold">${getInitials(
                                user
                              )}</span>`;
                              target.parentNode?.replaceChild(fallbackDiv, target);
                            }}
                          />
                        ) : (
                          <div className="w-full h-64 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white text-6xl font-bold">
                              {getInitials(user)}
                            </span>
                          </div>
                        )}

                        {/* User ID Overlay */}
                        <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white text-xs px-3 py-1 rounded-full font-mono">
                          {user.id}
                        </div>
                      </div>

                      {/* Content Section */}
                      <div className="p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-3 hover:text-blue-600 transition-colors">
                          {getFullName(user)}
                        </h2>

                        <p className="text-gray-600 mb-4 text-sm leading-relaxed">
                          {user.jobTitle && user.jobTitle !== 'N/A' ? user.jobTitle : 'Team Member'}
                        </p>

                        <p className="text-gray-500 text-sm mb-6 truncate" title={user.email}>
                          {user.email}
                        </p>
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
                className="animate-spin -ml-1 mr-3 h-6 w-6 text-blue-500"
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
              <span className="text-blue-600 font-medium">Loading more users...</span>
            </div>
          )}

          {!loading && hasMore && users.length > 0 && (
            <button
              onClick={handleLoadMore}
              className="button button-main bg-gradient-to-r from-blue-600 to-purple-600 text-white text-lg font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 px-8 py-4"
            >
              Load More Team Members
            </button>
          )}

          {!loading && !hasMore && users.length > 0 && (
            <div className="bg-gray-50 rounded-lg px-6 py-4 inline-block">
              <p className="text-gray-600">All team members loaded</p>
            </div>
          )}
        </div>
      </div>

      {/* Custom CSS for Bootstrap-like grid and Sitecore styling */}
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
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          color: white;
          font-weight: 500;
        }

        .button-main:hover {
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
};

export default UsersDirectoryComponent;
