import { getUserProjects } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

const statusLabels = {
  PLANNED: 'Planned',
  NARRATED: 'Narrated', 
  ALIGNED: 'Aligned',
  CUES_READY: 'Cues Ready',
  FRAMES_READY: 'Frames Ready',
  ASSEMBLED: 'Assembled'
};

const statusColors = {
  PLANNED: 'bg-blue-100 text-blue-800',
  NARRATED: 'bg-yellow-100 text-yellow-800',
  ALIGNED: 'bg-orange-100 text-orange-800', 
  CUES_READY: 'bg-purple-100 text-purple-800',
  FRAMES_READY: 'bg-pink-100 text-pink-800',
  ASSEMBLED: 'bg-green-100 text-green-800'
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Authentication required</h2>
        <p className="mt-2 text-gray-600">Please sign in to access your dashboard.</p>
      </div>
    );
  }

  const projects = await getUserProjects(user.clerkId);

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome, {user.firstName || user.email}!
        </h1>
        <p className="mt-2 text-gray-600">
          Create and manage your explainer video projects.
        </p>
      </div>

      {/* New Project Button */}
      <div className="mb-8">
        <Link
          href="/dashboard/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <svg
            className="-ml-1 mr-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          New Project
        </Link>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M34 40h10v-4a6 6 0 00-10.712-3.714M34 40H14m20 0v-4a9.971 9.971 0 00-.712-3.714M14 40H4v-4a6 6 0 0110.713-3.714M14 40v-4c0-1.313.253-2.566.713-3.714m0 0A10.003 10.003 0 0124 26c4.21 0 7.813 2.602 9.288 6.286M30 14a6 6 0 11-12 0 6 6 0 0112 0zm12 6a4 4 0 11-8 0 4 4 0 018 0zm-28 0a4 4 0 11-8 0 4 4 0 018 0z"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first explainer video project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="block group"
            >
              <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900 group-hover:text-indigo-600 truncate">
                      {project.topic}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[project.status as keyof typeof statusColors]
                      }`}
                    >
                      {statusLabels[project.status as keyof typeof statusLabels]}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-gray-500">
                    <span>
                      Updated {formatDistanceToNow(new Date(project.updatedAt))} ago
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-500">
                    Created {formatDistanceToNow(new Date(project.createdAt))} ago
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}